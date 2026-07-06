#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const res = spawnSync("npx", ["tsx", join(root, "src/cli.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
