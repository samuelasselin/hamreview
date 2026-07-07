import { readFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { parseHandoff } from "./core/index";
import { openBrowser } from "./server/browser";
import { findFreePort, waitForFile, waitForUrl } from "./server/net";
import { packageRootFrom } from "./server/paths";
import { serverSpawnSpec } from "./server/standalone";

function readDoneOutcome(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

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
  // A leftover feedback.json from a previous run must never be reported as
  // this run's result (e.g. abort-after-prior-success).
  rmSync(feedbackOut, { force: true });
  const donePath = join(work, ".done");
  const port = await findFreePort();
  const token = randomBytes(16).toString("hex");

  const packageRoot = packageRootFrom(import.meta.url);
  const spec = serverSpawnSpec({
    execPath: process.execPath,
    packageRoot,
    port,
    handoffPath,
    feedbackOut,
    donePath,
    token,
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

  // Any termination is a graceful abort: tear down the server + temp dir.
  const bail = (signal: string, hint = ""): void => {
    console.error(`\nreview aborted (${signal})${hint}`);
    cleanup();
    process.exit(130);
  };
  process.on("SIGINT", () => bail("SIGINT"));
  process.on("SIGTERM", () => bail("SIGTERM", " — if this was a command timeout, re-run hamreview in the background"));
  process.on("SIGHUP", () => bail("SIGHUP"));

  try {
    const url = `http://127.0.0.1:${port}`;
    const ready = await waitForUrl(url, 30000);
    if (!ready) {
      console.error("server did not start in time");
      process.exitCode = 1;
      return;
    }

    const reviewUrl = `${url}/?token=${token}`;
    console.log(`HamReview open at ${reviewUrl} — review, then submit in the browser (Ctrl-C to abort).`);
    if (!(await openBrowser(reviewUrl))) {
      console.log("could not open a browser automatically — open the URL above manually.");
    }

    const done = await waitForFile(donePath, 60 * 60 * 1000); // block up to 1h
    const outcome = done ? readDoneOutcome(donePath) : "";
    if (outcome === "submitted" && existsSync(feedbackOut)) {
      console.log(`feedback written to ${feedbackOut}`);
      process.exitCode = 0;
      return;
    }
    console.error("review was not submitted" + (outcome === "aborted" ? " (aborted in the browser)" : " (browser closed?)"));
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
