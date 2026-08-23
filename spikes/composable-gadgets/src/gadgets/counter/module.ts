import * as React from "react";
import type { GadgetModule } from "../../contract/index.js";
import { GADGET_CONTRACT_VERSION } from "../../contract/index.js";
import { CounterGadget } from "./CounterGadget.js";
import { validateCounterConfig, type CounterConfig } from "./config.js";

/**
 * The gadget's descriptor: identity, version, contract version, component,
 * validator. One value, used unchanged by the build-time import, the runtime
 * entry, and the standalone bootstrap — which is what makes "no duplicated UI"
 * a structural property rather than a discipline.
 */
export const counterModule: GadgetModule<CounterConfig> = {
  id: "counter",
  version: "0.1.0",
  contractVersion: GADGET_CONTRACT_VERSION,
  displayName: "Counter",
  Component: CounterGadget,
  validateConfig: validateCounterConfig,
  runtimeReact: React,
};

export default counterModule;
