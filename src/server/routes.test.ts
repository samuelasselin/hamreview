import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GET } from "../../app/api/review/route";
import { POST } from "../../app/api/feedback/route";

let repo: string;

function git(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-routes-"));
  git(["init", "-q"]);
  writeFileSync(join(repo, "a.txt"), "x\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  writeFileSync(join(repo, "a.txt"), "x\ny\n");
  const handoffPath = join(repo, "handoff.json");
  writeFileSync(
    handoffPath,
    JSON.stringify({
      version: 1,
      root: repo,
      base: "working-tree",
      flows: [{ id: "f", title: "F", steps: [{ path: "a.txt", ranges: [[2, 2]], role: "x" }] }],
    }),
  );
  process.env.HAMREVIEW_HANDOFF = handoffPath;
  process.env.HAMREVIEW_FEEDBACK_OUT = join(repo, "feedback.json");
  process.env.HAMREVIEW_DONE = join(repo, ".done");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  delete process.env.HAMREVIEW_HANDOFF;
  delete process.env.HAMREVIEW_FEEDBACK_OUT;
  delete process.env.HAMREVIEW_DONE;
});

describe("GET /api/review", () => {
  it("returns the review model as JSON", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model.flows[0].id).toBe("f");
  });
});

describe("POST /api/feedback", () => {
  it("writes feedback and returns ok", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        version: 1,
        submittedAt: "2026-07-02T00:00:00.000Z",
        flows: [{ id: "f", verdict: "approved" }],
        comments: [],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(existsSync(process.env.HAMREVIEW_DONE as string)).toBe(true);
  });

  it("returns 400 on an invalid body", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ version: 1, submittedAt: "t", flows: [], comments: [{ bad: 1 }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
