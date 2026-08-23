import { Component, type ErrorInfo, type ReactNode } from "react";
import { GadgetError } from "../contract/index.js";

export type GadgetFailure = {
  code: string;
  message: string;
  gadgetId?: string;
};

export function toFailure(error: unknown, gadgetId?: string): GadgetFailure {
  if (error instanceof GadgetError)
    return {
      code: error.code,
      message: error.message,
      gadgetId: error.gadgetId ?? gadgetId,
    };
  return {
    code: "render-failed",
    message: error instanceof Error ? error.message : String(error),
    gadgetId,
  };
}

/**
 * Contains a gadget's render-time failure so the rest of the page survives it.
 * A class component because that is still the only way to catch a render
 * throw; the boundary is the *host's*, which is why it lives in this layer and
 * not inside any gadget.
 */
export class GadgetBoundary extends Component<
  {
    gadgetId: string;
    children: ReactNode;
    onFailure?: (failure: GadgetFailure) => void;
    fallback?: (failure: GadgetFailure) => ReactNode;
  },
  { failure: GadgetFailure | null }
> {
  state: { failure: GadgetFailure | null } = { failure: null };

  static getDerivedStateFromError(error: unknown) {
    return { failure: toFailure(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const failure = toFailure(error, this.props.gadgetId);
    this.props.onFailure?.(failure);
    void info;
  }

  render() {
    const { failure } = this.state;
    if (!failure) return this.props.children;
    const withId = {
      ...failure,
      gadgetId: failure.gadgetId ?? this.props.gadgetId,
    };
    return this.props.fallback?.(withId) ?? <GadgetFallback failure={withId} />;
  }
}

export function GadgetFallback({ failure }: { failure: GadgetFailure }) {
  return (
    <div
      className="szd-gadget-fallback"
      role="alert"
      data-gadget-id={failure.gadgetId}
      data-gadget-error={failure.code}
    >
      <strong>{failure.gadgetId ?? "gadget"} unavailable</strong>
      <span> ({failure.code})</span>
    </div>
  );
}
