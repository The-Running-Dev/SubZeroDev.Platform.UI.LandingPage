/**
 * The proposed gadget contract, in the narrowest form the proof exercises.
 *
 * Everything here is dependency-free apart from React's *types*. That is the
 * point of the split: a host, a loader, a build tool, or a test can depend on
 * the contract without pulling a React runtime, and only the `react` layer
 * ever renders anything.
 */
import type { ComponentType, ReactNode } from "react";

/**
 * The version of *this file's* meaning, not of any gadget. A gadget declares
 * the number it was written against; a host refuses one it cannot honour.
 */
export const GADGET_CONTRACT_VERSION = 1;

/** What went wrong, as a value rather than a message a host has to parse. */
export type GadgetErrorCode =
  | "manifest-invalid"
  | "contract-incompatible"
  | "entry-unreachable"
  | "entry-malformed"
  | "config-invalid"
  | "render-failed";

export class GadgetError extends Error {
  readonly code: GadgetErrorCode;
  readonly gadgetId: string | undefined;
  constructor(
    code: GadgetErrorCode,
    message: string,
    gadgetId?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GadgetError";
    this.code = code;
    this.gadgetId = gadgetId;
  }
}

/** One thing that happened inside a gadget that the host may care about. */
export type GadgetEvent<TPayload = unknown> = {
  type: string;
  /** The emitting gadget's id. Set by the React layer, never by the gadget. */
  source: string;
  payload?: TPayload;
};

export type GadgetLogger = {
  info: (message: string, detail?: unknown) => void;
  error: (message: string, detail?: unknown) => void;
};

/**
 * The host's side of the boundary. Every member is optional and every member
 * has a defined meaning when absent, so a gadget is never coupled to a host
 * that happens to supply everything. This is not a service locator: it is a
 * closed list, and the proof only exercises what it needs.
 */
export type GadgetHostServices = {
  /** Absent: the gadget renders a plain link and lets the document navigate. */
  navigate?: (target: string) => void;
  /** Absent: events are dropped. A gadget may not depend on delivery. */
  emit?: (event: GadgetEvent) => void;
  /** Absent: the gadget stays silent. */
  log?: GadgetLogger;
  /** Absent: the gadget treats asset paths as already resolved. */
  resolveAsset?: (path: string) => string;
};

/**
 * The four inputs, kept apart on purpose:
 *
 * - `config`   immutable startup configuration, validated once, gadget-owned
 * - `services` host capabilities, host-owned, may be absent
 * - `slots`    child descriptors the *host* resolved, so a container gadget
 *              never imports the gadget it contains
 * - `theme`    visual flavour only; never carries behaviour
 *
 * Internal gadget state is the fifth thing and appears nowhere here, which is
 * the whole reason the list is worth writing down.
 */
export type GadgetProps<TConfig> = {
  config: TConfig;
  services?: GadgetHostServices;
  slots?: Readonly<Record<string, ReactNode>>;
  theme?: string;
};

/**
 * A gadget's whole public surface. A React component plus the validator that
 * earns its config type — the two are inseparable, because a runtime-loaded
 * gadget receives configuration the host never type-checked.
 */
export type GadgetModule<TConfig = unknown> = {
  id: string;
  version: string;
  contractVersion: number;
  displayName: string;
  Component: ComponentType<GadgetProps<TConfig>>;
  /** Throws `GadgetError("config-invalid")`. Never casts. */
  validateConfig: (raw: unknown) => TConfig;
  /**
   * The React namespace object this module actually imported, so a host can
   * prove — not assume — that runtime loading did not produce a second copy.
   * Diagnostic, and deliberately part of the contract for that reason.
   */
  runtimeReact: unknown;
};

/** What a host reads before it loads anything. */
export type GadgetManifest = {
  schemaVersion: 1;
  id: string;
  version: string;
  displayName: string;
  /** URL of an ES module whose default export is a `GadgetModule`. */
  entry: string;
  styles?: readonly string[];
  contractVersion: number;
  capabilities?: readonly string[];
};

function fail(code: GadgetErrorCode, message: string): never {
  throw new GadgetError(code, message);
}

/** Validates a manifest fetched from somewhere this package did not author. */
export function validateGadgetManifest(raw: unknown): GadgetManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    fail("manifest-invalid", "Gadget manifest must be an object.");
  const value = raw as Record<string, unknown>;
  const allowed = [
    "schemaVersion",
    "id",
    "version",
    "displayName",
    "entry",
    "styles",
    "contractVersion",
    "capabilities",
  ];
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      fail("manifest-invalid", `Gadget manifest has unknown field '${key}'.`);
  if (value.schemaVersion !== 1)
    fail("manifest-invalid", "Gadget manifest schemaVersion must be 1.");
  for (const key of ["id", "version", "displayName", "entry"] as const)
    if (typeof value[key] !== "string" || value[key] === "")
      fail(
        "manifest-invalid",
        `Gadget manifest '${key}' must be a non-empty string.`,
      );
  if (typeof value.contractVersion !== "number")
    fail(
      "manifest-invalid",
      "Gadget manifest contractVersion must be a number.",
    );
  for (const key of ["styles", "capabilities"] as const)
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        (value[key] as unknown[]).some((item) => typeof item !== "string"))
    )
      fail(
        "manifest-invalid",
        `Gadget manifest '${key}' must be an array of strings.`,
      );
  return value as unknown as GadgetManifest;
}

/**
 * Refuses an incompatible gadget *before* its entry is fetched. Compatibility
 * is exact-major here because the contract has one major; the check exists so
 * that widening it later is a change to one function.
 */
export function assertCompatible(
  manifest: GadgetManifest,
  hostContractVersion: number = GADGET_CONTRACT_VERSION,
): void {
  if (manifest.contractVersion !== hostContractVersion)
    throw new GadgetError(
      "contract-incompatible",
      `Gadget '${manifest.id}' declares contract version ${manifest.contractVersion}; this host implements ${hostContractVersion}.`,
      manifest.id,
    );
}

/** Checks that a loaded module is actually a gadget before it is rendered. */
export function assertGadgetModule(
  value: unknown,
  manifest: GadgetManifest,
): asserts value is GadgetModule {
  const candidate = value as Partial<GadgetModule> | null;
  if (
    !candidate ||
    typeof candidate.id !== "string" ||
    typeof candidate.validateConfig !== "function" ||
    typeof candidate.contractVersion !== "number" ||
    (typeof candidate.Component !== "function" &&
      typeof candidate.Component !== "object")
  )
    throw new GadgetError(
      "entry-malformed",
      `Gadget '${manifest.id}' entry does not default-export a GadgetModule.`,
      manifest.id,
    );
  if (candidate.id !== manifest.id)
    throw new GadgetError(
      "entry-malformed",
      `Gadget entry declares id '${candidate.id}' but the manifest declares '${manifest.id}'.`,
      manifest.id,
    );
  assertCompatible(
    { ...manifest, contractVersion: candidate.contractVersion },
    GADGET_CONTRACT_VERSION,
  );
}
