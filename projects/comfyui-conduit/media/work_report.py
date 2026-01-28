def parse_artifact(spec: str) -> dict:
    """Parse an artifact specification string.

    Formats:
        image:/path/to/file.png:"Optional caption"
        code:src/file.py:10-25:"Caption"
        terminal:/path/to/session.txt:"Caption"
        video:/path/to/demo.mp4:"Caption"
        doc:/path/to/spec.pdf:"Caption"
        data:/path/to/metrics.json:"Caption"

    For code artifacts, lines are extracted at capture time and stored
    in the 'content' field. Line numbers become metadata for provenance.
    """
    # Split on first colon to get type
    parts = spec.split(":", 1)
    if len(parts) < 2:
        raise ValueError(f"Invalid artifact spec (missing type): {spec}")

    art_type = parts[0].strip()
    if art_type not in ARTIFACT_TYPES:
        raise ValueError(f"Unknown artifact type '{art_type}'. Valid: {', '.join(sorted(ARTIFACT_TYPES))}")
