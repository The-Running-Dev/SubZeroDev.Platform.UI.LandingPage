import * as React from "react";
import {
  GADGET_CONTRACT_VERSION,
  GadgetError,
  type GadgetModule,
  type GadgetProps,
} from "../../contract/index.js";

export type PanelConfig = { title: string };

export function validatePanelConfig(raw: unknown): PanelConfig {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>).title !== "string"
  )
    throw new GadgetError(
      "config-invalid",
      "panel config requires a string 'title'.",
      "panel",
    );
  return raw as PanelConfig;
}

/**
 * A gadget that is also a host surface. It renders whatever the *host* put in
 * `slots.body` and imports no gadget of its own — which is the whole reason
 * nesting here cannot produce a circular package dependency. Panel depends on
 * the contract; the host depends on both.
 */
export function PanelGadget({ config, slots }: GadgetProps<PanelConfig>) {
  return (
    <section className="szd-gadget-panel">
      <h2 className="szd-gadget-panel__heading">{config.title}</h2>
      {slots?.body ?? <p>No child gadget.</p>}
    </section>
  );
}

export const panelModule: GadgetModule<PanelConfig> = {
  id: "panel",
  version: "0.1.0",
  contractVersion: GADGET_CONTRACT_VERSION,
  displayName: "Panel",
  Component: PanelGadget,
  validateConfig: validatePanelConfig,
  runtimeReact: React,
};

export default panelModule;
