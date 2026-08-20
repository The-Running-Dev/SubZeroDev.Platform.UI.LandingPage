import { GadgetError } from "../../contract/index.js";

/** Immutable startup configuration. Not data, not services, not theme. */
export type CounterConfig = {
  label: string;
  start?: number;
  step?: number;
  /** Where the gadget's "details" affordance points. Host may intercept. */
  detailsHref?: string;
};

/**
 * The gadget owns this, because the gadget is the only thing that knows what
 * its own configuration means. A runtime-loaded gadget receives configuration
 * from a host that never type-checked it, so this is the boundary that earns
 * `CounterConfig` — never a cast.
 */
export function validateCounterConfig(raw: unknown): CounterConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new GadgetError(
      "config-invalid",
      "counter config must be an object.",
      "counter",
    );
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!["label", "start", "step", "detailsHref"].includes(key))
      throw new GadgetError(
        "config-invalid",
        `counter config has unknown field '${key}'.`,
        "counter",
      );
  if (typeof value.label !== "string" || value.label === "")
    throw new GadgetError(
      "config-invalid",
      "counter config 'label' must be a non-empty string.",
      "counter",
    );
  for (const key of ["start", "step"] as const)
    if (value[key] !== undefined && typeof value[key] !== "number")
      throw new GadgetError(
        "config-invalid",
        `counter config '${key}' must be a number.`,
        "counter",
      );
  if (value.step !== undefined && value.step === 0)
    throw new GadgetError(
      "config-invalid",
      "counter config 'step' must not be zero.",
      "counter",
    );
  if (value.detailsHref !== undefined && typeof value.detailsHref !== "string")
    throw new GadgetError(
      "config-invalid",
      "counter config 'detailsHref' must be a string.",
      "counter",
    );
  return value as CounterConfig;
}
