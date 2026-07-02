import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileReader } from "../core/index";

/** Unified diff of the working tree (staged + unstaged) at `root`. */
export function getWorkingDiff(root: string): string {
  return execFileSync("git", ["-C", root, "diff", "--no-color", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** A core `FileReader` bound to `root`; missing files read as []. */
export function makeFileReader(root: string): FileReader {
  return (path: string): string[] => {
    try {
      return readFileSync(join(root, path), "utf8").split("\n");
    } catch {
      return [];
    }
  };
}
