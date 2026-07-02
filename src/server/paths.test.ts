import { describe, it, expect } from "vitest";
import { packageRootFrom } from "./paths";

describe("packageRootFrom", () => {
  it("resolves the package root two levels above src/cli.ts", () => {
    expect(packageRootFrom("file:///Users/x/flowreview/src/cli.ts")).toBe("/Users/x/flowreview");
  });

  it("works for a nested install path", () => {
    expect(packageRootFrom("file:///opt/tools/fr/src/cli.ts")).toBe("/opt/tools/fr");
  });
});
