import { describe, expect, it } from "vitest";
import {
  GADGET_CONTRACT_VERSION,
  GadgetError,
  assertCompatible,
  assertGadgetModule,
  validateGadgetManifest,
  type GadgetManifest,
} from "../src/contract/index.js";
import counterModule from "../src/gadgets/counter/module.js";
import { validateCounterConfig } from "../src/gadgets/counter/config.js";

const manifest: GadgetManifest = {
  schemaVersion: 1,
  id: "counter",
  version: "0.1.0",
  displayName: "Counter",
  entry: "/gadgets/counter/gadget.js",
  styles: ["/gadgets/counter/gadget.css"],
  contractVersion: GADGET_CONTRACT_VERSION,
  capabilities: ["standalone"],
};

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof GadgetError ? error.code : `not-a-GadgetError`;
  }
  return "no-error";
}

describe("manifest validation", () => {
  it("accepts a well-formed manifest", () => {
    expect(validateGadgetManifest({ ...manifest })).toEqual(manifest);
  });

  it.each([
    ["not an object", "counter"],
    ["an array", []],
    ["a wrong schemaVersion", { ...manifest, schemaVersion: 2 }],
    ["an unknown field", { ...manifest, extra: 1 }],
    ["an empty id", { ...manifest, id: "" }],
    ["a missing entry", { ...manifest, entry: undefined }],
    ["a non-numeric contractVersion", { ...manifest, contractVersion: "1" }],
    ["a non-string style", { ...manifest, styles: [1] }],
  ])("rejects %s", (_label, raw) => {
    expect(code(() => validateGadgetManifest(raw))).toBe("manifest-invalid");
  });
});

describe("compatibility", () => {
  it("accepts the version this host implements", () => {
    expect(() => assertCompatible(manifest)).not.toThrow();
  });

  it("refuses a gadget written against another contract version", () => {
    expect(
      code(() => assertCompatible({ ...manifest, contractVersion: 2 })),
    ).toBe("contract-incompatible");
  });
});

describe("entry shape", () => {
  it("accepts the real module", () => {
    expect(() => assertGadgetModule(counterModule, manifest)).not.toThrow();
  });

  it.each([
    ["null", null],
    ["a plain object", {}],
    [
      "a module with no validator",
      { id: "counter", contractVersion: 1, Component: () => null },
    ],
  ])("refuses %s", (_label, value) => {
    expect(code(() => assertGadgetModule(value, manifest))).toBe(
      "entry-malformed",
    );
  });

  it("refuses a module whose id contradicts the manifest", () => {
    expect(
      code(() =>
        assertGadgetModule({ ...counterModule, id: "other" }, manifest),
      ),
    ).toBe("entry-malformed");
  });

  it("refuses a module whose own contractVersion is incompatible", () => {
    expect(
      code(() =>
        assertGadgetModule({ ...counterModule, contractVersion: 99 }, manifest),
      ),
    ).toBe("contract-incompatible");
  });
});

describe("gadget-owned config validation", () => {
  it("accepts a minimal config", () => {
    expect(validateCounterConfig({ label: "a" })).toEqual({ label: "a" });
  });

  it.each([
    ["a non-object", 3],
    ["a missing label", {}],
    ["an empty label", { label: "" }],
    ["an unknown field", { label: "a", colour: "red" }],
    ["a non-numeric step", { label: "a", step: "2" }],
    ["a zero step", { label: "a", step: 0 }],
  ])("rejects %s", (_label, raw) => {
    expect(code(() => validateCounterConfig(raw))).toBe("config-invalid");
  });
});
