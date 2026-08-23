import { describe, expect, it, vi } from "vitest";
import { GadgetError } from "../src/contract/index.js";
import {
  GadgetRegistry,
  loadGadgetModule,
  loadManifest,
  type LoaderIo,
} from "../src/runtime/loader.js";
import counterModule from "../src/gadgets/counter/module.js";

const manifestJson = {
  schemaVersion: 1,
  id: "counter",
  version: "0.1.0",
  displayName: "Counter",
  entry: "https://gadgets.example/counter/gadget.js",
  contractVersion: 1,
};

function io(overrides: Partial<LoaderIo> = {}): LoaderIo {
  return {
    fetchJson: vi.fn(async () => structuredClone(manifestJson)),
    importModule: vi.fn(async () => ({ default: counterModule })),
    ...overrides,
  };
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return error instanceof GadgetError ? error.code : "not-a-GadgetError";
  }
  return "no-error";
}

describe("loading", () => {
  it("reads and validates a manifest", async () => {
    expect(await loadManifest("/m.json", io())).toEqual(manifestJson);
  });

  it("reports an unreachable manifest without leaking the transport error", async () => {
    const failing = io({
      fetchJson: vi.fn(async () => {
        throw new TypeError("network down");
      }),
    });
    expect(await codeOf(() => loadManifest("/m.json", failing))).toBe(
      "entry-unreachable",
    );
  });

  it("refuses an incompatible gadget before importing a single byte of it", async () => {
    const transport = io();
    expect(
      await codeOf(() =>
        loadGadgetModule(
          { ...manifestJson, contractVersion: 2 } as never,
          transport,
        ),
      ),
    ).toBe("contract-incompatible");
    expect(transport.importModule).not.toHaveBeenCalled();
  });

  it("reports an unreachable entry", async () => {
    const failing = io({
      importModule: vi.fn(async () => {
        throw new Error("404");
      }),
    });
    expect(
      await codeOf(() => loadGadgetModule(manifestJson as never, failing)),
    ).toBe("entry-unreachable");
  });

  it("refuses an entry that is not a gadget", async () => {
    const wrong = io({
      importModule: vi.fn(async () => ({ default: { hi: 1 } })),
    });
    expect(
      await codeOf(() => loadGadgetModule(manifestJson as never, wrong)),
    ).toBe("entry-malformed");
  });
});

describe("registry", () => {
  it("loads one module however many instances ask for it", async () => {
    const transport = io();
    const registry = new GadgetRegistry(transport);
    const [first, second] = await Promise.all([
      registry.module("/m.json"),
      registry.module("/m.json"),
    ]);
    expect(first).toBe(second);
    expect(transport.fetchJson).toHaveBeenCalledTimes(1);
    expect(transport.importModule).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed discovery retryable rather than caching the failure", async () => {
    let attempt = 0;
    const flaky = io({
      fetchJson: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error("transient");
        return structuredClone(manifestJson);
      }),
    });
    const registry = new GadgetRegistry(flaky);
    expect(await codeOf(() => registry.manifest("/m.json"))).toBe(
      "entry-unreachable",
    );
    await expect(registry.manifest("/m.json")).resolves.toEqual(manifestJson);
  });
});
