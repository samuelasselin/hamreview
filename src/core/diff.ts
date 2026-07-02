export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileDiff {
  /** New path; for deleted files this is the old path. */
  path: string;
  status: FileStatus;
  oldPath?: string;
  /** 1-indexed line numbers in the NEW file that were added. */
  addedLines: number[];
}

export interface Diff {
  files: FileDiff[];
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function strip(p: string): string {
  return p.replace(/^[ab]\//, "");
}

/**
 * Parse a standard unified `git diff` into per-file added NEW-file line numbers.
 * Expects default `a/`/`b/` prefixes, unquoted paths, and no color. Plan 2's git
 * invoker must produce diffs in this shape (use `--no-color`, default prefixes).
 */
export function parseUnifiedDiff(raw: string): Diff {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let newLineNo = 0; // 0 means "not inside a hunk yet"

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) {
      if (cur) files.push(cur);
      cur = { path: "", status: "modified", addedLines: [] };
      newLineNo = 0;
      continue;
    }
    if (!cur) continue;

    // File-header lines only appear before the first hunk (newLineNo === 0).
    // Guarding on that prevents a hunk-body content line beginning with "+++ "
    // or "--- " (an added/removed line whose text starts with "++ "/"-- ") from
    // being misread as a file header, which would desync new-file line numbers.
    if (newLineNo === 0) {
      if (line.startsWith("new file mode")) { cur.status = "added"; continue; }
      if (line.startsWith("deleted file mode")) { cur.status = "deleted"; continue; }
      if (line.startsWith("rename from ")) {
        cur.status = "renamed";
        cur.oldPath = strip(line.slice("rename from ".length).trim());
        continue;
      }
      if (line.startsWith("rename to ")) {
        cur.status = "renamed";
        cur.path = strip(line.slice("rename to ".length).trim());
        continue;
      }
      if (line.startsWith("--- ")) {
        const p = line.slice(4).trim();
        if (p !== "/dev/null") cur.oldPath = strip(p);
        continue;
      }
      if (line.startsWith("+++ ")) {
        const p = line.slice(4).trim();
        if (p === "/dev/null") {
          cur.status = "deleted";
          if (cur.oldPath) cur.path = cur.oldPath;
        } else {
          cur.path = strip(p);
        }
        continue;
      }
    }

    const hunk = HUNK.exec(line);
    if (hunk) { newLineNo = Number(hunk[1]); continue; }
    if (newLineNo === 0) continue;

    if (line.startsWith("+")) { cur.addedLines.push(newLineNo); newLineNo++; continue; }
    if (line.startsWith("-")) continue; // deletion: no new-file line
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith(" ")) { newLineNo++; continue; } // context line (incl. blank " ")
  }

  if (cur) files.push(cur);
  return { files: files.filter((f) => f.path.length > 0) };
}

export function changedLinesByPath(diff: Diff): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const existing = map.get(f.path);
    if (existing) for (const n of f.addedLines) existing.add(n);
    else map.set(f.path, new Set(f.addedLines));
  }
  return map;
}
