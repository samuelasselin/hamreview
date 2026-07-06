#!/usr/bin/env node
// Next `standalone` output does NOT copy static assets into the standalone
// dir; the server expects them at .next/standalone/.next/static. Copy them so
// the shipped .next/standalone is self-contained. (There is no public/ dir.)
import { cpSync, existsSync } from "node:fs";

const from = ".next/static";
const to = ".next/standalone/.next/static";

if (!existsSync(from)) {
  console.error(`prepare-standalone: ${from} not found — did 'next build' run?`);
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log(`prepare-standalone: copied ${from} -> ${to}`);
