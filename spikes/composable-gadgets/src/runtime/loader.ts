/**
 * Manifest loading, module loading, and a registry. No React: a build tool or
 * a non-React host can use this to discover and validate a gadget without
 * rendering it.
 */
import {
  GadgetError,
  assertCompatible,
  assertGadgetModule,
  validateGadgetManifest,
  type GadgetManifest,
  type GadgetModule,
} from "../contract/index.js";

/**
 * The two host-supplied primitives, injected rather than reached for, so the
 * loader is testable without a network and a host can police both (a CSP
 * allow-list on `importModule`, a credentialed `fetch`).
 */
export type LoaderIo = {
  fetchJson: (url: string) => Promise<unknown>;
  importModule: (url: string) => Promise<unknown>;
};

export const browserIo: LoaderIo = {
  fetchJson: async (url) => {
    const response = await fetch(url);
    if (!response.ok)
      throw new GadgetError(
        "entry-unreachable",
        `Manifest '${url}' responded ${response.status}.`,
      );
    return response.json();
  },
  importModule: (url) => import(/* @vite-ignore */ url),
};

export async function loadManifest(
  url: string,
  io: LoaderIo,
): Promise<GadgetManifest> {
  let raw: unknown;
  try {
    raw = await io.fetchJson(url);
  } catch (cause) {
    if (cause instanceof GadgetError) throw cause;
    throw new GadgetError(
      "entry-unreachable",
      `Gadget manifest '${url}' could not be read.`,
      undefined,
      { cause },
    );
  }
  return validateGadgetManifest(raw);
}

/**
 * Loads the module a manifest names. Compatibility is checked *before* the
 * fetch, so an incompatible gadget costs one JSON request and never executes
 * a byte of foreign code — the cheapest place to refuse is the only place a
 * refusal is guaranteed to be safe.
 */
export async function loadGadgetModule(
  manifest: GadgetManifest,
  io: LoaderIo,
): Promise<GadgetModule> {
  assertCompatible(manifest);
  let namespace: unknown;
  try {
    namespace = await io.importModule(manifest.entry);
  } catch (cause) {
    throw new GadgetError(
      "entry-unreachable",
      `Gadget '${manifest.id}' entry '${manifest.entry}' could not be loaded.`,
      manifest.id,
      { cause },
    );
  }
  const candidate = (namespace as { default?: unknown } | null)?.default;
  assertGadgetModule(candidate, manifest);
  return candidate;
}

/**
 * Injects a manifest's stylesheets into a given root. `root` is a parameter
 * rather than always `document.head` because that is exactly the choice that
 * decides CSS isolation, and it belongs to the host (see `mountGadget`).
 */
export function attachStyles(
  manifest: GadgetManifest,
  root: Document | ShadowRoot,
): HTMLLinkElement[] {
  const target = root instanceof Document ? root.head : root;
  const links: HTMLLinkElement[] = [];
  for (const href of manifest.styles ?? []) {
    const owner = root instanceof Document ? root : root.ownerDocument;
    if (
      root instanceof Document &&
      root.querySelector(`link[data-szd-gadget-style="${href}"]`)
    )
      continue;
    const link = owner.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.szdGadgetStyle = href;
    target.appendChild(link);
    links.push(link);
  }
  return links;
}

/**
 * Caches by manifest URL so two instances of one gadget share a module — the
 * registry is what makes "two independently configured instances" a
 * configuration question rather than a loading one.
 */
export class GadgetRegistry {
  readonly #io: LoaderIo;
  readonly #manifests = new Map<string, Promise<GadgetManifest>>();
  readonly #modules = new Map<string, Promise<GadgetModule>>();

  constructor(io: LoaderIo = browserIo) {
    this.#io = io;
  }

  manifest(url: string): Promise<GadgetManifest> {
    const existing = this.#manifests.get(url);
    if (existing) return existing;
    // Not memoised on rejection: a failed discovery must stay retryable.
    const pending = loadManifest(url, this.#io).catch((error: unknown) => {
      this.#manifests.delete(url);
      throw error;
    });
    this.#manifests.set(url, pending);
    return pending;
  }

  async module(url: string): Promise<GadgetModule> {
    const manifest = await this.manifest(url);
    const existing = this.#modules.get(url);
    if (existing) return existing;
    const pending = loadGadgetModule(manifest, this.#io).catch(
      (error: unknown) => {
        this.#modules.delete(url);
        throw error;
      },
    );
    this.#modules.set(url, pending);
    return pending;
  }
}
