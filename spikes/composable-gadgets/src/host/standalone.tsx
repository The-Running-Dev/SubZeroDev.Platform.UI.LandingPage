import { createRoot } from "react-dom/client";
import type { GadgetHostServices } from "../contract/index.js";
import { Gadget } from "../react/GadgetHost.js";
import counterModule from "../gadgets/counter/module.js";
import "../gadgets/counter/counter.css";

/**
 * The gadget as its own application. Everything here is wrapper concern —
 * document metadata, default services, the configuration source, branding —
 * and none of it is UI. The component rendered is the same value the dashboard
 * imports and the same value the remote bundle exports.
 */
document.title = "Counter — standalone";

const services: GadgetHostServices = {
  log: { info: () => {}, error: (m) => console.error(m) },
  emit: (event) => console.info("event", event),
};

const config = { label: "Standalone counter", start: 42, step: 3 };

createRoot(document.getElementById("root")!).render(
  <Gadget
    module={counterModule}
    config={config}
    services={services}
    theme="warm"
  />,
);
