---
id: 0001-vcsh-architecture
type: decisions
---

# ADR-0001: vcsh Architecture for Multi-Repo Management

**Status:** Accepted
**Date:** 2026-01-18

## Context

The Systems repository contains multiple types of content with different distribution needs:

1. **Integration files** (manifests, NOTES.md, guides) - Systems-specific, should stay private
2. **Original package source code** - Standalone, should be publishable to GitHub independently
3. **Fork source code** - Has its own upstream git, we maintain patches

Using a single git repository creates problems:
- Publishing packages exposes Systems-specific metadata
- Can't push individual packages to their own GitHub repos
- Mixing integration and source tracking is confusing

Previous approach used `.gitignore` patterns to exclude package directories from Systems git, but this was fragile and hard to maintain.

## Decision

Use **vcsh** (version control system for $HOME) to manage multiple git repositories tracking different files in the same directory tree.

### Repository Structure

```
~/.config/vcsh/repo.d/           # Where git metadata lives
├── systems.git/                 # Integration files → github.com/Ckrest/systems-integration
├── screenshot-tool.git/         # Package source → github.com/Ckrest/screenshot-tool
└── diagram-tool.git/            # Another package → github.com/Ckrest/diagram-tool
```

### File Ownership

| File Type | Tracked By | Example |
|-----------|------------|---------|
| manifest.yaml | systems vcsh | `tools/screenshot-tool/manifest.yaml` |
| NOTES.md | systems vcsh | `tools/screenshot-tool/NOTES.md` |
| src/*.py | package vcsh | `tools/screenshot-tool/src/main.py` |
| README.md | package vcsh | `tools/screenshot-tool/README.md` |
| LICENSE | package vcsh | `tools/screenshot-tool/LICENSE` |

### Workflow

```bash
# Work on integration files (from SYSTEMS_ROOT — paths are relative to it)
vcsh systems add -f tools/package/manifest.yaml
vcsh systems commit -m "Update manifest"

# Work on package source (from package directory — paths are relative to it)
vcsh package-name add src/ README.md
vcsh package-name commit -m "Add feature"
vcsh package-name push
```

**Path rules:**
- Systems repo paths are relative to `$SYSTEMS_ROOT` (e.g., `tools/pkg/manifest.yaml`)
- Package repo paths are relative to the package directory (e.g., `src/main.py`)
- The `-f` flag is required for systems files (they live in gitignored package directories)
- Git resolves relative paths from CWD, not from `core.worktree` — always `cd` first
- `sysreg_vcsh_status(name)` generates copy-paste-safe commands with correct `cd` prefixes

## Consequences

### Benefits

- **Clean separation**: Integration files never leak to public repos
- **Independent publishing**: Each package can have its own GitHub repo
- **No gitignore gymnastics**: Files are tracked by the appropriate repo
- **Clear ownership**: Easy to see what repo tracks what file

### Drawbacks

- **Learning curve**: vcsh is less familiar than standard git
- **More repos to manage**: Each publishable package needs its own vcsh repo
- **Commit discipline**: Must remember which repo to use for which files

### Migration

Existing packages transition incrementally:
1. Integration files moved to systems vcsh
2. When package is ready for GitHub, create package vcsh repo
3. Add source files to package repo, push to GitHub
4. Update manifest with repository URL

## Automated Enforcement

File ownership is now enforced via the registry validation system and the `sysreg vcsh-sync` command.

### The `owner` Field

Trait `root_files` entries support an `owner` field encoding which vcsh repo should track the file:

| Owner | Meaning | Default when |
|-------|---------|-------------|
| `package` | Tracked by the package's own vcsh repo | `committed: true` without explicit owner |
| `systems` | Tracked by vcsh systems | Must be explicit |
| `local` | Not tracked by any repo (gitignored) | `committed: false` without explicit owner |

### Implicit Systems-Owned Files

Three file patterns are always systems-owned without needing `root_files` declarations:
- `manifest.yaml` — package identity
- `NOTES.md` — integration notes
- `trait_*.yaml` — trait configuration files

### Validation Rule: `base.vcsh_file_ownership`

The `vcsh_systems_file_ownership` check runs for every package (except those with `no-repo`, `standalone-git`, or `untracked` traits). It queries `vcsh systems ls-files` for the package directory and flags any file not in the allowed set (implicit + trait-declared `owner: systems`).

### The `sysreg vcsh-sync` Command

```bash
# Dry-run: show systems-owned files needing tracking
sysreg vcsh-sync

# Add files to vcsh systems + regenerate ~/.gitignore.d/systems
sysreg vcsh-sync --apply

# Audit: find source files wrongly tracked by systems
sysreg vcsh-sync --audit

# Fix: remove violations from systems tracking
sysreg vcsh-sync --audit --fix
```

The excludes file (`~/.gitignore.d/systems`) is auto-generated from registry data, replacing the previously manual file.

## Notes

- Forks keep their own .git (not vcsh) since they have upstream remotes
- The `vcsh status` command shows status across all repos
- Package vcsh repos only created when ready to publish - not required for all packages
