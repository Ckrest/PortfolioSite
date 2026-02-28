
    return artifact


# Binary artifact types that need file copy from source path
_BINARY_TYPES = {"image", "video", "doc"}


def _copy_artifact_to_store(artifact: dict, report_id: int) -> dict:
    """Copy an artifact's file into the per-report artifacts folder.

    Binary types (image, video, doc) are copied from their source path.
    Text types (code, terminal, data) write their content to a file.
    Returns a new artifact dict with src pointing to the artifacts folder.
    """
    report_dir = ARTIFACTS_DIR / str(report_id)
    report_dir.mkdir(parents=True, exist_ok=True)

    art_type = artifact["type"]
    src = Path(artifact.get("src", ""))
    updated = dict(artifact)

    if art_type in _BINARY_TYPES:
        # Copy binary file from original location
        if not src.is_file():
            print(f"  Warning: source file not found, skipping copy: {src}")
            return updated
        dest = _unique_dest(report_dir, src.name)
        shutil.copy2(src, dest)
        updated["src"] = str(dest)

    elif art_type == "code":
        # Write extracted code content to file
        filename = src.name if src.name else "snippet.txt"
        dest = _unique_dest(report_dir, filename)
        content = artifact.get("content", "")
        dest.write_text(content)
        updated["src"] = str(dest)

    elif art_type == "terminal":
        filename = src.name if src.name else "session.txt"
        dest = _unique_dest(report_dir, filename)
        content = artifact.get("content", "")
        dest.write_text(content)
        updated["src"] = str(dest)

    elif art_type == "data":
        filename = src.name if src.name else "data.json"
        dest = _unique_dest(report_dir, filename)
        content = artifact.get("content", {})
        dest.write_text(json.dumps(content, indent=2))
        updated["src"] = str(dest)

    return updated


def _unique_dest(directory: Path, filename: str) -> Path:
    """Return a unique file path in directory, adding numeric suffix on collision."""
    dest = directory / filename
    if not dest.exists():
        return dest
    stem = dest.stem
    suffix = dest.suffix
    counter = 1
    while dest.exists():
        dest = directory / f"{stem}-{counter}{suffix}"
        counter += 1
    return dest