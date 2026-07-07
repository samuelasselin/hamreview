import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readEnv, buildModelFor, submitFeedback, tokenOk } from "./context";

let repo: string;
let handoffPath: string;

function git(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-ctx-"));
  git(["init", "-q"]);
  writeFileSync(join(repo, "a.txt"), "class A\n  old\nend\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  writeFileSync(join(repo, "a.txt"), "class A\n  new line\nend\n");
  handoffPath = join(repo, "handoff.json");
  writeFileSync(
    handoffPath,
    JSON.stringify({
      version: 1,
      root: repo,
      base: "working-tree",
      feature: "Demo",
      flows: [{ id: "f", title: "F", steps: [{ path: "a.txt", ranges: [[2, 2]], role: "model" }] }],
    }),
  );
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("readEnv", () => {
  it("throws when a variable is missing", () => {
    expect(() => readEnv({} as NodeJS.ProcessEnv)).toThrow(/HAMREVIEW_HANDOFF/);
  });
});

describe("buildModelFor", () => {
  it("builds a review model from the handoff and the live diff", () => {
    const model = buildModelFor(handoffPath);
    expect(model.feature).toBe("Demo");
    expect(model.flows[0].steps[0].path).toBe("a.txt");
    const kinds = model.flows[0].steps[0].lines.map((l) => l.kind);
    expect(kinds).toContain("added");
  });

  it("throws on an unsupported base", () => {
    const p = join(repo, "handoff-badbase.json");
    writeFileSync(
      p,
      JSON.stringify({
        version: 1,
        root: repo,
        base: "main",
        flows: [{ id: "f", title: "F", steps: [{ path: "a.txt", ranges: [[2, 2]], role: "model" }] }],
      }),
    );
    expect(() => buildModelFor(p)).toThrow(/unsupported handoff base/);
  });
});

describe("submitFeedback", () => {
  it("validates, writes feedback.json, and creates the done signal", () => {
    const feedbackOut = join(repo, "feedback.json");
    const donePath = join(repo, ".done");
    const env = { handoffPath, feedbackOut, donePath, token: "tkn" };
    const body = {
      version: 1,
      submittedAt: "2026-07-02T00:00:00.000Z",
      flows: [{ id: "f", verdict: "approved" }],
      comments: [],
    };
    const result = submitFeedback(env, body);
    expect(result.flows[0].verdict).toBe("approved");
    expect(existsSync(donePath)).toBe(true);
    expect(JSON.parse(readFileSync(feedbackOut, "utf8")).flows[0].id).toBe("f");
  });

  it("rejects an invalid feedback body", () => {
    const env = { handoffPath, feedbackOut: join(repo, "f2.json"), donePath: join(repo, ".done2"), token: "tkn" };
    expect(() => submitFeedback(env, { version: 1, submittedAt: "t", flows: [], comments: [{ bad: true }] })).toThrow();
  });
});

describe("tokenOk", () => {
  const env = { handoffPath: "h", feedbackOut: "f", donePath: "d", token: "secret42" };
  it("accepts the exact token", () => {
    expect(tokenOk(env, "secret42")).toBe(true);
  });
  it("rejects a wrong, empty, or missing token", () => {
    expect(tokenOk(env, "nope")).toBe(false);
    expect(tokenOk(env, "")).toBe(false);
    expect(tokenOk(env, null)).toBe(false);
  });
});
