import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
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
  const handoffPath = join(process.cwd(), handoffArg);
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

  const url = `http://localhost:${port}`;
  const ready = await waitForUrl(url, 30000);
  if (!ready) {
    server.kill();
    console.error("server did not start in time");
    process.exit(1);
  }

  console.log(`FlowReview open at ${url} — review, then submit in the browser.`);
  await open(url);

  const done = await waitForFile(donePath, 60 * 60 * 1000); // block up to 1h
  server.kill();
  rmSync(work, { recursive: true, force: true });

  if (done && existsSync(feedbackOut)) {
    console.log(`feedback written to ${feedbackOut}`);
    process.exit(0);
  }
  console.error("review was not submitted (browser closed?)");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
