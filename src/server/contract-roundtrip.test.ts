import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/feedback/route";
import { parseFeedback } from "../core/index";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "hamreview-contract-"));
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

describe("feedback contract round-trip through the route", () => {
  it("writes a feedback.json that parseFeedback accepts with the same content", async () => {
    const payload = {
      version: 1,
      submittedAt: "2026-07-02T00:00:00.000Z",
      flows: [{ id: "create-booking", verdict: "changes-requested" }],
      comments: [
        { flowId: "create-booking", path: "app/models/booking.rb", lines: [14, 14], intent: "must-fix", text: "guard nil" },
      ],
    };
    const res = await POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(payload) }));
    expect(res.status).toBe(200);

    const written = parseFeedback(readFileSync(process.env.HAMREVIEW_FEEDBACK_OUT as string, "utf8"));
    expect(written.flows).toEqual([{ id: "create-booking", verdict: "changes-requested" }]);
    expect(written.comments[0].intent).toBe("must-fix");
    expect(written.comments[0].lines).toEqual([14, 14]);
  });
});
