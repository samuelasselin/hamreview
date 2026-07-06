import { describe, it, expect } from "vitest";
import { packageRootFrom } from "./paths";

describe("packageRootFrom", () => {
  it("resolves the package root two levels above src/cli.ts", () => {
    expect(packageRootFrom("file:///Users/x/hamreview/src/cli.ts")).toBe("/Users/x/hamreview");
  });

  it("works for a nested install path", () => {
    expect(packageRootFrom("file:///opt/tools/fr/src/cli.ts")).toBe("/opt/tools/fr");
  });
});
