---
description: Analyze current branch changes and update CHANGELOG.md with a new entry
---

# Changelog Generator

Analyze the current branch changes and update CHANGELOG.md with a new entry.

## Instructions

1. **Get the current branch name** by running `git branch --show-current`

2. **Get the list of commits** on this branch that are not in `main`:
   - Run `git log main..HEAD --oneline --no-merges`
   - If no commits found, check `git diff main --stat` for uncommitted changes

3. **Analyze the changes** to determine:
   - What type of changes (features, fixes, refactors, etc.)
   - A short summary of each meaningful change
   - The appropriate version bump type (patch/minor/major)

4. **Read the current CHANGELOG.md** to understand the format and current version

5. **Generate a new changelog entry** with:
   - Today's date in format `YYYY-MM-DD`
   - The new version number (suggest based on change type)
   - Grouped changes by type (Added, Changed, Fixed, Removed)
   - Short, clear descriptions of each change

6. **Update CHANGELOG.md** by adding the new entry at the top (below the header)

7. **Report** what was added and suggest the version bump command to run

## Example Output Format

```markdown
## [0.2.0] - 2024-12-22

### Added
- User authentication flow with OAuth support
- Dashboard component with real-time data

### Changed
- Updated API client to use fetch instead of axios

### Fixed
- Fixed memory leak in WebSocket connection
```
