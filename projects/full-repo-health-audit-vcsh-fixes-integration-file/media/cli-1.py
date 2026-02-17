#!/usr/bin/env python3
"""PDF processing and audio conversion CLI."""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    from .extract_pdf import extract_with_word_positions
except ImportError:
    from extract_pdf import extract_with_word_positions

# Systems API integration - get audio-tools path dynamically
try:
    from systems import ensure_importable, get_package_path
    # Ensure audio-tools is available if we're in a Systems environment
    ensure_importable("audio-tools")
    SYSTEMS_ROOT = None  # Not needed when using Systems API
except ImportError:
    # Fallback for standalone usage
    SYSTEMS_ROOT = os.environ.get("SYSTEMS_ROOT", os.path.expanduser("~/Systems"))
    def get_package_path(name):
        """Fallback package path resolution for non-Systems environments."""
        return Path(SYSTEMS_ROOT) / "tools" / name
    def ensure_importable(name):
        """No-op ensure_importable for non-Systems environments."""
        return True

PDF_OUTPUT = os.environ.get("PDF_OUTPUT", str(Path(__file__).resolve().parents[2] / "output"))


def _json_out(data):
    print(json.dumps(data))
    sys.exit(0)


def _run_text_to_audio(text_file, voice_file, seed):
    """Run text-to-audio via audio-tools CLI."""
    audio_tools_path = get_package_path("audio-tools")
    audio_cli = str(audio_tools_path / "src" / "cli.py")
    try:
        result = subprocess.run(
            [sys.executable, audio_cli, "text-to-audio",
             "--text-file", text_file,
             "--voice-file", voice_file,
             "--seed", str(seed)],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.stdout.strip():
            try:
                return json.loads(result.stdout.strip())
            except json.JSONDecodeError:
                pass
        return {"status": "error", "error": result.stderr.strip() or "Unknown error"}
    except Exception as e:
        return {"status": "error", "error": f"TTS failed: {e}"}


def scan_unmatched_pdfs(pdfs_folder):
    """Scan for PDF files without matching .txt files."""
    pdf_folder_path = Path(pdfs_folder)
    if not pdf_folder_path.exists():
        return []

    unmatched = []
    for pdf_file in pdf_folder_path.glob("*.pdf"):
        txt_file = pdf_folder_path / f"{pdf_file.stem}.txt"
        if not txt_file.exists():
            unmatched.append(pdf_file.name)
    return sorted(unmatched)


def do_pdf_to_audio(pdf_filename, pdfs_folder, voice_file, seed):
    """Process a single PDF to audio. Returns dict."""
    if pdfs_folder is None:
        pdfs_folder = PDF_OUTPUT

    if pdf_filename is None:
        unmatched = scan_unmatched_pdfs(pdfs_folder)
        if not unmatched:
            return {"action": "none", "message": "No PDFs without matching .txt files found"}
        if len(unmatched) == 1:
            return do_pdf_to_audio(unmatched[0], pdfs_folder, voice_file, seed)
        message = f"Found {len(unmatched)} unmatched PDFs. Please select:\n"
        message += "0 - Process ALL PDFs\n"
        for i, pdf in enumerate(unmatched, 1):
            message += f"{i} - {pdf}\n"
        return {
            "action": "select",
            "message": message.strip(),
            "unmatched_pdfs": unmatched,
            "count": len(unmatched)
        }

    pdf_path = Path(pdfs_folder) / pdf_filename
    if not pdf_path.exists():
        return {"status": "error", "error": f"PDF file not found: {pdf_path}"}

    try:
        text_content = extract_with_word_positions(str(pdf_path))
        if not text_content.strip():
            return {"status": "error", "error": "No text could be extracted. It might be scanned/image-based."}
    except Exception as e:
        return {"status": "error", "error": f"Failed to extract text: {e}"}

    text_filename = pdf_path.stem + ".txt"
    text_path = Path(pdfs_folder) / text_filename

    try:
        with open(text_path, 'w', encoding='utf-8') as f:
            f.write(text_content)
    except Exception as e:
        return {"status": "error", "error": f"Failed to save text file: {e}"}

    audio_result = _run_text_to_audio(str(text_path), voice_file, seed)

    return {
        "pdf_file": str(pdf_path),
        "text_file": str(text_path),
        "text_length": len(text_content),
        "audio_generation": audio_result
    }


def cmd_pdf_to_audio(args):
    pdf_filename = args.pdf_filename if args.pdf_filename else None
    pdfs_folder = args.pdfs_folder if args.pdfs_folder else None
    result = do_pdf_to_audio(pdf_filename, pdfs_folder, args.voice_file, args.seed)
    _json_out(result)


def cmd_pdf_to_audio_batch(args):
    pdf_filenames_raw = args.pdf_filenames
    # Accept JSON array or comma-separated
    try:
        pdf_filenames = json.loads(pdf_filenames_raw)
    except (json.JSONDecodeError, TypeError):
        pdf_filenames = [f.strip() for f in pdf_filenames_raw.split(",") if f.strip()]

    pdfs_folder = args.pdfs_folder if args.pdfs_folder else None
    results = {"processed": [], "failed": [], "total": len(pdf_filenames)}

    for pdf_filename in pdf_filenames:
        result = do_pdf_to_audio(pdf_filename, pdfs_folder, args.voice_file, args.seed)
        if "error" in result:
            results["failed"].append({"filename": pdf_filename, "error": result["error"]})
        else:
            results["processed"].append({
                "filename": pdf_filename,
                "text_file": result.get("text_file"),
                "text_length": result.get("text_length")
            })

    _json_out(results)


def main():
    parser = argparse.ArgumentParser(description="PDF tools CLI")
    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("pdf-to-audio")
    p.add_argument("--pdf-filename", default=None)
    p.add_argument("--pdfs-folder", default=None)
    p.add_argument("--voice-file", default="FemaleVoice.wav")
    p.add_argument("--seed", type=int, default=2219471745)

    p = sub.add_parser("pdf-to-audio-batch")
    p.add_argument("--pdf-filenames", required=True)
    p.add_argument("--pdfs-folder", default=None)
    p.add_argument("--voice-file", default="FemaleVoice.wav")
    p.add_argument("--seed", type=int, default=2219471745)

    args = parser.parse_args()
    cmd_map = {
        "pdf-to-audio": cmd_pdf_to_audio,
        "pdf-to-audio-batch": cmd_pdf_to_audio_batch,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
