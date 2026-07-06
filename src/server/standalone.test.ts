import { describe, it, expect } from "vitest";
import { standaloneServerPath, serverSpawnSpec } from "./standalone";

describe("standaloneServerPath", () => {
  it("points at .next/standalone/server.js under the package root", () => {
    expect(standaloneServerPath("/opt/hamreview")).toBe(
      "/opt/hamreview/.next/standalone/server.js",
    );
  });
});

describe("serverSpawnSpec", () => {
  it("runs node against the standalone server with port, host, and HAMREVIEW_ env", () => {
    const spec = serverSpawnSpec({
      execPath: "/usr/bin/node",
      packageRoot: "/opt/hamreview",
      port: 4321,
      handoffPath: "/proj/handoff.json",
      feedbackOut: "/proj/feedback.json",
      donePath: "/tmp/run/.done",
      baseEnv: { PATH: "/usr/bin" },
    });
    expect(spec.command).toBe("/usr/bin/node");
    expect(spec.args).toEqual(["/opt/hamreview/.next/standalone/server.js"]);
    expect(spec.env.PORT).toBe("4321");
    expect(spec.env.HOSTNAME).toBe("127.0.0.1");
    expect(spec.env.HAMREVIEW_HANDOFF).toBe("/proj/handoff.json");
    expect(spec.env.HAMREVIEW_FEEDBACK_OUT).toBe("/proj/feedback.json");
    expect(spec.env.HAMREVIEW_DONE).toBe("/tmp/run/.done");
    expect(spec.env.PATH).toBe("/usr/bin"); // base env preserved
  });
});
