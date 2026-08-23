/**
 * The proof's assertions, run in a real browser against the real DOM after the
 * page has settled. Written as DOM queries rather than as unit assertions
 * because the claims being made — one React, styles arrived, a failure stayed
 * inside its own subtree — are only true of an actually rendered document.
 */
export type CheckResult = { name: string; pass: boolean; detail: string };

const results: CheckResult[] = [];

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 4000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}

function counterIn(scope: ParentNode, label: string): HTMLElement | null {
  return (
    [...scope.querySelectorAll<HTMLElement>(".szd-gadget-counter")].find(
      (node) =>
        node.querySelector(".szd-gadget-counter__heading")?.textContent ===
        label,
    ) ?? null
  );
}

function valueOf(counter: HTMLElement | null): string {
  return (
    counter?.querySelector(".szd-gadget-counter__value")?.textContent ?? ""
  );
}

type SpikeGlobals = {
  reactIdentity?: boolean;
  log: string[];
  unmountShadow?: () => void;
  remountShadow?: () => void;
  shadowHost?: HTMLElement;
};

export async function runChecks(): Promise<CheckResult[]> {
  results.length = 0;
  const spike = (window as unknown as { __SPIKE__: SpikeGlobals }).__SPIKE__;

  // 1 — build-time React composition, two independently configured instances.
  const a = counterIn(document, "Downloads");
  const b = counterIn(document, "Signups");
  record(
    "build-time-composition",
    Boolean(a && b),
    `Downloads=${Boolean(a)} Signups=${Boolean(b)}`,
  );
  record(
    "two-instances-distinct-config",
    valueOf(a) === "0" && valueOf(b) === "100",
    `start values ${valueOf(a)} / ${valueOf(b)}`,
  );
  a?.querySelector("button")?.click();
  a?.querySelector("button")?.click();
  await sleep(0);
  record(
    "two-instances-independent-state",
    valueOf(a) === "2" && valueOf(b) === "100",
    `after two clicks on Downloads: ${valueOf(a)} / ${valueOf(b)}`,
  );

  // 2 — runtime discovery and loading, inside a container gadget's slot.
  const loaded = await waitFor(() => Boolean(counterIn(document, "Remote")));
  const remote = counterIn(document, "Remote");
  record("runtime-loaded-from-manifest", loaded, `entry mounted=${loaded}`);
  record(
    "nested-composition",
    Boolean(document.querySelector(".szd-gadget-panel .szd-gadget-counter")),
    "counter rendered inside panel's host-supplied slot",
  );

  // 3 — one React, proven by identity rather than by absence of symptoms.
  record(
    "single-react-instance",
    spike.reactIdentity === true,
    `Object.is(remote.runtimeReact, host React) = ${String(spike.reactIdentity)}`,
  );

  // 4 — the runtime-loaded instance is styled. In the light DOM this is only
  // weak evidence: the host imported the same stylesheet at build time for its
  // own instances. The load-time injection is proven in the shadow root below,
  // which the document's own <link> elements cannot reach.
  const remoteBg = remote
    ? getComputedStyle(remote).backgroundColor
    : "(no element)";
  record(
    "runtime-loaded-instance-is-styled",
    remoteBg === "rgb(216, 236, 247)",
    `background-color ${remoteBg}`,
  );

  // 5 — theming: two instances, two flavours, one stylesheet.
  const warmBg = b ? getComputedStyle(b).backgroundColor : "(no element)";
  record(
    "two-themes-on-one-page",
    warmBg === "rgb(247, 230, 216)" && remoteBg === "rgb(216, 236, 247)",
    `warm ${warmBg} vs cold ${remoteBg}`,
  );

  // 6 — styling boundary, measured in both directions.
  const lightButton = a?.querySelector("button");
  const lightSpacing = lightButton
    ? getComputedStyle(lightButton).letterSpacing
    : "(none)";
  record(
    "host-css-reaches-into-light-dom-gadget",
    lightSpacing === "4px",
    `host 'button {letter-spacing:4px}' produced ${lightSpacing} inside the gadget — naming conventions do not stop inbound cascade`,
  );
  const shadowHost = spike.shadowHost;
  const shadowCounter = shadowHost?.shadowRoot
    ? counterIn(shadowHost.shadowRoot, "Isolated")
    : null;
  const shadowButton = shadowCounter?.querySelector("button");
  const shadowSpacing = shadowButton
    ? getComputedStyle(shadowButton).letterSpacing
    : "(none)";
  record(
    "shadow-dom-blocks-inbound-host-css",
    shadowSpacing === "normal",
    `same host rule produced ${shadowSpacing} inside the shadow root`,
  );
  const shadowBg = shadowCounter
    ? getComputedStyle(shadowCounter).backgroundColor
    : "(none)";
  record(
    "manifest-styles-injected-into-isolated-root",
    shadowBg === "rgb(216, 236, 247)",
    `shadow-root instance is styled (${shadowBg}) although no document <link> can reach it — the stylesheet came from the manifest`,
  );
  const probe = document.querySelector<HTMLElement>(".host-probe");
  const gadgetAccent = "rgb(28, 110, 164)";
  const probeBorder = probe ? getComputedStyle(probe).borderColor : "(none)";
  record(
    "gadget-css-does-not-leak-outward",
    Boolean(probe) && probeBorder !== gadgetAccent,
    `host button keeps its user-agent border (${probeBorder}), not the gadget's ${gadgetAccent} — no prefixed selector can match an unprefixed host element`,
  );

  // 7 — four independent failure modes, each contained.
  for (const [name, code] of [
    ["failure-contract-incompatible", "contract-incompatible"],
    ["failure-entry-unreachable", "entry-unreachable"],
    ["failure-config-invalid", "config-invalid"],
    ["failure-render-threw", "render-failed"],
  ] as const) {
    const found = await waitFor(() =>
      Boolean(document.querySelector(`[data-gadget-error="${code}"]`)),
    );
    record(name, found, `fallback with data-gadget-error="${code}"`);
  }
  record(
    "host-survives-every-failure",
    document.querySelectorAll(".szd-gadget-fallback").length === 4 &&
      Boolean(counterIn(document, "Downloads")),
    `${document.querySelectorAll(".szd-gadget-fallback").length} contained failures, healthy gadgets still mounted`,
  );

  // 8 — clean unmount, then remount, on the imperatively mounted instance.
  const before = spike.log.length;
  spike.unmountShadow?.();
  await sleep(50);
  const leftover = [...(shadowHost?.shadowRoot?.children ?? [])];
  const torndown =
    spike.log.slice(before).some((line) => line.includes("unmounted")) &&
    !shadowHost?.shadowRoot?.querySelector(".szd-gadget-counter") &&
    leftover.every((node) => node.tagName === "LINK");
  record(
    "clean-unmount",
    torndown,
    `effect cleanup ran, no gadget DOM left; residue is only the injected stylesheet (${leftover.map((n) => n.tagName).join(",") || "none"}), kept deliberately for remount`,
  );
  spike.remountShadow?.();
  const remounted = await waitFor(() =>
    Boolean(
      shadowHost?.shadowRoot &&
      counterIn(shadowHost.shadowRoot, "Isolated") &&
      valueOf(counterIn(shadowHost.shadowRoot, "Isolated")) === "7",
    ),
  );
  record(
    "remount-with-fresh-state",
    remounted,
    "same module re-rendered from the registry cache, state back at configured start",
  );

  (
    window as unknown as { __SPIKE_RESULTS__: CheckResult[] }
  ).__SPIKE_RESULTS__ = results;
  return results;
}
