"""
AI Relevance Assessment Module

Uses Ollama to assess whether artifacts are relevant to a work report.
- Text model for metadata-based assessment
- Vision model for image content analysis
"""

import base64
import json
import subprocess
from pathlib import Path
from typing import Optional


# Default models
TEXT_MODEL = "qwen2.5:0.5b"  # Fast, lightweight for metadata
VISION_MODEL = "qwen3-vl:8b"  # Vision model for images


def assess_relevance(
    artifact: dict,
    project: str,
    title: str,
    description: str = "",
    text_model: str = TEXT_MODEL,
    vision_model: str = VISION_MODEL,
) -> dict:
    """
    Assess artifact relevance to a work report.

    Args:
        artifact: Dict with file_path, file_type, metadata
        project: Project name
        title: Report title
        description: Report description

    Returns:
        Dict with relevance (0.0-1.0), reasoning (str)
    """
    file_path = Path(artifact['file_path'])
    file_type = artifact.get('file_type', 'unknown')

    # Build context about the report
    context = f"""Project: {project}
Title: {title}
Description: {description or 'Not provided'}"""

    if file_type == 'image' and file_path.exists():
        return _assess_image(file_path, context, vision_model)
    else:
        return _assess_metadata(artifact, context, text_model)


def _assess_image(file_path: Path, context: str, model: str) -> dict:
    """Use vision model to assess image relevance."""
    prompt = f"""You are assessing whether an image is relevant to documenting a piece of work.

Work Context:
{context}

Image: {file_path.name}

Look at this image and determine if it would be useful for documenting this work.

Respond with ONLY a JSON object (no markdown, no explanation):
{{"score": <0-100>, "reasoning": "<1 sentence explanation>"}}

Score guidelines:
- 90-100: Directly shows the work (UI, diagram, output)
- 70-89: Related to the work (tool screenshot, reference)
- 40-69: Possibly related but unclear
- 0-39: Unrelated (random image, different project)"""

    try:
        # Read and encode image
        with open(file_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')

        # Use API directly for vision models
        return _assess_image_via_api(file_path, context, model, image_data)

    except subprocess.TimeoutExpired:
        return {'relevance': 0.5, 'reasoning': "Vision model timed out (try a lighter model)"}
    except Exception as e:
        error_str = str(e)
        if len(error_str) > 100:
            error_str = error_str[:100] + "..."
        return {'relevance': 0.5, 'reasoning': f"Vision assessment failed: {error_str}"}


def _assess_image_via_api(file_path: Path, context: str, model: str, image_b64: str) -> dict:
    """Use Ollama API directly for image assessment."""
    import json
    import urllib.request

    prompt = f"""You are assessing whether this image is relevant to documenting a piece of work.

Work Context:
{context}

Image filename: {file_path.name}

Determine if this image would be useful for documenting this work.

Respond with ONLY a JSON object:
{{"score": <0-100>, "reasoning": "<1 sentence explanation>"}}"""

    try:
        payload = json.dumps({
            "model": model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False
        }).encode('utf-8')

        req = urllib.request.Request(
            'http://localhost:11434/api/generate',
            data=payload,
            headers={'Content-Type': 'application/json'}
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return _parse_response(result.get('response', ''))

    except Exception as e:
        error_str = str(e)
        if len(error_str) > 80:
            error_str = error_str[:80] + "..."
        return {'relevance': 0.5, 'reasoning': f"Vision model unavailable ({error_str})"}


def _assess_metadata(artifact: dict, context: str, model: str) -> dict:
    """Use text model to assess relevance from metadata."""
    file_path = Path(artifact['file_path'])
    metadata = artifact.get('metadata', {})

    prompt = f"""You are assessing whether a file is relevant to documenting a piece of work.

Work Context:
{context}

Artifact:
- Filename: {file_path.name}
- Type: {artifact.get('file_type', 'unknown')}
- Metadata: {json.dumps(metadata) if metadata else 'None'}

Based on the filename and metadata, determine if this file is likely relevant.

Respond with ONLY a JSON object (no markdown):
{{"score": <0-100>, "reasoning": "<1 sentence explanation>"}}"""

    try:
        result = subprocess.run(
            ['ollama', 'run', model, prompt],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return {'relevance': 0.5, 'reasoning': "Could not assess"}

        return _parse_response(result.stdout)

    except Exception as e:
        return {'relevance': 0.5, 'reasoning': f"Assessment failed: {e}"}


def _parse_response(text: str) -> dict:
    """Parse AI response to extract score and reasoning."""
    text = text.strip()

    # Try to find JSON in the response
    try:
        # Handle markdown code blocks
        if '```' in text:
            import re
            match = re.search(r'```(?:json)?\s*(\{[^`]+\})\s*```', text, re.DOTALL)
            if match:
                text = match.group(1)

        # Find JSON object
        start = text.find('{')
        end = text.rfind('}') + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            score = float(data.get('score', 50))
            reasoning = data.get('reasoning', 'No explanation provided')
            return {
                'relevance': score / 100.0,
                'reasoning': reasoning
            }
    except (json.JSONDecodeError, ValueError, KeyError):
        pass

    # Fallback: try to extract score from text
    import re
    score_match = re.search(r'(\d{1,3})\s*(?:/\s*100|%)?', text)
    if score_match:
        score = min(100, int(score_match.group(1)))
        return {
            'relevance': score / 100.0,
            'reasoning': text[:200]
        }

    return {'relevance': 0.5, 'reasoning': "Could not parse AI response"}


def batch_assess(
    artifacts: list[dict],
    project: str,
    title: str,
    description: str = "",
) -> list[dict]:
    """
    Assess relevance for multiple artifacts.

    Returns list of dicts with id, relevance, reasoning.
    """
    results = []
    for artifact in artifacts:
        assessment = assess_relevance(artifact, project, title, description)
        results.append({
            'id': artifact['id'],
            'relevance': assessment['relevance'],
            'reasoning': assessment['reasoning']
        })
    return results
