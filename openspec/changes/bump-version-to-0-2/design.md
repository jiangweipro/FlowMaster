## Context

FlowMaster Dashboard is a VSCode extension published as `flowmaster-dashboard`. The current version is `0.1.0`. This change bumps it to `0.2.0` to mark the next milestone of development.

## Goals / Non-Goals

**Goals:**
- Update the version string in `package.json` from `0.1.0` to `0.2.0`
- Update the version string in `package-lock.json` from `0.1.0` to `0.2.0`

**Non-Goals:**
- No functional changes, dependency updates, or code changes
- No new features or bug fixes

## Decisions

- **Manual version bump vs `npm version`**: Using `npm version patch/minor/major` would auto-update and create a git tag. Since this is a minor version bump (0.1.0 → 0.2.0) and we want to control the tag separately, the version fields will be updated manually in both `package.json` and `package-lock.json`.

## Risks / Trade-offs

- **[Low] Mismatched lockfile**: If `package.json` is updated but `package-lock.json` is not, npm operations may warn. Mitigation: update both files simultaneously.
- **[Low] Git tag**: Ensure the git tag `v0.2.0` is created separately if needed for release tracking.