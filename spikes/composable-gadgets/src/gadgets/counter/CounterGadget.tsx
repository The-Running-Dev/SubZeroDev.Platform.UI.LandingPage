import { useEffect, useState } from "react";
import type { GadgetProps } from "../../contract/index.js";
import type { CounterConfig } from "./config.js";

/**
 * Deliberately trivial: a heading, a value, a button, an emitted event, a
 * theme variation, a slot, and one way to be told to fail. It exists to be
 * mounted four different ways, not to be looked at.
 */
export function CounterGadget({
  config,
  services,
  slots,
  theme,
}: GadgetProps<CounterConfig>) {
  const [value, setValue] = useState(config.start ?? 0);
  const step = config.step ?? 1;

  useEffect(() => {
    services?.log?.info(`counter '${config.label}' mounted`);
    // The teardown a clean unmount has to actually run. The proof counts these.
    return () => services?.log?.info(`counter '${config.label}' unmounted`);
  }, [services, config.label]);

  // The render-failure case, reachable through configuration so the proof can
  // trigger it without a second gadget.
  if (config.label === "__boom__") throw new Error("counter render exploded");

  return (
    <section className="szd-gadget-counter" data-theme={theme ?? "cold"}>
      <h2 className="szd-gadget-counter__heading">{config.label}</h2>
      <output className="szd-gadget-counter__value">{value}</output>
      <button
        type="button"
        className="szd-gadget-counter__button"
        onClick={() => {
          // Functional update, not `value + step`: two clicks inside one tick
          // read the same closure and the second would be lost. The proof
          // clicks synchronously, which is exactly the case that finds this.
          setValue((current) => {
            const next = current + step;
            services?.emit?.({
              type: "counter:changed",
              source: "counter",
              payload: next,
            });
            return next;
          });
        }}
      >
        Add {step}
      </button>
      {config.detailsHref && (
        <a
          className="szd-gadget-counter__link"
          href={config.detailsHref}
          onClick={(event) => {
            if (!services?.navigate) return;
            event.preventDefault();
            services.navigate(config.detailsHref!);
          }}
        >
          Details
        </a>
      )}
      {slots?.footer}
    </section>
  );
}
