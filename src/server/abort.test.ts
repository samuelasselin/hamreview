import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/abort/route";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hamreview-abort-"));
  process.env.HAMREVIEW_HANDOFF = join(dir, "handoff.json");
  process.env.HAMREVIEW_FEEDBACK_OUT = join(dir, "feedback.json");
  process.env.HAMREVIEW_DONE = join(dir, ".done");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.HAMREVIEW_HANDOFF;
  delete process.env.HAMREVIEW_FEEDBACK_OUT;
  delete process.env.HAMREVIEW_DONE;
});

describe("POST /api/abort", () => {
  it("writes the done-signal without writing a feedback file", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(existsSync(process.env.HAMREVIEW_DONE as string)).toBe(true);
    expect(existsSync(process.env.HAMREVIEW_FEEDBACK_OUT as string)).toBe(false);
  });
});
