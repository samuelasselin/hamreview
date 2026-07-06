#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxCli = require.resolve("tsx/cli");
const res = spawnSync(process.execPath, [tsxCli, join(root, "src/cli.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
