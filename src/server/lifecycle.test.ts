import { describe, it, expect } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// This file lives at <repoRoot>/src/server/lifecycle.test.ts.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cliPath = join(repoRoot, "src/cli.ts");
// Mirrors how bin/hamreview.mjs launches the CLI in production (tsx/cli as a
// --require-style loader entry, resolved once here in the parent process so
// the child's cwd doesn't need to be inside this package's node_modules tree).
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args]);
}

describe("cli lifecycle", () => {
  it(
    "kills the spawned server and removes the temp dir once a review is submitted, even though the exit path used to skip `finally` via process.exit()",
    async () => {
      const repo = mkdtempSync(join(tmpdir(), "hamreview-lifecycle-repo-"));
      const cwd = mkdtempSync(join(tmpdir(), "hamreview-lifecycle-cwd-"));
      let child: ReturnType<typeof spawn> | undefined;
      try {
        git(repo, ["init", "-q"]);
        writeFileSync(join(repo, "m.txt"), "a\n");
        git(repo, ["add", "."]);
        git(repo, ["commit", "-q", "-m", "init"]);
        writeFileSync(join(repo, "m.txt"), "a\nb\n");

        const handoffPath = join(cwd, "handoff.json");
        writeFileSync(
          handoffPath,
          JSON.stringify({
            version: 1,
            root: repo,
            base: "working-tree",
            flows: [{ id: "flow-1", title: "Flow 1", steps: [{ path: "m.txt", role: "core", ranges: [[2, 2]] }] }],
          }),
        );

        child = spawn(process.execPath, [tsxCli, cliPath, handoffPath], {
          cwd,
          env: {
            ...process.env,
            // Block openBrowser()'s `open`/`xdg-open` lookup so the real CLI
            // run in this test doesn't pop an actual browser window; the
            // review server itself is spawned with an absolute exec path and
            // doesn't need PATH.
            PATH: "/hamreview-test-no-such-path",
          },
        });

        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        const url = await new Promise<{ port: string; token: string }>((resolveUrl, rejectUrl) => {
          const timer = setTimeout(
            () => rejectUrl(new Error(`timed out waiting for the server URL; stderr:\n${stderr}\nstdout:\n${stdout}`)),
            20000,
          );
          child?.stdout?.on("data", () => {
            const m = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=([a-f0-9]+)/);
            if (m) {
              clearTimeout(timer);
              resolveUrl({ port: m[1], token: m[2] });
            }
          });
          child?.once("exit", (code) => {
            clearTimeout(timer);
            rejectUrl(new Error(`cli exited early (code ${code}) before printing a URL; stderr:\n${stderr}`));
          });
        });

        const base = `http://127.0.0.1:${url.port}`;

        // Poll until the server actually accepts connections (mirrors waitForUrl).
        const deadline = Date.now() + 20000;
        for (;;) {
          try {
            await fetch(base + "/");
            break;
          } catch {
            if (Date.now() > deadline) throw new Error("server never became reachable");
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        // Simulate a submission with no browser involved: hit the feedback
        // API directly with the token parsed from the CLI's stdout URL.
        const res = await fetch(`${base}/api/feedback`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-hamreview-token": url.token },
          body: JSON.stringify({
            version: 1,
            submittedAt: new Date().toISOString(),
            flows: [{ id: "flow-1", verdict: "approved" }],
            comments: [],
          }),
        });
        expect(res.status).toBe(200);

        const exitCode = await new Promise<number | null>((resolveExit) => {
          child?.once("exit", (code) => resolveExit(code));
        });
        expect(exitCode).toBe(0);
        expect(existsSync(join(cwd, "feedback.json"))).toBe(true);

        // The critical assertion: cleanup() must have run despite the exit
        // path no longer using process.exit() inside the try — the spawned
        // standalone server must be dead, not orphaned holding the port.
        await expect(fetch(base + "/")).rejects.toThrow();
      } finally {
        child?.kill();
        rmSync(repo, { recursive: true, force: true });
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    45000,
  );
});
