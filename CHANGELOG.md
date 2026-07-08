# Changelog

## 1.0.2 — 2026-07-08

### Fixed
- CI builds the standalone server before running tests so the lifecycle end-to-end test can start it.

## 1.0.1 — 2026-07-07

### Security
- Handoff step paths are contained to the repo root (validation + reader guard).
- Every API route requires a per-run token; cross-origin feedback forgery is no longer possible.

### Fixed
- A stale `feedback.json` from a prior run can no longer be reported as this run's result.
- `SIGTERM`/`SIGHUP` now clean up the server and temp dir; a failed browser-open no longer kills the run.
- `/api/review` failures return actionable error messages, shown in the UI.
- Enclosing context is capped at ±200 lines (flat/generated files no longer freeze the tab).

### Added
- Review-checkpoint Stop hook: the agent is prompted to review at feature-complete checkpoints.
- Leftovers are inspectable and commentable, and must be acknowledged before Send.
- Review state persists across refreshes (sessionStorage) with an unload guard.
- CI (tests, typechecks, build, pack, version-sync gate).

## 1.0.0 — 2026-07-06

- Initial release: flow-sliced, blocking browser review for coding agents (npm CLI + Claude Code plugin).
