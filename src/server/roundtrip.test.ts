import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildModelFor, submitFeedback } from "../server/context";

let repo: string;
let handoffPath: string;

function git(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args]);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-rt-"));
  git(["init", "-q"]);
  writeFileSync(join(repo, "m.rb"), "class M\n  def a\n  end\nend\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  writeFileSync(join(repo, "m.rb"), "class M\n  def a\n    validate!\n  end\nend\n");
  handoffPath = join(repo, "handoff.json");
  writeFileSync(
    handoffPath,
    JSON.stringify({
      version: 1,
      root: repo,
      base: "working-tree",
      feature: "Round trip",
      flows: [{ id: "add-validate", title: "Add validate", steps: [{ path: "m.rb", ranges: [[3, 3]], role: "model" }] }],
    }),
  );
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("contract round-trip", () => {
  it("handoff + git diff -> model -> feedback.json", () => {
    const model = buildModelFor(handoffPath);
    expect(model.feature).toBe("Round trip");
    const step = model.flows[0].steps[0];
    expect(step.lines.some((l) => l.kind === "added" && l.text.includes("validate!"))).toBe(true);

    const feedbackOut = join(repo, "feedback.json");
    const donePath = join(repo, ".done");
    submitFeedback(
      { handoffPath, feedbackOut, donePath, token: "tkn" },
      {
        version: 1,
        submittedAt: "2026-07-02T00:00:00.000Z",
        flows: [{ id: "add-validate", verdict: "changes-requested" }],
        comments: [
          { flowId: "add-validate", path: "m.rb", lines: [3, 3], intent: "must-fix", text: "guard nil" },
        ],
      },
    );
    expect(existsSync(donePath)).toBe(true);
    const written = JSON.parse(readFileSync(feedbackOut, "utf8"));
    expect(written.comments[0].intent).toBe("must-fix");
    expect(written.flows[0].verdict).toBe("changes-requested");
  });
});
