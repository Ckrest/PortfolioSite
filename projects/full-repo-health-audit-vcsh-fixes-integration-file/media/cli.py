#!/usr/bin/env python3
"""
Systems Registry CLI

Thin wrapper around the Systems Python API for registry operations.
"""

import argparse
import json
import os
import sys
import time

VERSION = "0.1.0"

_CONFIG_DEFAULTS = {
    "systems_root": "(derived from package location or $SYSTEMS_ROOT)",
    "registry_dir": "registry",
    "tier_dirs": ["ai", "desktop", "infra", "tools"],
    "traits_dir": "registry/traits",
}

_CONFIG_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "systems_root": {"type": "string", "description": "Root directory for Systems"},
        "registry_dir": {"type": "string", "description": "Registry directory relative to systems_root"},
        "tier_dirs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Package tier directories relative to systems_root",
        },
        "traits_dir": {"type": "string", "description": "Traits definition directory relative to systems_root"},
    },
    "additionalProperties": False,
}


def _emit_json(payload: dict):
    """Print JSON to stdout for introspection flags."""
    print(json.dumps(payload, indent=2, sort_keys=True))


def _handle_introspection(args) -> int | None:
    """Handle introspection flags, returning exit code or None to continue."""
    if getattr(args, "print_defaults", False):
        _emit_json(dict(_CONFIG_DEFAULTS))
        return 0

    if getattr(args, "print_config_schema", False):
        _emit_json(_CONFIG_SCHEMA)
        return 0

    if getattr(args, "validate_config", False):
        # Config is always valid (env-based, no config file)
        return 0

    if getattr(args, "print_resolved", False):
        from .paths import SYSTEMS_ROOT
        resolved = dict(_CONFIG_DEFAULTS)
        resolved["systems_root"] = str(SYSTEMS_ROOT)
        _emit_json(resolved)
        return 0

    return None

from .api import (
    list_packages,
    search_packages,
    get_package,
    validate_registry,
    validate_package,
    validate_all,
    create_package,
    update_package,
    list_types,
    list_entries,
    get_entry,
    search_entries,
    validate_entries,
    get_publishable_packages,
    get_publish_status,
    push_package,
    push_all,
    vcsh_sync,
    vcsh_audit,
    vcsh_status,
    list_traits,
    get_trait_definition,
    get_tag_vocabulary,
    get_tag_entries,
    list_atomics,
    get_atomic,
    execute_atomic,
    get_expected_files,
    get_setup_guide,
    get_pure_package_files,
    create_pure_package_preview,
    clear_pure_package_previews,
    validate_cross_package,
    get_overview,
    get_layout,
)


def format_package_list(packages: list[dict], verbose: bool = False) -> str:
    if not packages:
        return "No packages found."

    output = []
    for pkg in packages:
        state = pkg.get("state", "unknown")
        state_icon = {
            "ready": "[green]+[/green]",
            "draft": "[yellow]~[/yellow]",
            "disabled": "[dim]-[/dim]",
            "archived": "[dim]x[/dim]",
        }.get(state, "?")

        traits_str = ", ".join(pkg.get("traits", [])[:3]) if pkg.get("traits") else "-"
        if len(pkg.get("traits", [])) > 3:
            traits_str += f" (+{len(pkg['traits']) - 3})"

        desc = pkg.get("description", "")
        if len(desc) > 55:
            desc = desc[:52] + "..."

        output.append(f"{state_icon} {pkg['name']} [{pkg.get('tier', '?')}]")
        output.append(f"   {desc}")
        if verbose:
            output.append(f"   traits: {traits_str}")
            if pkg.get("tags"):
                output.append(f"   tags: {', '.join(pkg['tags'])}")
        output.append("")

    return "\n".join(output)


def format_package_detail(pkg: dict) -> str:
    if not pkg:
        return "Package not found."

    output = [
        f"# {pkg.get('name', 'Unknown')}",
        f"Tier: {pkg.get('tier', '?')}",
        f"State: {pkg.get('state', 'unknown')}",
        f"Path: {pkg.get('path', '?')}",
        "",
        "## Description",
        pkg.get("description", "No description"),
        "",
    ]

    if pkg.get("traits"):
        output.append("## Traits")
        output.append(", ".join(pkg["traits"]))
        output.append("")

    if pkg.get("tags"):
        output.append("## Tags")
        output.append(", ".join(pkg["tags"]))
        output.append("")

    if pkg.get("depends_on"):
        output.append("## Dependencies")
        for dep in pkg["depends_on"]:
            output.append(f"- {dep}")
        output.append("")

    return "\n".join(output)


def format_validation_results(results: dict) -> str:
    failed_pkgs = {}
    warning_pkgs = {}
    passed = 0

    for name, (valid, error_list, _duration) in results.items():
        pkg_errors = [e for e in error_list if not e.startswith("[warning]")]
        pkg_warnings = [e[10:] for e in error_list if e.startswith("[warning]")]
        if pkg_errors:
            failed_pkgs[name] = len(pkg_errors)
        elif pkg_warnings:
            warning_pkgs[name] = len(pkg_warnings)
        else:
            passed += 1

    total = len(results)
    output = [f"Validated {total} packages: {passed} passed, {len(failed_pkgs)} failed"]

    if failed_pkgs:
        output.append("")
        output.append("FAILED:")
        for name, count in failed_pkgs.items():
            label = "error" if count == 1 else "errors"
            output.append(f"  {name} ({count} {label})")

    if warning_pkgs:
        output.append("")
        output.append("WARNINGS:")
        for name, count in warning_pkgs.items():
            label = "warning" if count == 1 else "warnings"
            output.append(f"  {name} ({count} {label})")

    if not failed_pkgs and not warning_pkgs:
        output.append("All manifests valid!")

    if failed_pkgs or warning_pkgs:
        output.append("")
        output.append("Use --name <package> for full details.")

    return "\n".join(output)


def cmd_types(args) -> int:
    types = list_types()
    if args.text:
        for t in types:
            print(t)
        return 0
    print(json.dumps(types, indent=2))
    return 0


def cmd_entries(args) -> int:
    entries = list_entries(args.type)
    if args.text:
        if not entries:
            print("No entries found.")
            return 0
        for entry in entries:
            entry_id = entry.get("id", "?")
            title = entry.get("title", "")
            print(f"{entry_id} {('- ' + title) if title else ''}".rstrip())
        return 0
    print(json.dumps(entries, indent=2))
    return 0


def cmd_entry(args) -> int:
    entry = get_entry(args.type, args.id)
    if not entry:
        print(json.dumps({"error": "Entry not found."}))
        return 1
    print(json.dumps(entry, indent=2))
    return 0


def cmd_search_entries(args) -> int:
    entries = search_entries(args.type, args.query)
    if args.text:
        if not entries:
            print("No entries found.")
            return 0
        for entry in entries:
            entry_id = entry.get("id", "?")
            title = entry.get("title", "")
            print(f"{entry_id} {('- ' + title) if title else ''}".rstrip())
        return 0
    print(json.dumps(entries, indent=2))
    return 0


def cmd_validate_entries(args) -> int:
    result = validate_entries(args.type)
    if args.text:
        errors = result.get("errors", {})
        if not errors:
            print("All entries valid")
            return 0
        print("Validation errors:")
        for entry_id, entry_errors in errors.items():
            print(f"- {entry_id}")
            for err in entry_errors:
                print(f"  - {err}")
        return 1
    print(json.dumps(result, indent=2))
    return 0 if result.get("valid") else 1


def cmd_search(args) -> int:
    results = search_packages(args.query)

    if args.trait:
        results = [p for p in results if args.trait in p.get("traits", [])]
    if args.tier:
        results = [p for p in results if p.get("tier") == args.tier]
    if args.tag:
        results = [p for p in results if args.tag in p.get("tags", [])]

    if args.text:
        if not results:
            print(f"No packages found matching '{args.query}'.")
        else:
            print(f"Found {len(results)} package(s) matching '{args.query}':\n")
            print(format_package_list(results, verbose=True))
    else:
        print(json.dumps(results, indent=2))

    return 0


def cmd_list(args) -> int:
    packages = list_packages()

    if args.tier:
        packages = [p for p in packages if p.get("tier") == args.tier]
    if args.trait:
        packages = [p for p in packages if args.trait in p.get("traits", [])]
    if args.tag:
        packages = [p for p in packages if args.tag in p.get("tags", [])]
    if args.state:
        packages = [p for p in packages if p.get("state") == args.state]

    if args.text:
        by_tier = {}
        for pkg in packages:
            tier = pkg.get("tier", "unknown")
            if tier not in by_tier:
                by_tier[tier] = []
            by_tier[tier].append(pkg)

        output = []
        for tier_name in ["desktop", "ai", "infra", "tools"]:
            tier_pkgs = by_tier.get(tier_name, [])
            if not tier_pkgs:
                continue
            output.append(f"\n## {tier_name.upper()} ({len(tier_pkgs)})\n")
            output.append(format_package_list(tier_pkgs, verbose=args.verbose))

        print("\n".join(output) if output else "No packages found.")
    else:
        print(json.dumps(packages, indent=2))

    return 0


def cmd_get(args) -> int:
    pkg = get_package(args.name)

    if not pkg:
        all_packages = list_packages()
        similar = [p["name"] for p in all_packages if args.name.lower() in p["name"].lower()]
        if args.text:
            if similar:
                print(f"Package '{args.name}' not found. Did you mean: {', '.join(similar)}?")
            else:
                print(f"Package '{args.name}' not found.")
        else:
            print(json.dumps({"error": f"Package '{args.name}' not found.", "similar": similar}))
        return 1

    if args.text:
        print(format_package_detail(pkg))
    else:
        print(json.dumps(pkg, indent=2))

    return 0


def cmd_validate(args) -> int:
    if args.name:
        valid, errors = validate_package(args.name)
        if args.text:
            if valid:
                print(f"{args.name}: Valid")
            else:
                print(f"{args.name}: Invalid")
                for error in errors:
                    print(f"  - {error}")
        else:
            print(json.dumps({"name": args.name, "valid": valid, "errors": errors}))
        return 0 if valid else 1

    # Registry integrity gate (runs before all-packages validation)
    reg_valid, reg_errors = validate_registry()
    if not reg_valid:
        if args.text:
            print("Registry integrity errors:")
            for error in reg_errors:
                print(f"  - {error}")
            print("\nFix registry issues before validating packages.")
        else:
            print(json.dumps({
                "registry": {"valid": False, "errors": reg_errors},
                "packages": {}
            }, indent=2))
        return 1

    t0 = time.monotonic()
    results = validate_all()
    cross_pkg = validate_cross_package()
    total_duration = round(time.monotonic() - t0, 3)

    if args.text:
        print(format_validation_results(results))
        if cross_pkg["errors"]:
            print("\nCross-package issues:")
            for err in cross_pkg["errors"]:
                print(f"  - {err}")
        print(f"\nTotal time: {total_duration:.1f}s")
    elif args.full:
        output = {
            "registry": {"valid": True, "errors": []},
            "total_duration_s": total_duration,
            "packages": {},
            "cross_package": cross_pkg,
        }
        for name, (valid, error_list, duration) in results.items():
            output["packages"][name] = {"valid": valid, "errors": error_list, "duration_s": duration}
        print(json.dumps(output, indent=2))
    else:
        # Default JSON: compact summary with counts only
        total_errors = 0
        total_warnings = 0
        packages = {}
        for name, (valid, error_list, duration) in results.items():
            pkg_errors = sum(1 for e in error_list if not e.startswith("[warning]"))
            pkg_warnings = sum(1 for e in error_list if e.startswith("[warning]"))
            total_errors += pkg_errors
            total_warnings += pkg_warnings
            packages[name] = {"valid": valid, "errors": pkg_errors, "warnings": pkg_warnings, "duration_s": duration}
        valid_count = sum(1 for v, _, _d in results.values() if v)
        output = {
            "registry": {"valid": True, "errors": []},
            "total": len(results),
            "valid": valid_count,
            "errors": total_errors,
            "warnings": total_warnings,
            "total_duration_s": total_duration,
            "packages": packages,
            "cross_package": cross_pkg,
        }
        print(json.dumps(output, indent=2))

    has_errors = any(
        not valid and any(not e.startswith("[warning]") for e in errors)
        for valid, errors, _d in results.values()
    )
    return 1 if has_errors else 0


def cmd_validate_filter(args) -> int:
    """List packages filtered by validation health."""
    results = validate_all()

    # Classify each package
    classified = []
    for name, (valid, error_list, _duration) in sorted(results.items()):
        pkg_errors = [e for e in error_list if not e.startswith("[warning]")]
        pkg_warnings = [e for e in error_list if e.startswith("[warning]")]
        classified.append({
            "name": name,
            "errors": len(pkg_errors),
            "warnings": len(pkg_warnings),
            "error_messages": pkg_errors,
            "warning_messages": pkg_warnings,
        })

    # Filter: --clean means 0 issues, --issues (or default) means has issues
    if args.clean:
        filtered = [p for p in classified if p["errors"] == 0 and p["warnings"] == 0]
    else:
        # --issues or default
        filtered = [p for p in classified if p["errors"] > 0 or p["warnings"] > 0]

    if args.text:
        label = "clean" if args.clean else "with issues"
        print(f"Packages {label}: {len(filtered)}/{len(classified)}")
        for p in filtered:
            parts = []
            if p["errors"]:
                parts.append(f"{p['errors']} errors")
            if p["warnings"]:
                parts.append(f"{p['warnings']} warnings")
            suffix = f"  ({', '.join(parts)})" if parts else ""
            print(f"  {p['name']}{suffix}")
            for msg in p["error_messages"]:
                print(f"    - {msg}")
            for msg in p["warning_messages"]:
                print(f"    - {msg}")
    else:
        print(json.dumps({
            "packages": filtered,
            "total": len(classified),
            "matched": len(filtered),
        }, indent=2))

    return 0


def cmd_create(args) -> int:
    traits = []
    if args.traits:
        traits = [t.strip() for t in args.traits.split(",") if t.strip()]

    result = create_package(
        name=args.name,
        tier=args.tier,
        description=args.description,
        traits=traits,
        template=args.template,
    )

    if args.text:
        if result.get("success"):
            print(result.get("message", "Package created"))
            print("\nFiles created:")
            for f in result.get("files_created", []):
                print(f"  - {f}")
            step = 1
            print("\nNext steps:")
            print(f"  {step}. cd {result['path']}")
            step += 1
            if "published" in traits:
                print(f"  {step}. Edit README.md with your project details")
                step += 1
                print(f"  {step}. Edit trait_published.yaml with your repo URL")
                step += 1
            print(f"  {step}. Implement your code in src/")
            step += 1
            print(f"  {step}. Run 'sysreg validate --name {args.name}' to check")
        else:
            print(f"Error: {result.get('error', 'Unknown error')}")
            return 1
    else:
        print(json.dumps(result, indent=2))

    return 0


def cmd_update(args) -> int:
    add_tags = [t.strip() for t in args.add_tags.split(",")] if args.add_tags else None
    add_traits = [t.strip() for t in args.add_traits.split(",")] if args.add_traits else None
    remove_tags = [t.strip() for t in args.remove_tags.split(",")] if args.remove_tags else None
    remove_traits = [t.strip() for t in args.remove_traits.split(",")] if args.remove_traits else None

    result = update_package(
        name=args.name,
        state=args.state,
        description=args.description,
        add_tags=add_tags,
        remove_tags=remove_tags,
        add_traits=add_traits,
        remove_traits=remove_traits,
    )

    if args.text:
        if result.get("success"):
            if result.get("changes"):
                print(result.get("message", "Package updated"))
            else:
                print("No changes specified.")
        else:
            print(f"Error: {result.get('error', 'Unknown error')}")
            return 1
    else:
        print(json.dumps(result, indent=2))

    return 0


def cmd_overview(args) -> int:
    data = get_overview()

    if args.text:
        total = data["total"]
        by_state = data["by_state"]
        state_parts = []
        for s in ["ready", "draft", "disabled", "archived"]:
            if by_state.get(s):
                state_parts.append(f"{by_state[s]} {s}")
        print(f"# Systems Overview")
        print(f"Packages: {total} ({', '.join(state_parts)})")

        tier_parts = []
        for tier, info in sorted(data["by_tier"].items()):
            tier_parts.append(f"{tier} ({info['count']})")
        print(f"Tiers: {', '.join(tier_parts)}")
        print(f"Traits: {data['traits_count']} defined")
        print(f"Tags: {data['tags_count']} in vocabulary")

        print(f"\n## Tiers")
        for tier, info in sorted(data["by_tier"].items()):
            print(f"  {tier + '/':<12} {info['description']} ({info['count']})")

        print(f"\n## Key Infrastructure")
        print(f"  Registry:  registry/ (schema, traits, vocabularies, decisions)")
        print(f"  Database:  database/ (PostgreSQL history tracking)")
        print(f"  Scripts:   scripts/ (admin, backup, launchers, maintenance, power)")
        print(f"  Events:    Redis pub/sub on systems.events channel")

        print(f"\nUse sysreg_list, sysreg_search, sysreg_get for package details.")
        return 0

    print(json.dumps(data, indent=2))
    return 0


def cmd_layout(args) -> int:
    data = get_layout()

    if args.text:
        print(f"Systems/")
        entries = data["entries"]
        for i, entry in enumerate(entries):
            is_last = (i == len(entries) - 1)
            connector = "└── " if is_last else "├── "
            name = entry["name"]
            desc = entry["description"]
            print(f"{connector}{name:<22} {desc}")
        return 0

    print(json.dumps(data, indent=2))
    return 0


def cmd_publish_status(args) -> int:
    if args.name:
        status = get_publish_status(args.name)
        if args.text:
            if "error" in status:
                print(f"Error: {status['error']}")
                return 1
            if not status.get("has_published_trait"):
                print(f"{args.name}: no published trait")
                return 0
            print(f"# {args.name}")
            print(f"  repository:  {status['repository']}")
            print(f"  vcsh repo:   {status['vcsh_repo'] or 'not found'}")
            print(f"  remote:      {status['remote_url'] or 'not configured'}")
            if status.get("remote_configured") and not status.get("remote_matches"):
                print(f"  WARNING:     remote URL does not match trait repository")
            print(f"  uncommitted: {'yes' if status.get('has_uncommitted') else 'no'}")
            print(f"  ahead:       {status.get('ahead', 0)} commit(s)")
        else:
            print(json.dumps(status, indent=2))
        return 0

    packages = get_publishable_packages()
    if args.text:
        if not packages:
            print("No publishable packages found.")
            return 0
        print(f"Found {len(packages)} publishable package(s):\n")
        for pkg in packages:
            remote_info = pkg.get("remote_url") or "no remote"
            vcsh_info = pkg["vcsh_repo"] or "no vcsh repo"
            print(f"  {pkg['name']}")
            print(f"    repo: {pkg['repository']}")
            print(f"    vcsh: {vcsh_info}  remote: {remote_info}")
            print()
    else:
        print(json.dumps(packages, indent=2))
    return 0


def cmd_publish_push(args) -> int:
    if args.name:
        result = push_package(args.name, dry_run=args.dry_run)
        if args.text:
            if result.get("success"):
                print(result["message"])
                for w in result.get("warnings", []):
                    print(f"  WARNING: {w}")
            else:
                print(f"Error: {result['message']}")
                return 1
            return 0
        print(json.dumps(result, indent=2))
        return 0 if result.get("success") else 1

    result = push_all(dry_run=args.dry_run)
    if args.text:
        for item in result.get("pushed", []):
            print(f"  + {item['name']}: {item['message']}")
        for item in result.get("failed", []):
            print(f"  x {item['name']}: {item['message']}")
        for item in result.get("skipped", []):
            print(f"  - {item['name']}: {item['reason']}")
        pushed = len(result.get("pushed", []))
        failed = len(result.get("failed", []))
        skipped = len(result.get("skipped", []))
        print(f"\nSummary: {pushed} pushed, {failed} failed, {skipped} skipped")
    else:
        print(json.dumps(result, indent=2))
    return 1 if len(result.get("failed", [])) > 0 else 0


def cmd_vcsh_sync(args) -> int:
    if args.audit:
        result = vcsh_audit(fix=args.fix)
        violations = result.get("violations", [])
        fixed = result.get("fixed", [])
        errors = result.get("errors", [])

        if args.text:
            if not violations:
                print("No vcsh systems ownership violations found.")
                return 0
            print(f"Found {len(violations)} file(s) wrongly tracked by vcsh systems:\n")
            for v in violations:
                print(f"  {v['package']}: {v['file']}")
            if fixed:
                print(f"\nFixed {len(fixed)} file(s) (removed from vcsh systems tracking)")
            if errors:
                print(f"\n{len(errors)} error(s):")
                for e in errors:
                    print(f"  {e['path']}: {e['error']}")
            if not args.fix and violations:
                print("\nRun with --fix to remove these files from vcsh systems tracking.")
        else:
            print(json.dumps(result, indent=2))
        return 1 if violations and not args.fix else 0

    result = vcsh_sync(apply=args.apply)
    untracked = result.get("untracked", [])
    added = result.get("added", [])
    errors = result.get("errors", [])
    excludes_updated = result.get("excludes_updated", False)

    if args.text:
        if not untracked and not excludes_updated:
            print("All systems-owned files are tracked. Excludes file is up to date.")
            return 0
        if untracked:
            print(f"Found {len(untracked)} systems-owned file(s) not tracked by vcsh systems:\n")
            for item in untracked:
                print(f"  {item['path']}  ({item['reason']})")
        if excludes_updated:
            print(f"\n~/.gitignore.d/systems {'updated' if args.apply else 'needs update'}")
        if added:
            print(f"\nAdded {len(added)} file(s) to vcsh systems tracking")
        if errors:
            print(f"\n{len(errors)} error(s):")
            for e in errors:
                print(f"  {e['path']}: {e['error']}")
        if not args.apply and (untracked or excludes_updated):
            print("\nRun with --apply to add files and update excludes.")
    else:
        print(json.dumps(result, indent=2, default=str))

    return 0


def cmd_vcsh_status(args) -> int:
    """Show vcsh commit status for a package."""
    result = vcsh_status(args.name)

    if "error" in result:
        print(f"Error: {result['error']}")
        return 1

    if args.text:
        repo_info = result.get("vcsh_repo") or "none"
        commits = "has commits" if result.get("has_commits") else "no commits"
        if not result.get("repo_exists"):
            commits = "no repo"
        print(f"Package: {result['package']} (vcsh repo: {repo_info}, {commits})")

        pkg_repo = result.get("package_repo", {})
        pkg_mod = pkg_repo.get("modified", [])
        pkg_new = pkg_repo.get("untracked", [])
        if pkg_mod or pkg_new:
            print(f"\nPackage repo changes:")
            for f in pkg_mod:
                print(f"  M {f}")
            for f in pkg_new:
                print(f"  ? {f}")
            if pkg_repo.get("add_command"):
                print(f"  -> {pkg_repo['add_command']}")

        sys_repo = result.get("systems_repo", {})
        sys_mod = sys_repo.get("modified", [])
        sys_new = sys_repo.get("untracked", [])
        if sys_mod or sys_new:
            print(f"\nSystems repo changes:")
            for f in sys_mod:
                print(f"  M {f}")
            for f in sys_new:
                print(f"  ? {f}")
            if sys_repo.get("add_command"):
                print(f"  -> {sys_repo['add_command']}")

        issues = result.get("issues", [])
        if issues:
            print(f"\nIssues:")
            for issue in issues:
                severity = issue.get("severity", "error")
                itype = issue.get("type", "unknown")
                files = issue.get("files", [])
                label = itype.replace("_", "-")
                print(f"  [{severity}] {label}: {', '.join(files)}")
                if issue.get("fix"):
                    print(f"  -> Fix: {issue['fix']}")

        if result.get("clean"):
            print(f"\nClean — nothing to commit.")

        return 0

    print(json.dumps(result, indent=2))
    return 0


def cmd_traits(args) -> int:
    traits = list_traits()
    if args.text:
        for t in traits:
            print(t)
        return 0
    print(json.dumps(traits, indent=2))
    return 0


def cmd_trait(args) -> int:
    definition = get_trait_definition(args.name)
    if not definition:
        if args.text:
            print(f"Trait '{args.name}' not found.")
        else:
            print(json.dumps({"error": f"Trait '{args.name}' not found."}))
        return 1

    if args.text:
        print(f"# {definition.get('name', args.name)}")
        if definition.get("description"):
            print(f"\n{definition['description']}")
        if definition.get("schema"):
            print("\n## Schema fields")
            for field, spec in definition["schema"].items():
                req = " (required)" if spec.get("required") else ""
                print(f"  {field}: {spec.get('type', '?')}{req}")
        if definition.get("root_files"):
            print("\n## Root files")
            for rf in definition["root_files"]:
                owner = rf.get("owner", "?")
                print(f"  {rf.get('path', '?')} [{owner}] - {rf.get('purpose', '')}")
        if definition.get("guidance"):
            print(f"\n## Guidance\n{definition['guidance']}")
        return 0
    print(json.dumps(definition, indent=2))
    return 0


def cmd_tags(args) -> int:
    if args.text:
        if args.verbose:
            entries = get_tag_entries()
            for entry in entries:
                print(f"{entry.get('name', '?')}")
                if entry.get("description"):
                    print(f"  {entry['description']}")
        else:
            tags = get_tag_vocabulary()
            for t in tags:
                print(t)
        return 0
    entries = get_tag_entries()
    print(json.dumps(entries, indent=2, default=str))
    return 0


def cmd_atomics(args) -> int:
    atomics = list_atomics()
    if args.text:
        if not atomics:
            print("No atomics found.")
            return 0
        for a in atomics:
            print(f"{a['id']}  {a.get('description', '')}")
        return 0
    print(json.dumps(atomics, indent=2))
    return 0


def cmd_atomic(args) -> int:
    if args.run or args.dry_run:
        params = {}
        if args.params:
            for pair in args.params.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    params[k.strip()] = v.strip()
        result = execute_atomic(args.id, params=params or None, dry_run=args.dry_run)
        if result.get("error"):
            if args.text:
                print(f"Error: {result['error']}")
            else:
                print(json.dumps(result, indent=2))
            return 1
        if args.text:
            for step in result.get("steps", []):
                status = step.get("status", "?")
                icon = {"success": "+", "failed": "x", "skipped": "-"}.get(status, "?")
                print(f"  [{icon}] {step.get('name', '?')}: {status}")
                if step.get("output"):
                    for line in step["output"].strip().splitlines():
                        print(f"      {line}")
            return 0
        print(json.dumps(result, indent=2))
        return 0

    definition = get_atomic(args.id)
    if not definition:
        if args.text:
            print(f"Atomic '{args.id}' not found.")
        else:
            print(json.dumps({"error": f"Atomic '{args.id}' not found."}))
        return 1
    if args.text:
        print(f"# {definition.get('id', args.id)}")
        if definition.get("description"):
            print(f"\n{definition['description']}")
        if definition.get("params"):
            print("\n## Parameters")
            for p in definition["params"]:
                req = " (required)" if p.get("required") else ""
                print(f"  {p.get('name', '?')}: {p.get('description', '')}{req}")
        if definition.get("steps"):
            print(f"\n## Steps ({len(definition['steps'])})")
            for i, s in enumerate(definition["steps"], 1):
                print(f"  {i}. {s.get('name', '?')}")
        return 0
    print(json.dumps(definition, indent=2))
    return 0


def cmd_expected_files(args) -> int:
    files = get_expected_files(args.name)
    if args.text:
        if not files:
            print(f"No expected files for '{args.name}'.")
            return 0
        by_owner = {}
        for f in files:
            owner = f.get("owner", "general")
            by_owner.setdefault(owner, []).append(f)
        order = ["systems", "package", "local"]
        for owner in order + [k for k in by_owner if k not in order]:
            group = by_owner.get(owner, [])
            if not group:
                continue
            print(f"\n## {owner} ({len(group)})")
            for f in group:
                trait = f.get("trait", "")
                purpose = f.get("purpose", "")
                suffix = f"  ({trait})" if trait else ""
                print(f"  {f.get('path', '?')}{suffix}")
                if purpose:
                    print(f"    {purpose}")
        return 0
    print(json.dumps(files, indent=2))
    return 0


def cmd_setup_guide(args) -> int:
    result = get_setup_guide(args.name)

    if "error" in result:
        if args.text:
            print(f"Error: {result['error']}")
        else:
            print(json.dumps(result, indent=2))
        return 1

    if args.text:
        print(f"# Setup Guide: {result['name']}")
        print(f"State: {result['state']}")
        print(f"Path: {result['path']}")

        traits = result.get("traits", [])
        guidance_list = result.get("guidance", [])
        print(f"\n## Traits ({len(traits)})")
        for entry in guidance_list:
            print(f"\n### {entry['trait']}")
            for line in entry["text"].splitlines():
                print(f"  {line}")

        files = result.get("files", {})
        present = files.get("present", [])
        missing = files.get("missing", [])
        if present or missing:
            print(f"\n## Files")
            if present:
                print(f"  Present: {', '.join(present)}")
            if missing:
                print(f"  Missing: {', '.join(missing)}")
        return 0

    print(json.dumps(result, indent=2))
    return 0


def cmd_pure_package(args) -> int:
    """Handle pure-package command."""
    if args.clear_all:
        result = clear_pure_package_previews()
        if args.text:
            print(result["message"])
        else:
            print(json.dumps(result, indent=2))
        return 0

    if not args.name:
        print("Error: package name is required (unless using --clear-all)")
        return 1

    if args.create:
        result = create_pure_package_preview(args.name, args.output)
    else:
        result = get_pure_package_files(args.name)

    if "error" in result:
        print(f"Error: {result['error']}")
        return 1

    if args.text:
        if args.create:
            # Preview creation output
            print(f"Created pure package preview for {result['package']}")
            print(f"Location: {result['preview_path']}")
            print(f"Files copied: {result['files_copied']}")
            if result['systems_excluded']:
                print(f"\nSystems files excluded ({len(result['systems_excluded'])}):")
                for f in result['systems_excluded']:
                    print(f"  - {f}")
        else:
            # List mode output
            print(f"# Pure Package: {result['package']}")
            print(f"Path: {result['path']}\n")

            print(f"## Package-owned files ({result['summary']['package_count']})")
            for f in result['files']:
                print(f"  {f['relative_path']}")

            print(f"\n## Systems-owned files (excluded, {result['summary']['systems_count']})")
            for f in result['systems_files']:
                print(f"  {f['relative_path']} ({f['reason']})")

            print(f"\nSummary: {result['summary']['package_count']} package files, "
                  f"{result['summary']['systems_count']} systems files")
    else:
        print(json.dumps(result, indent=2, default=str))

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Systems Registry CLI - interface to the Systems Python API"
    )
    parser.add_argument("--text", action="store_true", help="Human-readable output")
    parser.add_argument("--version", action="version", version=f"systems {VERSION}")
    parser.add_argument("--print-defaults", action="store_true", help="Print default configuration as JSON and exit")
    parser.add_argument("--print-config-schema", action="store_true", help="Print configuration schema as JSON and exit")
    parser.add_argument("--validate-config", action="store_true", help="Validate configuration and exit")
    parser.add_argument("--print-resolved", action="store_true", help="Print resolved configuration as JSON and exit")

    subparsers = parser.add_subparsers(dest="command")

    search_parser = subparsers.add_parser("search", help="Search for packages")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--trait", nargs='?', help="Filter by trait")
    search_parser.add_argument("--tier", nargs='?', help="Filter by tier")
    search_parser.add_argument("--tag", nargs='?', help="Filter by tag")

    list_parser = subparsers.add_parser("list", help="List packages")
    list_parser.add_argument("--tier", nargs='?', help="Filter by tier")
    list_parser.add_argument("--trait", nargs='?', help="Filter by trait")
    list_parser.add_argument("--tag", nargs='?', help="Filter by tag")
    list_parser.add_argument("--state", nargs='?', help="Filter by state")
    list_parser.add_argument("-v", "--verbose", action="store_true", help="Show more details")

    get_parser = subparsers.add_parser("get", help="Get package details")
    get_parser.add_argument("name", help="Package name")

    validate_parser = subparsers.add_parser("validate", help="Validate packages")
    validate_parser.add_argument("--name", nargs='?', help="Validate specific package (default: all)")
    validate_parser.add_argument("--full", action="store_true", help="Show full error details (default: summary counts only)")

    vf_parser = subparsers.add_parser("validate-filter", help="List packages by validation status")
    vf_group = vf_parser.add_mutually_exclusive_group()
    vf_group.add_argument("--clean", action="store_true", help="Only packages with 0 errors and 0 warnings")
    vf_group.add_argument("--issues", action="store_true", help="Only packages with errors or warnings (default)")

    create_parser = subparsers.add_parser("create", help="Create a new package")
    create_parser.add_argument("name", help="Package name (lowercase, hyphens)")
    create_parser.add_argument("tier", choices=["desktop", "ai", "infra", "tools"], help="Tier")
    create_parser.add_argument("description", help="One-line description")
    create_parser.add_argument("--traits", help="Comma-separated traits")
    create_parser.add_argument(
        "--template",
        default="python-tool",
        choices=["python-tool", "python-service", "script"],
        help="Template to use",
    )

    update_parser = subparsers.add_parser("update", help="Update a package")
    update_parser.add_argument("name", help="Package name")
    update_parser.add_argument("--state", nargs='?', choices=["draft", "ready", "disabled", "archived"], help="New state")
    update_parser.add_argument("--description", nargs='?', help="New description")
    update_parser.add_argument("--add-tags", nargs='?', help="Comma-separated tags to add")
    update_parser.add_argument("--remove-tags", nargs='?', help="Comma-separated tags to remove")
    update_parser.add_argument("--add-traits", nargs='?', help="Comma-separated traits to add")
    update_parser.add_argument("--remove-traits", nargs='?', help="Comma-separated traits to remove")

    subparsers.add_parser("types", help="List registry types")

    entries_parser = subparsers.add_parser("entries", help="List entries for a registry type")
    entries_parser.add_argument("type", help="Type name")

    entry_parser = subparsers.add_parser("entry", help="Get a single entry")
    entry_parser.add_argument("type", help="Type name")
    entry_parser.add_argument("id", help="Entry id")

    search_entries_parser = subparsers.add_parser("search-entries", help="Search entries by type")
    search_entries_parser.add_argument("type", help="Type name")
    search_entries_parser.add_argument("query", help="Search query")

    validate_entries_parser = subparsers.add_parser("validate-entries", help="Validate entries for a type")
    validate_entries_parser.add_argument("type", help="Type name")

    subparsers.add_parser("overview", help="System dashboard with counts and structure")
    subparsers.add_parser("layout", help="Directory tree with annotations")

    publish_status_parser = subparsers.add_parser("publish-status", help="Show publish status")
    publish_status_parser.add_argument("--name", nargs="?", default=None, help="Check specific package (default: all)")

    publish_push_parser = subparsers.add_parser("publish-push", help="Push packages to remotes")
    publish_push_parser.add_argument("--name", help="Push specific package (default: all)")
    publish_push_parser.add_argument("--dry-run", action="store_true", help="Show what would happen without pushing")

    vcsh_sync_parser = subparsers.add_parser("vcsh-sync", help="Sync vcsh systems file tracking")
    vcsh_sync_parser.add_argument("--apply", action="store_true", help="Add files + regenerate excludes (default: dry-run)")
    vcsh_sync_parser.add_argument("--audit", action="store_true", help="Check for ownership violations")
    vcsh_sync_parser.add_argument("--fix", action="store_true", help="Remove violations from systems tracking (with --audit)")

    vcsh_status_parser = subparsers.add_parser("vcsh-status", help="Show vcsh commit status for a package")
    vcsh_status_parser.add_argument("name", help="Package name")

    subparsers.add_parser("traits", help="List all trait names")

    trait_parser = subparsers.add_parser("trait", help="Get trait definition")
    trait_parser.add_argument("name", help="Trait name")

    tags_parser = subparsers.add_parser("tags", help="List tag vocabulary")
    tags_parser.add_argument("-v", "--verbose", action="store_true", help="Show descriptions")

    subparsers.add_parser("atomics", help="List atomic procedures")

    atomic_parser = subparsers.add_parser("atomic", help="Get or execute an atomic procedure")
    atomic_parser.add_argument("id", help="Atomic id")
    atomic_parser.add_argument("--run", action="store_true", help="Execute the atomic")
    atomic_parser.add_argument("--dry-run", action="store_true", help="Show what would happen without executing")
    atomic_parser.add_argument("--params", help="Comma-separated key=value parameters")

    expected_files_parser = subparsers.add_parser("expected-files", help="Show expected files for a package")
    expected_files_parser.add_argument("name", help="Package name")

    setup_guide_parser = subparsers.add_parser("setup-guide", help="Show setup guidance based on package traits")
    setup_guide_parser.add_argument("name", help="Package name")

    pure_parser = subparsers.add_parser("pure-package", help="Preview package-only files (excludes systems files)")
    pure_parser.add_argument("name", nargs='?', help="Package name")
    pure_parser.add_argument("--create", action="store_true",
                            help="Create preview directory (deterministic path, auto-cleanup)")
    pure_parser.add_argument("--output", help="Output directory for --create")
    pure_parser.add_argument("--clear-all", action="store_true",
                            help="Remove all preview directories")

    args = parser.parse_args()

    result = _handle_introspection(args)
    if result is not None:
        return result

    if not args.command:
        parser.print_help()
        return 1

    commands = {
        "search": cmd_search,
        "list": cmd_list,
        "get": cmd_get,
        "validate": cmd_validate,
        "validate-filter": cmd_validate_filter,
        "create": cmd_create,
        "update": cmd_update,
        "overview": cmd_overview,
        "layout": cmd_layout,
        "types": cmd_types,
        "entries": cmd_entries,
        "entry": cmd_entry,
        "search-entries": cmd_search_entries,
        "validate-entries": cmd_validate_entries,
        "publish-status": cmd_publish_status,
        "publish-push": cmd_publish_push,
        "vcsh-sync": cmd_vcsh_sync,
        "vcsh-status": cmd_vcsh_status,
        "traits": cmd_traits,
        "trait": cmd_trait,
        "tags": cmd_tags,
        "atomics": cmd_atomics,
        "atomic": cmd_atomic,
        "expected-files": cmd_expected_files,
        "setup-guide": cmd_setup_guide,
        "pure-package": cmd_pure_package,
    }

    return commands[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
