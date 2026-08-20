import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  GadgetError,
  type GadgetHostServices,
  type GadgetManifest,
  type GadgetModule,
} from "../contract/index.js";
import { attachStyles, type GadgetRegistry } from "../runtime/loader.js";
import {
  GadgetBoundary,
  GadgetFallback,
  toFailure,
  type GadgetFailure,
} from "./GadgetBoundary.js";

/**
 * Renders an already-imported gadget. This is the build-time composition path
 * and also what the runtime path funnels into once loading has succeeded, so
 * there is exactly one place a gadget is rendered and exactly one place its
 * configuration is validated.
 */
export function Gadget<TConfig>({
  module,
  config,
  services,
  slots,
  theme,
  onFailure,
}: {
  module: GadgetModule<TConfig>;
  config: unknown;
  services?: GadgetHostServices;
  slots?: Readonly<Record<string, ReactNode>>;
  theme?: string;
  onFailure?: (failure: GadgetFailure) => void;
}) {
  // Validation is memoised on the raw value, not run per render: `config` is
  // immutable startup configuration by contract, so re-validating it would be
  // work that can only ever produce the same answer.
  const validated = useMemo(() => {
    try {
      return { ok: true as const, value: module.validateConfig(config) };
    } catch (error) {
      return { ok: false as const, failure: toFailure(error, module.id) };
    }
  }, [module, config]);

  const failed = !validated.ok;
  useEffect(() => {
    if (failed && !validated.ok) onFailure?.(validated.failure);
  }, [failed, validated, onFailure]);

  if (!validated.ok) return <GadgetFallback failure={validated.failure} />;

  const scoped: GadgetHostServices | undefined = services && {
    ...services,
    ...(services.emit && {
      emit: (event) => services.emit?.({ ...event, source: module.id }),
    }),
  };

  return (
    <GadgetBoundary gadgetId={module.id} onFailure={onFailure}>
      <module.Component
        config={validated.value}
        services={scoped}
        slots={slots}
        theme={theme}
      />
    </GadgetBoundary>
  );
}

export type RemoteState =
  | { status: "loading" }
  | { status: "ready"; manifest: GadgetManifest; module: GadgetModule }
  | { status: "failed"; failure: GadgetFailure };

/**
 * Discovers, validates, loads and renders a gadget the host was not built
 * against. Every failure short of a successful load resolves to a fallback in
 * this subtree only — the host never sees a throw.
 */
export function RemoteGadget({
  manifestUrl,
  registry,
  config,
  services,
  slots,
  theme,
  styleRoot,
  onFailure,
  onReady,
}: {
  manifestUrl: string;
  registry: GadgetRegistry;
  config: unknown;
  services?: GadgetHostServices;
  slots?: Readonly<Record<string, ReactNode>>;
  theme?: string;
  styleRoot?: Document | ShadowRoot;
  onFailure?: (failure: GadgetFailure) => void;
  onReady?: (module: GadgetModule) => void;
}) {
  const [state, setState] = useState<RemoteState>({ status: "loading" });
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    void (async () => {
      try {
        const manifest = await registry.manifest(manifestUrl);
        const module = await registry.module(manifestUrl);
        if (!live) return;
        if (styleRoot) attachStyles(manifest, styleRoot);
        setState({ status: "ready", manifest, module });
        readyRef.current?.(module);
      } catch (error) {
        if (!live) return;
        const failure = toFailure(
          error instanceof GadgetError
            ? error
            : new GadgetError("entry-unreachable", String(error)),
        );
        setState({ status: "failed", failure });
        onFailure?.(failure);
      }
    })();
    return () => {
      live = false;
    };
    // `onFailure` is deliberately excluded: a host that passes an inline
    // callback would otherwise re-run discovery on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestUrl, registry, styleRoot]);

  if (state.status === "loading")
    return <div className="szd-gadget-loading">Loading…</div>;
  if (state.status === "failed")
    return <GadgetFallback failure={state.failure} />;
  return (
    <Gadget
      module={state.module}
      config={config}
      services={services}
      slots={slots}
      theme={theme}
      onFailure={onFailure}
    />
  );
}
