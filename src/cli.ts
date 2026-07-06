import { readFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import open from "open";
import { parseHandoff } from "./core/index";
import { findFreePort, waitForFile, waitForUrl } from "./server/net";
import { packageRootFrom } from "./server/paths";
import { serverSpawnSpec } from "./server/standalone";

async function main(): Promise<void> {
  const handoffArg = process.argv[2];
  if (!handoffArg) {
    console.error("usage: hamreview <handoff.json>");
    process.exit(2);
  }
  // resolve() handles both an absolute path and a cwd-relative one.
  const handoffPath = resolve(handoffArg);
  // Validate early so a bad handoff fails before booting anything.
  parseHandoff(readFileSync(handoffPath, "utf8"));

  const work = mkdtempSync(join(tmpdir(), "hamreview-run-"));
  const feedbackOut = join(process.cwd(), "feedback.json");
  const donePath = join(work, ".done");
  const port = await findFreePort();

  const packageRoot = packageRootFrom(import.meta.url);
  const spec = serverSpawnSpec({
    execPath: process.execPath,
    packageRoot,
    port,
    handoffPath,
    feedbackOut,
    donePath,
    baseEnv: process.env,
  });
  const server = spawn(spec.command, spec.args, {
    cwd: packageRoot,
    stdio: "inherit",
    env: spec.env,
  });

  const cleanup = (): void => {
    server.kill();
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };

  // Ctrl-C is a graceful abort: tear down the server + temp dir, exit non-zero.
  process.on("SIGINT", () => {
    console.error("\nreview aborted");
    cleanup();
    process.exit(130);
  });

  try {
    const url = `http://127.0.0.1:${port}`;
    const ready = await waitForUrl(url, 30000);
    if (!ready) {
      console.error("server did not start in time");
      process.exit(1);
    }

    console.log(`HamReview open at ${url} — review, then submit in the browser (Ctrl-C to abort).`);
    await open(url);

    const done = await waitForFile(donePath, 60 * 60 * 1000); // block up to 1h
    if (done && existsSync(feedbackOut)) {
      console.log(`feedback written to ${feedbackOut}`);
      process.exit(0);
    }
    console.error("review was not submitted (browser closed?)");
    process.exit(1);
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
