import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GadgetHostServices } from "../src/contract/index.js";
import { Gadget, RemoteGadget } from "../src/react/GadgetHost.js";
import { GadgetRegistry, type LoaderIo } from "../src/runtime/loader.js";
import counterModule from "../src/gadgets/counter/module.js";
import panelModule from "../src/gadgets/panel/PanelGadget.js";

let container: HTMLDivElement;
let root: Root;
const log: string[] = [];
const events: string[] = [];
const services: GadgetHostServices = {
  log: { info: (m) => log.push(m), error: (m) => log.push(`ERROR ${m}`) },
  emit: (event) => events.push(`${event.source}/${event.type}`),
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  log.length = 0;
  events.length = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => root.render(node));
}

function counters() {
  return [...container.querySelectorAll<HTMLElement>(".szd-gadget-counter")];
}

function read(node: HTMLElement) {
  return {
    label: node.querySelector(".szd-gadget-counter__heading")?.textContent,
    value: node.querySelector(".szd-gadget-counter__value")?.textContent,
    theme: node.dataset.theme,
  };
}

describe("build-time composition", () => {
  it("renders two independently configured instances of one gadget", () => {
    render(
      <>
        <Gadget
          module={counterModule}
          config={{ label: "A", start: 0, step: 1 }}
          services={services}
          theme="cold"
        />
        <Gadget
          module={counterModule}
          config={{ label: "B", start: 100, step: 5 }}
          services={services}
          theme="warm"
        />
      </>,
    );
    expect(counters().map(read)).toEqual([
      { label: "A", value: "0", theme: "cold" },
      { label: "B", value: "100", theme: "warm" },
    ]);
  });

  it("keeps instance state and emitted events separate", () => {
    render(
      <>
        <Gadget
          module={counterModule}
          config={{ label: "A", step: 1 }}
          services={services}
        />
        <Gadget
          module={counterModule}
          config={{ label: "B", start: 100, step: 5 }}
          services={services}
        />
      </>,
    );
    act(() => {
      counters()[0].querySelector("button")!.click();
      counters()[0].querySelector("button")!.click();
    });
    expect(counters().map((node) => read(node).value)).toEqual(["2", "100"]);
    expect(events).toEqual([
      "counter/counter:changed",
      "counter/counter:changed",
    ]);
  });

  it("stamps the emitting gadget's id onto every event, whatever the gadget claimed", () => {
    render(
      <Gadget
        module={counterModule}
        config={{ label: "A" }}
        services={services}
      />,
    );
    act(() => counters()[0].querySelector("button")!.click());
    expect(events).toEqual(["counter/counter:changed"]);
  });
});

describe("nested composition", () => {
  it("renders a gadget inside a container gadget's host-supplied slot", () => {
    render(
      <Gadget
        module={panelModule}
        config={{ title: "Panel" }}
        services={services}
        slots={{
          body: (
            <Gadget
              module={counterModule}
              config={{ label: "Child" }}
              services={services}
            />
          ),
        }}
      />,
    );
    const nested = container.querySelector(
      ".szd-gadget-panel .szd-gadget-counter",
    );
    expect(nested).not.toBeNull();
    expect(read(nested as HTMLElement).label).toBe("Child");
  });
});

describe("failure isolation", () => {
  it("contains an invalid configuration and leaves the sibling mounted", () => {
    render(
      <>
        <Gadget
          module={counterModule}
          config={{ label: "Good" }}
          services={services}
        />
        <Gadget
          module={counterModule}
          config={{ label: "Bad", step: 0 }}
          services={services}
        />
      </>,
    );
    expect(
      container.querySelector('[data-gadget-error="config-invalid"]'),
    ).not.toBeNull();
    expect(counters().map((node) => read(node).label)).toEqual(["Good"]);
  });

  it("contains a render-time throw", () => {
    const noise = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <>
        <Gadget
          module={counterModule}
          config={{ label: "Good" }}
          services={services}
        />
        <Gadget
          module={counterModule}
          config={{ label: "__boom__" }}
          services={services}
        />
      </>,
    );
    expect(
      container.querySelector('[data-gadget-error="render-failed"]'),
    ).not.toBeNull();
    expect(counters()).toHaveLength(1);
    noise.mockRestore();
  });

  it("contains an unreachable remote entry", async () => {
    const io: LoaderIo = {
      fetchJson: async () => ({
        schemaVersion: 1,
        id: "counter",
        version: "0.1.0",
        displayName: "Counter",
        entry: "/missing.js",
        contractVersion: 1,
      }),
      importModule: async () => {
        throw new Error("404");
      },
    };
    render(
      <>
        <Gadget
          module={counterModule}
          config={{ label: "Good" }}
          services={services}
        />
        <RemoteGadget
          manifestUrl="/m.json"
          registry={new GadgetRegistry(io)}
          config={{ label: "Never" }}
          services={services}
        />
      </>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-gadget-error="entry-unreachable"]'),
    ).not.toBeNull();
    expect(counters()).toHaveLength(1);
  });
});

describe("lifecycle", () => {
  it("tears the gadget down on unmount and starts clean on remount", () => {
    render(
      <Gadget
        module={counterModule}
        config={{ label: "A", start: 3 }}
        services={services}
      />,
    );
    act(() => counters()[0].querySelector("button")!.click());
    expect(read(counters()[0]).value).toBe("4");

    act(() => root.render(null));
    expect(counters()).toHaveLength(0);
    expect(log).toEqual(["counter 'A' mounted", "counter 'A' unmounted"]);

    render(
      <Gadget
        module={counterModule}
        config={{ label: "A", start: 3 }}
        services={services}
      />,
    );
    expect(read(counters()[0]).value).toBe("3");
    expect(log.filter((line) => line.includes("mounted"))).toHaveLength(3);
  });
});
