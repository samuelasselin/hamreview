import { readFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import open from "open";
import { parseHandoff } from "./core/index";
import { findFreePort, waitForFile, waitForUrl } from "./server/net";

async function main(): Promise<void> {
  const handoffArg = process.argv[2];
  if (!handoffArg) {
    console.error("usage: flowreview <handoff.json>");
    process.exit(2);
  }
  // resolve() handles both an absolute path and a cwd-relative one.
  const handoffPath = resolve(handoffArg);
  // Validate early so a bad handoff fails before booting anything.
  parseHandoff(readFileSync(handoffPath, "utf8"));

  const work = mkdtempSync(join(tmpdir(), "flowreview-run-"));
  const feedbackOut = join(process.cwd(), "feedback.json");
  const donePath = join(work, ".done");
  const port = await findFreePort();

  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWREVIEW_HANDOFF: handoffPath,
      FLOWREVIEW_FEEDBACK_OUT: feedbackOut,
      FLOWREVIEW_DONE: donePath,
    },
  });

  try {
    const url = `http://localhost:${port}`;
    const ready = await waitForUrl(url, 30000);
    if (!ready) {
      console.error("server did not start in time");
      process.exit(1);
    }

    console.log(`FlowReview open at ${url} — review, then submit in the browser.`);
    await open(url);

    const done = await waitForFile(donePath, 60 * 60 * 1000); // block up to 1h
    if (done && existsSync(feedbackOut)) {
      console.log(`feedback written to ${feedbackOut}`);
      process.exit(0);
    }
    console.error("review was not submitted (browser closed?)");
    process.exit(1);
  } finally {
    server.kill();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
