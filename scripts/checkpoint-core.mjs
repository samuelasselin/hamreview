import { createHash } from "node:crypto";

/**
 * Parse `git status --porcelain=v1 -z --untracked-files=all` output.
 * With -z, records are NUL-terminated and paths are never quoted. Rename/copy
 * records (X in {R,C}) carry an extra NUL-separated origin path, which we
 * consume and ignore (we key off the current/new path).
 */
export function parseStatus(porcelainZ) {
  const tokens = porcelainZ.split("\0").filter((t) => t.length > 0);
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i].slice(0, 2);
    const path = tokens[i].slice(3);
    entries.push({ status, path });
    if (status[0] === "R" || status[0] === "C") i++; // skip the origin path
  }
  return entries;
}

// The ham-review skill's own workflow writes these two contract files at the
// repo root of the TARGET repo it is reviewing (handoff.json as input,
// feedback.json as output). They are untracked there, so right after a
// review completes they'd otherwise flip the signature and re-trigger the
// checkpoint on the very files the skill itself produced. Filter them out
// by exact root path only — a nested `sub/handoff.json` is a real user file.
const ARTIFACT_PATHS = new Set(["handoff.json", "feedback.json"]);

/** Drop the ham-review skill's own contract files (repo-root exact match only). */
export function filterArtifacts(entries) {
  return entries.filter((e) => !ARTIFACT_PATHS.has(e.path));
}

/** Deterministic, order-independent signature of the working-tree changes. */
export function computeSignature(pairs) {
  const body = [...pairs]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((p) => `${p.path}\0${p.contentSha}`)
    .join("\n");
  return createHash("sha256").update(body).digest("hex");
}

/** Should the hook ask (block) for this state? */
export function decide(signature, lastAskedSignature) {
  if (!signature) return false;
  return signature !== lastAskedSignature;
}

/** Short human summary of changed files: up to 3, then "(+N more)". */
export function summarizeStatus(entries) {
  const shown = entries.slice(0, 3).map((e) => `${e.status.trim() || "?"} ${e.path}`);
  const extra = entries.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` (+${extra} more)` : "");
}

/** The instruction injected into the agent's context on a checkpoint. */
export function buildReason(summary) {
  return [
    "⚠ ham-review checkpoint — you're ending your turn with uncommitted, un-reviewed changes:",
    `  ${summary}`,
    "",
    "Before you stop, decide whether these form a COMPLETE, reviewable unit — a coherent",
    "feature or data-flow (e.g. an endpoint / use-case / component with its supporting",
    "layers), not a half-written change, a trivial tweak, or pure config/docs.",
    "  • If YES → invoke the ham-review skill now.",
    "  • If NO  → say in one line why it's not review-ready yet, then stop.",
    "",
    "You will not be asked again about this exact set of changes.",
  ].join("\n");
}
