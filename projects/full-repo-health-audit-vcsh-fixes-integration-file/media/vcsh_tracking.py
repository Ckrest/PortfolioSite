"""
Systems Registry - vcsh File Tracking Module

Manages the split between vcsh systems (integration metadata) and
per-package vcsh repos (publishable source). Provides:

- Violation detection: files wrongly tracked by vcsh systems
- Sync: ensure systems-owned files are tracked
- Excludes generation: auto-generate .gitignore.d/systems
"""

import logging
import subprocess
from pathlib import Path

from .discovery import PackageDiscovery, SYSTEMS_ROOT, TIER_DIRS
from .constants import IMPLICIT_SYSTEMS_PATTERNS, NO_REPO_IGNORE_PATTERNS
from .pattern_utils import matches_any_path
from .ownership import FileOwnership

logger = logging.getLogger(__name__)


def _vcsh_run(repo: str, args: list[str], timeout: int = 10) -> tuple[int, str]:
    """Run a vcsh command, return (returncode, stdout)."""
    cmd = ["vcsh", repo] + args
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=str(SYSTEMS_ROOT),
        )
        return result.returncode, result.stdout.strip()
    except FileNotFoundError:
        return -1, "vcsh not found"
    except subprocess.TimeoutExpired:
        return -1, "command timed out"


def _has_nested_git(rel_path: str) -> bool:
    """Check if path is inside a directory with its own .git (file or directory)."""
    candidate = SYSTEMS_ROOT / Path(rel_path).parent
    while candidate != SYSTEMS_ROOT:
        git_path = candidate / ".git"
        if git_path.exists():  # .git file (vcsh) OR directory (standalone)
            return True
        candidate = candidate.parent
    return False


def _add_via_plumbing(rel_path: str) -> tuple[bool, str]:
    """Add a file to vcsh systems index using git plumbing (bypasses nested .git)."""
    abs_path = str(SYSTEMS_ROOT / rel_path)
    # Step 1: write file content to object store
    rc, blob_hash = _vcsh_run("systems", ["hash-object", "-w", abs_path])
    if rc != 0 or not blob_hash:
        return False, f"hash-object failed: {blob_hash}"
    # Step 2: add index entry
    rc, output = _vcsh_run(
        "systems",
        ["update-index", "--add", "--cacheinfo", f"100644,{blob_hash},{rel_path}"],
    )
    if rc != 0:
        return False, f"update-index failed: {output}"
    return True, "added via plumbing"


def _get_systems_tracked_files(rel_path: str) -> list[str] | None:
    """Get files tracked by vcsh systems under a relative path.

    Returns list of relative-to-SYSTEMS_ROOT paths, or None if vcsh unavailable.
    """
    rc, output = _vcsh_run("systems", ["ls-files", rel_path])
    if rc != 0:
        return None
    return [line.strip() for line in output.splitlines() if line.strip()]


def find_double_tracked_files(discovery: PackageDiscovery, name: str = None) -> list[dict]:
    """Find systems-owned files wrongly tracked by package vcsh repos.

    This is the inverse of find_systems_violations(): instead of checking
    what systems tracks that it shouldn't, this checks what *package* repos
    track that they shouldn't (i.e., systems-owned files).

    Args:
        discovery: PackageDiscovery instance
        name: If specified, check only this package

    Returns list of dicts:
        - package: Package name
        - file: Filename relative to package root
        - pattern_matched: The systems pattern that matched
    """
    discovery._ensure_index()
    violations = []
    ownership = FileOwnership(discovery)

    packages = discovery.list_packages()
    if name:
        packages = [p for p in packages if p["name"] == name]

    for pkg_info in packages:
        pkg_name = pkg_info["name"]
        pkg = discovery.get_package(pkg_name)
        if not pkg:
            continue

        traits = pkg.get("manifest", {}).get("traits", [])

        # Skip packages that don't use the standard vcsh split
        skip_traits = {"no-repo", "standalone-git", "untracked"}
        if skip_traits & set(traits):
            continue

        # Check if this package has a vcsh repo
        rc, output = _vcsh_run(pkg_name, ["ls-files"], timeout=10)
        if rc != 0:
            continue  # No vcsh repo for this package

        tracked_files = [line.strip() for line in output.splitlines() if line.strip()]
        if not tracked_files:
            continue

        patterns = ownership.get_systems_file_patterns(pkg)

        for filepath in tracked_files:
            fpath = Path(filepath)
            for pattern in patterns:
                if matches_any_path(fpath, [pattern]):
                    violations.append({
                        "package": pkg_name,
                        "file": filepath,
                        "pattern_matched": pattern,
                    })
                    break

    return violations


def find_misplaced_trait_files(discovery: PackageDiscovery, name: str = None) -> list[dict]:
    """Find trait_*.yaml files not at package root.

    Trait files must be at the package root directory. Files in subdirectories
    are misplaced and will not be recognized by the registry.

    Args:
        discovery: PackageDiscovery instance
        name: If specified, check only this package

    Returns list of dicts:
        - package: Package name
        - path: Relative path of the misplaced file
        - expected_path: Where it should be (root-level)
    """
    discovery._ensure_index()
    misplaced = []

    packages = discovery.list_packages()
    if name:
        packages = [p for p in packages if p["name"] == name]

    for pkg_info in packages:
        pkg_name = pkg_info["name"]
        pkg = discovery.get_package(pkg_name)
        if not pkg:
            continue

        pkg_path = Path(pkg["path"])
        if not pkg_path.is_dir():
            continue

        # Find ALL trait_*.yaml files recursively
        for trait_file in pkg_path.rglob("trait_*.yaml"):
            # Skip root-level files (these are correct)
            if trait_file.parent == pkg_path:
                continue

            # Skip build artifacts and caches
            if any(part in NO_REPO_IGNORE_PATTERNS for part in trait_file.parts):
                continue

            rel_path = str(trait_file.relative_to(pkg_path))
            expected = trait_file.name  # Just the filename at root

            misplaced.append({
                "package": pkg_name,
                "path": rel_path,
                "expected_path": expected,
            })

    return misplaced


def get_vcsh_commit_status(discovery: PackageDiscovery, name: str) -> dict:
    """Get complete vcsh commit status for a package.

    Returns everything needed to commit: modified/untracked files grouped
    by target repo (package vs systems), ready-to-use add commands, and
    health issues with fix instructions.

    Args:
        discovery: PackageDiscovery instance
        name: Package name

    Returns dict with package info, repo status, file lists, and issues.
    """
    discovery._ensure_index()
    pkg = discovery.get_package(name)
    if not pkg:
        return {"error": f"Package '{name}' not found"}

    pkg_path = Path(pkg["path"])
    try:
        rel_path = str(pkg_path.relative_to(SYSTEMS_ROOT))
    except ValueError:
        return {"error": f"Package '{name}' is outside SYSTEMS_ROOT"}

    traits = pkg.get("manifest", {}).get("traits", [])
    skip_traits = {"no-repo", "standalone-git", "untracked"}
    has_vcsh = not (skip_traits & set(traits))

    ownership = FileOwnership(discovery)

    # Check if package vcsh repo exists and has commits
    repo_exists = False
    has_commits = False
    if has_vcsh:
        rc, output = _vcsh_run(name, ["rev-parse", "HEAD"], timeout=5)
        if rc == 0:
            repo_exists = True
            has_commits = True
        else:
            # Repo might exist but have no commits
            rc2, _ = _vcsh_run(name, ["ls-files"], timeout=5)
            repo_exists = rc2 == 0

    # --- Package repo changes ---
    pkg_modified = []
    pkg_untracked = []
    if repo_exists:
        # Modified files (tracked, changed)
        rc, output = _vcsh_run(name, ["diff", "--name-only"], timeout=10)
        if rc == 0 and output:
            pkg_modified = [f for f in output.splitlines() if f.strip()]

        # Also check staged but not committed (diff --cached)
        rc, output = _vcsh_run(name, ["diff", "--cached", "--name-only"], timeout=10)
        if rc == 0 and output:
            for f in output.splitlines():
                if f.strip() and f.strip() not in pkg_modified:
                    pkg_modified.append(f.strip())

        # Untracked files in package directory
        rc, output = _vcsh_run(
            name, ["ls-files", "--others", "--exclude-standard"],
            timeout=10,
        )
        if rc == 0 and output:
            pkg_untracked = [f for f in output.splitlines() if f.strip()]

    # Filter out systems-owned files from package repo results
    # (these shouldn't be in the package repo at all)
    pkg_modified_clean = []
    for f in pkg_modified:
        if not matches_any_path(Path(f), ownership.get_systems_file_patterns(pkg)):
            pkg_modified_clean.append(f)
    pkg_modified = pkg_modified_clean

    pkg_untracked_clean = []
    for f in pkg_untracked:
        if not matches_any_path(Path(f), ownership.get_systems_file_patterns(pkg)):
            pkg_untracked_clean.append(f)
    pkg_untracked = pkg_untracked_clean

    # Build package add command
    pkg_add_files = pkg_modified + pkg_untracked
    pkg_add_command = None
    if pkg_add_files:
        pkg_add_command = f"cd {pkg_path} && vcsh {name} add {' '.join(pkg_add_files)}"

    # --- Systems repo changes ---
    sys_modified = []
    sys_untracked = []

    # Modified systems files (tracked by systems, changed)
    rc, output = _vcsh_run("systems", ["diff", "--name-only", "--", rel_path], timeout=10)
    if rc == 0 and output:
        sys_modified = [f for f in output.splitlines() if f.strip()]

    # Also check staged
    rc, output = _vcsh_run("systems", ["diff", "--cached", "--name-only", "--", rel_path], timeout=10)
    if rc == 0 and output:
        for f in output.splitlines():
            if f.strip() and f.strip() not in sys_modified:
                sys_modified.append(f.strip())

    # Untracked systems files: compare disk files against tracked
    systems_patterns = ownership.get_systems_file_patterns(pkg)
    tracked_by_systems = _get_systems_tracked_files(rel_path) or []

    for pattern in systems_patterns:
        for file_path in pkg_path.glob(pattern):
            if file_path.is_file():
                tracked_path = str(file_path.relative_to(SYSTEMS_ROOT))
                if tracked_path not in tracked_by_systems and tracked_path not in sys_modified:
                    sys_untracked.append(tracked_path)

    # Build systems add command
    sys_add_files = sys_modified + sys_untracked
    sys_add_command = None
    if sys_add_files:
        sys_add_command = f"cd {SYSTEMS_ROOT} && vcsh systems add -f {' '.join(sys_add_files)}"

    # --- Health issues ---
    issues = []

    # Check for double-tracked files
    double_tracked = find_double_tracked_files(discovery, name=name)
    if double_tracked:
        dt_files = [r["file"] for r in double_tracked]
        issues.append({
            "type": "double_tracked",
            "severity": "error",
            "files": dt_files,
            "fix": f"vcsh {name} rm --cached {' '.join(dt_files)}",
        })

    # Check for misplaced trait files
    misplaced = find_misplaced_trait_files(discovery, name=name)
    if misplaced:
        issues.append({
            "type": "misplaced_trait_files",
            "severity": "error",
            "files": [r["path"] for r in misplaced],
            "fix": "Move trait files to package root directory",
        })

    # Determine if clean
    clean = (
        not pkg_modified and not pkg_untracked
        and not sys_modified and not sys_untracked
        and not issues
    )

    return {
        "package": name,
        "package_path": rel_path,
        "vcsh_repo": name if has_vcsh else None,
        "repo_exists": repo_exists,
        "has_commits": has_commits,
        "package_repo": {
            "modified": pkg_modified,
            "untracked": pkg_untracked,
            "add_command": pkg_add_command,
        },
        "systems_repo": {
            "modified": sys_modified,
            "untracked": sys_untracked,
            "add_command": sys_add_command,
        },
        "issues": issues,
        "clean": clean,
    }


def find_systems_violations(discovery: PackageDiscovery) -> list[dict]:
    """Find source files wrongly tracked by vcsh systems.

    For each package that uses vcsh (not no-repo, standalone-git, or untracked),
    checks that only systems-owned files are tracked by vcsh systems.

    Returns list of dicts:
        - package: Package name
        - path: Relative path of the violating file
        - file: Filename within the package
    """
    discovery._ensure_index()
    violations = []
    ownership = FileOwnership(discovery)

    for pkg_info in discovery.list_packages():
        name = pkg_info["name"]
        pkg = discovery.get_package(name)
        if not pkg:
            continue

        traits = pkg.get("manifest", {}).get("traits", [])

        # Skip packages that don't use the standard vcsh split
        skip_traits = {"no-repo", "untracked"}
        if skip_traits & set(traits):
            continue

        pkg_path = Path(pkg["path"])
        try:
            rel_path = str(pkg_path.relative_to(SYSTEMS_ROOT))
        except ValueError:
            continue

        tracked = _get_systems_tracked_files(rel_path)
        if tracked is None:
            continue  # vcsh unavailable

        allowed = ownership.get_systems_file_patterns(pkg)

        for filepath in tracked:
            try:
                rel = str(Path(filepath).relative_to(rel_path))
            except ValueError:
                continue
            if not matches_any_path(Path(rel), allowed):
                violations.append({
                    "package": name,
                    "path": filepath,
                    "file": rel,
                })

    return violations


def find_untracked_systems_files(discovery: PackageDiscovery) -> list[dict]:
    """Find systems-owned files that exist on disk but aren't tracked by vcsh systems.

    Checks manifest.yaml, NOTES.md, and trait_*.yaml for each package.
    Also checks trait-declared root_files with owner: systems.

    Returns list of dicts:
        - package: Package name
        - path: Relative path of the untracked file
        - reason: Why this file should be tracked
    """
    discovery._ensure_index()
    untracked = []

    # Get all files currently tracked by systems
    rc, output = _vcsh_run("systems", ["ls-files"])
    if rc != 0:
        logger.warning("Cannot list vcsh systems files: %s", output)
        return []
    all_tracked = set(output.splitlines())

    for pkg_info in discovery.list_packages():
        name = pkg_info["name"]
        pkg = discovery.get_package(name)
        if not pkg:
            continue

        traits = pkg.get("manifest", {}).get("traits", [])
        skip_traits = {"untracked"}
        if skip_traits & set(traits):
            continue

        pkg_path = Path(pkg["path"])
        try:
            rel_path = pkg_path.relative_to(SYSTEMS_ROOT)
        except ValueError:
            continue

        # no-repo packages: ALL files should be tracked by systems
        if "no-repo" in traits:
            if pkg_path.is_dir():
                for file_path in pkg_path.rglob("*"):
                    if file_path.is_dir():
                        continue
                    # Skip build artifacts and caches
                    if any(part in NO_REPO_IGNORE_PATTERNS for part in file_path.parts):
                        continue
                    if file_path.suffix in (".pyc", ".pyo"):
                        continue
                    tracked_path = str(file_path.relative_to(SYSTEMS_ROOT))
                    if tracked_path not in all_tracked:
                        untracked.append({
                            "package": name,
                            "path": tracked_path,
                            "reason": "All files in no-repo package",
                        })
            continue  # Skip the normal implicit-only checks

        # Check implicit systems files
        implicit_checks = [
            ("manifest.yaml", "Package identity file"),
            ("NOTES.md", "Integration notes"),
        ]
        for filename, reason in implicit_checks:
            full = pkg_path / filename
            tracked_path = str(rel_path / filename)
            if full.exists() and tracked_path not in all_tracked:
                untracked.append({
                    "package": name,
                    "path": tracked_path,
                    "reason": reason,
                })

        # Check trait_*.yaml files
        for trait in traits:
            filename = f"trait_{trait}.yaml"
            full = pkg_path / filename
            tracked_path = str(rel_path / filename)
            if full.exists() and tracked_path not in all_tracked:
                untracked.append({
                    "package": name,
                    "path": tracked_path,
                    "reason": f"Trait file for '{trait}'",
                })

        # Check trait-declared systems-owned files
        root_files = discovery.collect_root_files(traits)
        for rf in root_files:
            if rf.get("owner") != "systems":
                continue
            filename = rf["path"]
            full = pkg_path / filename
            tracked_path = str(rel_path / filename)
            if full.exists() and tracked_path not in all_tracked:
                untracked.append({
                    "package": name,
                    "path": tracked_path,
                    "reason": f"Systems-owned file from trait '{rf.get('trait', '?')}'",
                })

        # Check hooks.local/* files (Systems integration hooks)
        hooks_local = pkg_path / "hooks.local"
        if hooks_local.is_dir():
            for file_path in hooks_local.rglob("*"):
                if file_path.is_dir():
                    continue
                if any(part in NO_REPO_IGNORE_PATTERNS for part in file_path.parts):
                    continue
                if file_path.suffix in (".pyc", ".pyo"):
                    continue
                tracked_path = str(file_path.relative_to(SYSTEMS_ROOT))
                if tracked_path not in all_tracked:
                    untracked.append({
                        "package": name,
                        "path": tracked_path,
                        "reason": "Systems integration hook",
                    })

        # Check config.local.yaml (site-specific configuration)
        config_local = pkg_path / "config.local.yaml"
        if config_local.exists():
            tracked_path = str(config_local.relative_to(SYSTEMS_ROOT))
            if tracked_path not in all_tracked:
                untracked.append({
                    "package": name,
                    "path": tracked_path,
                    "reason": "Site configuration",
                })

    return untracked


def generate_systems_excludes(discovery: PackageDiscovery) -> str:
    """Generate content for ~/.gitignore.d/systems from registry data.

    The excludes file suppresses untracked-file noise from package directories
    in `vcsh systems status`. Systems-owned files in ignored directories are
    added via `vcsh systems add --force` by vcsh-sync.
    """
    discovery._ensure_index()

    lines = [
        "# Auto-generated by: sysreg vcsh-sync",
        "# Suppresses untracked noise from package directories.",
        "# Systems-owned files are added via --force by sysreg vcsh-sync.",
        "",
        "# Package directories (most have their own vcsh repos)",
    ]

    # Ignore all tier subdirectories
    for tier_name in sorted(TIER_DIRS.keys()):
        lines.append(f"{tier_name}/*/")

    lines.append("")
    lines.append("# infra/systems IS the registry — fully tracked")
    lines.append("!infra/systems/")
    lines.append("!infra/systems/**")

    # Un-ignore no-repo packages (all files tracked by systems)
    no_repo_pkgs = []
    for pkg_info in discovery.list_packages():
        traits = pkg_info.get("traits", [])
        if "no-repo" in traits:
            pkg = discovery.get_package(pkg_info["name"])
            if pkg:
                try:
                    rel = Path(pkg["path"]).relative_to(SYSTEMS_ROOT)
                    no_repo_pkgs.append(str(rel))
                except ValueError:
                    pass

    if no_repo_pkgs:
        lines.append("")
        lines.append("# no-repo packages (all files tracked by systems)")
        for pkg_rel in sorted(no_repo_pkgs):
            lines.append(f"!{pkg_rel}/")

    lines.append("")
    lines.append("# Other")
    lines.append("references/")
    lines.append(".claude/")
    lines.append("")

    return "\n".join(lines)


def sync_systems_files(
    discovery: PackageDiscovery,
    apply: bool = False,
) -> dict:
    """Ensure all systems-owned files are tracked by vcsh systems.

    Args:
        discovery: PackageDiscovery instance
        apply: If True, actually run vcsh add. If False, dry-run.

    Returns dict with:
        - untracked: Files that need tracking
        - added: Files that were added (if apply=True)
        - errors: Any errors encountered
        - excludes_updated: Whether .gitignore.d/systems was regenerated
    """
    untracked = find_untracked_systems_files(discovery)
    added = []
    errors = []

    if apply and untracked:
        for item in untracked:
            path = item["path"]
            if _has_nested_git(path):
                # git add silently fails for files inside nested .git dirs
                ok, msg = _add_via_plumbing(path)
                if ok:
                    item["method"] = "plumbing"
                    added.append(item)
                else:
                    errors.append({"path": path, "error": msg})
            else:
                rc, output = _vcsh_run(
                    "systems", ["add", "--force", path], timeout=10
                )
                if rc == 0:
                    item["method"] = "add"
                    added.append(item)
                else:
                    errors.append({"path": path, "error": output})

    # Regenerate excludes
    excludes_content = generate_systems_excludes(discovery)
    excludes_path = Path.home() / ".gitignore.d" / "systems"
    excludes_updated = False

    if apply:
        excludes_path.parent.mkdir(parents=True, exist_ok=True)
        current = ""
        if excludes_path.exists():
            current = excludes_path.read_text()
        if current != excludes_content:
            excludes_path.write_text(excludes_content)
            excludes_updated = True
    else:
        if excludes_path.exists():
            current = excludes_path.read_text()
            excludes_updated = current != excludes_content

    return {
        "untracked": untracked,
        "added": added,
        "errors": errors,
        "excludes_updated": excludes_updated,
        "excludes_preview": excludes_content if not apply else None,
    }


def audit_systems_tracking(
    discovery: PackageDiscovery,
    fix: bool = False,
) -> dict:
    """Audit vcsh systems for file ownership violations.

    Args:
        discovery: PackageDiscovery instance
        fix: If True, remove violations from vcsh systems tracking.

    Returns dict with:
        - violations: Files wrongly tracked by systems
        - fixed: Files removed from tracking (if fix=True)
        - errors: Any errors encountered
    """
    violations = find_systems_violations(discovery)
    fixed = []
    errors = []

    if fix and violations:
        for item in violations:
            rc, output = _vcsh_run(
                "systems", ["rm", "--cached", item["path"]], timeout=10
            )
            if rc == 0:
                fixed.append(item)
            else:
                errors.append({
                    "path": item["path"],
                    "error": output,
                })

    return {
        "violations": violations,
        "fixed": fixed,
        "errors": errors,
    }
