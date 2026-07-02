import type { LineRange } from "./types";

/** Leading-whitespace width of a line, or null for a blank line. */
function indentOf(line: string): number | null {
  if (line.trim() === "") return null;
  const m = /^[ \t]*/.exec(line);
  return m ? m[0].length : 0;
}

/**
 * Heuristic (indentation-based, stack-agnostic) enclosing block for `range`.
 * v1 limitation: in indentation-only languages (e.g. Python) it may include one
 * trailing sibling line; expand/collapse in the UI mitigates this.
 */
export function enclosingContext(lines: string[], range: LineRange): LineRange {
  const total = lines.length;
  const s = Math.max(1, range[0]);
  const e = Math.min(total, range[1]);

  // Target indent = min indent among non-blank lines in [s, e].
  let targetIndent = Infinity;
  for (let i = s; i <= e; i++) {
    const ind = indentOf(lines[i - 1]);
    if (ind !== null && ind < targetIndent) targetIndent = ind;
  }
  if (!Number.isFinite(targetIndent)) targetIndent = 0;

  // Header = nearest non-blank line above `s` with indent < targetIndent.
  let headerLine = 1;
  let headerIndent = 0;
  for (let i = s - 1; i >= 1; i--) {
    const ind = indentOf(lines[i - 1]);
    if (ind === null) continue;
    if (ind < targetIndent) {
      headerLine = i;
      headerIndent = ind;
      break;
    }
  }

  // Block end = nearest non-blank line below `e` with indent <= headerIndent.
  // Include it when it sits exactly at header indent (the closing `}` / `end`).
  let blockEnd = total;
  for (let j = e + 1; j <= total; j++) {
    const ind = indentOf(lines[j - 1]);
    if (ind === null) continue;
    if (ind <= headerIndent) {
      blockEnd = ind === headerIndent ? j : j - 1;
      break;
    }
  }

  return [Math.min(headerLine, s), Math.max(blockEnd, e)];
}
