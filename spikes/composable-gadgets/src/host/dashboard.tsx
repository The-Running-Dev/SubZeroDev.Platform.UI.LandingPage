import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GadgetHostServices } from "../contract/index.js";
import { Gadget, RemoteGadget } from "../react/GadgetHost.js";
import { mountGadget, type GadgetHandle } from "../react/mount.js";
import { GadgetRegistry, browserIo } from "../runtime/loader.js";
import counterModule from "../gadgets/counter/module.js";
import panelModule from "../gadgets/panel/PanelGadget.js";
import { runChecks, type CheckResult } from "./checks.js";
import "../gadgets/counter/counter.css";
import "../gadgets/panel/panel.css";
import "./host.css";

const log: string[] = [];
const events: string[] = [];

const services: GadgetHostServices = {
  log: {
    info: (message) => log.push(message),
    error: (message) => log.push(`ERROR ${message}`),
  },
  emit: (event) => events.push(`${event.source}:${event.type}`),
  navigate: (target) => log.push(`navigate ${target}`),
};

const registry = new GadgetRegistry(browserIo);
const MANIFEST = "/gadgets/counter/manifest.json";

const spike = {
  reactIdentity: undefined as boolean | undefined,
  log,
  events,
  shadowHost: undefined as HTMLElement | undefined,
  unmountShadow: () => {},
  remountShadow: () => {},
};
(window as unknown as { __SPIKE__: typeof spike }).__SPIKE__ = spike;

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="host-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/**
 * The imperatively mounted instance. Two things are being shown at once: a
 * non-React host can use the same gadget through `mountGadget`, and isolation
 * is the *host's* choice — this container gets a shadow root and the gadget
 * knows nothing about it.
 */
function ShadowSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    spike.shadowHost = container;
    let handle: GadgetHandle | null = null;
    const mount = () => {
      handle = mountGadget({
        container,
        manifestUrl: MANIFEST,
        registry,
        config: { label: "Isolated", start: 7, step: 1 },
        services,
        theme: "cold",
        isolation: "shadow",
      });
    };
    spike.unmountShadow = () => {
      handle?.unmount();
      handle = null;
    };
    spike.remountShadow = () => {
      if (!handle) mount();
    };
    mount();
    return () => {
      handle?.unmount();
      handle = null;
    };
  }, []);
  return <div ref={ref} />;
}

function Dashboard() {
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  useEffect(() => {
    void runChecks().then(setChecks);
  }, []);

  return (
    <>
      <h1>Gadget spike — issue #69</h1>
      <div className="host-grid">
        <Card title="1 · build-time import">
          <Gadget
            module={counterModule}
            config={{
              label: "Downloads",
              start: 0,
              step: 1,
              detailsHref: "/details",
            }}
            services={services}
            theme="cold"
          />
        </Card>

        <Card title="2 · same gadget, other config + theme">
          <Gadget
            module={counterModule}
            config={{ label: "Signups", start: 100, step: 5 }}
            services={services}
            theme="warm"
          />
        </Card>

        <Card title="3 · runtime load, nested in a container gadget">
          <Gadget
            module={panelModule}
            config={{ title: "Panel host surface" }}
            services={services}
            slots={{
              body: (
                <RemoteGadget
                  manifestUrl={MANIFEST}
                  registry={registry}
                  config={{ label: "Remote", start: 0, step: 2 }}
                  services={services}
                  theme="cold"
                  styleRoot={document}
                  onReady={(module) => {
                    spike.reactIdentity = Object.is(module.runtimeReact, React);
                  }}
                />
              ),
            }}
          />
        </Card>

        <Card title="4 · imperative mount into a shadow root">
          <ShadowSlot />
        </Card>

        <Card title="5 · incompatible contract version">
          <RemoteGadget
            manifestUrl="/gadgets/counter/manifest-future.json"
            registry={registry}
            config={{ label: "Never" }}
            services={services}
          />
        </Card>

        <Card title="6 · entry URL not published">
          <RemoteGadget
            manifestUrl="/gadgets/counter/manifest-missing.json"
            registry={registry}
            config={{ label: "Never" }}
            services={services}
          />
        </Card>

        <Card title="7 · invalid configuration">
          <Gadget
            module={counterModule}
            config={{ label: "Bad", step: 0 }}
            services={services}
          />
        </Card>

        <Card title="8 · gadget throws while rendering">
          <Gadget
            module={counterModule}
            config={{ label: "__boom__" }}
            services={services}
          />
        </Card>

        <Card title="9 · host's own control (leak probe)">
          <button type="button" className="host-probe">
            Host button
          </button>
        </Card>
      </div>

      <pre id="results">
        {checks
          ? checks
              .map(
                (c) =>
                  `${c.pass ? "PASS" : "FAIL"}  ${c.name}\n        ${c.detail}`,
              )
              .join("\n")
          : "running…"}
      </pre>
      <pre id="summary">
        {checks
          ? `${checks.filter((c) => c.pass).length}/${checks.length} checks passed`
          : ""}
      </pre>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Dashboard />);
