import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { FileReader } from "../core/index";

/** Unified diff of the working tree (staged + unstaged) at `root`. */
export function getWorkingDiff(root: string): string {
  return execFileSync("git", ["-C", root, "diff", "--no-color", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * A core `FileReader` bound to `root`; missing files read as [].
 * Containment: any path resolving outside `root` also reads as [] — the
 * schema already rejects such paths, this guards against bypasses.
 */
export function makeFileReader(root: string): FileReader {
  const base = resolve(root);
  return (path: string): string[] => {
    const full = resolve(base, path);
    if (full !== base && !full.startsWith(base + sep)) return [];
    try {
      return readFileSync(full, "utf8").split("\n");
    } catch {
      return [];
    }
  };
}
