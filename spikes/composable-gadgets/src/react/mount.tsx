import { createRoot, type Root } from "react-dom/client";
import type { GadgetHostServices } from "../contract/index.js";
import type { GadgetRegistry } from "../runtime/loader.js";
import { RemoteGadget } from "./GadgetHost.js";

export type GadgetHandle = { unmount: () => void };

/**
 * The imperative boundary, provided once by this layer rather than
 * implemented by every gadget. That asymmetry is the finding: the *contract*
 * is a React component, and `mount`/`unmount` is a derived convenience for a
 * host that is not itself React. A gadget that shipped both would have two
 * implementations of its own lifecycle to keep in step.
 *
 * `isolation` is the host's choice, not the gadget's — the same component
 * mounts into the light DOM or into a shadow root with no gadget-side change,
 * which is only possible because the boundary is a component.
 */
export function mountGadget(options: {
  container: HTMLElement;
  manifestUrl: string;
  registry: GadgetRegistry;
  config: unknown;
  services?: GadgetHostServices;
  theme?: string;
  isolation?: "light" | "shadow";
}): GadgetHandle {
  const { container, isolation = "light" } = options;
  let styleRoot: Document | ShadowRoot = container.ownerDocument;
  let mountPoint: HTMLElement | ShadowRoot = container;
  if (isolation === "shadow") {
    const shadow =
      container.shadowRoot ?? container.attachShadow({ mode: "open" });
    shadow.replaceChildren();
    styleRoot = shadow;
    mountPoint = shadow;
  }
  const root: Root = createRoot(mountPoint as unknown as HTMLElement);
  root.render(
    <RemoteGadget
      manifestUrl={options.manifestUrl}
      registry={options.registry}
      config={options.config}
      services={options.services}
      theme={options.theme}
      styleRoot={styleRoot}
    />,
  );
  return {
    unmount: () => {
      root.unmount();
      if (isolation === "light") container.replaceChildren();
    },
  };
}
