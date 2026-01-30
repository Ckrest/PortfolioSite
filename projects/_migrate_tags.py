#!/usr/bin/env python3
import os
import yaml
from pathlib import Path

PROJECTS_DIR = Path("/home/nick/Systems/tools/portfolio-site/projects")

def migrate_project(folder):
    settings_path = folder / "settings.yaml"
    if not settings_path.exists():
        return

    with open(settings_path, "r") as f:
        try:
            settings = yaml.safe_load(f)
        except yaml.YAMLError:
            print(f"Error parsing {settings_path}")
            return

    if not settings:
        return

    # Check if migration is needed
    tech = settings.get("technologies", [])
    built_with = settings.get("builtWith", [])
    
    if not tech and not built_with:
        return

    print(f"Migrating {folder.name}...")

    # Merge tags
    tags = set(settings.get("tags", []) or [])
    if tech:
        tags.update(tech)
    if built_with:
        tags.update(built_with)
    
    settings["tags"] = sorted(list(tags))
    
    # Remove old keys
    if "technologies" in settings:
        del settings["technologies"]
    if "builtWith" in settings:
        del settings["builtWith"]

    # Write back
    # Using the same logic as portfolio-editor to preserve "Title" header feel
    title = settings.get("title", "Project")
    header = f"# {title}\n\n"
    
    with open(settings_path, "w") as f:
        f.write(header)
        yaml.dump(
            settings,
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
            width=120,
        )

def main():
    for entry in PROJECTS_DIR.iterdir():
        if entry.is_dir() and not entry.name.startswith("_"):
            migrate_project(entry)

if __name__ == "__main__":
    main()
