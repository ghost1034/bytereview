import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "@/taxatlas-ui/lib/navigation";
import { ApiError } from "@/taxatlas-ui/lib/api";
import { copyText } from "@/taxatlas-ui/lib/utils";
import { Button } from "@/taxatlas-ui/components/ui/Button";
import { CodeBlock } from "@/taxatlas-ui/components/ui/CodeBlock";

interface State {
  error: Error | null;
  copied: boolean;
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "integrated";

class Boundary extends Component<{ children: ReactNode; route: string }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[TaxAtlas] render error", error, info.componentStack);
  }

  componentDidUpdate(prev: { route: string }): void {
    // A navigation clears the failure so the user can move on without a hard reload.
    if (prev.route !== this.props.route && this.state.error) this.setState({ error: null, copied: false });
  }

  diagnostics(): string {
    const { error } = this.state;
    const api = error instanceof ApiError ? error : null;
    return [
      `route: ${this.props.route}`,
      `time: ${new Date().toISOString()}`,
      `version: ${APP_VERSION}`,
      `user-agent: ${navigator.userAgent}`,
      api ? `request: ${api.path} → ${api.status}${api.requestId ? ` (request id ${api.requestId})` : ""}` : null,
      "",
      error?.stack ?? `${error?.name}: ${error?.message}`,
    ]
      .filter((l) => l !== null)
      .join("\n");
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const page = this.props.route.split("?")[0];
    const head = `${page} · ${error.name}: ${error.message}`;
    return (
      <div role="alert" className="page-inner">
        <div className="mt-[60px] max-w-[72ch]">
          <h1 className="serif text-2xl text-ink-1">Something failed while rendering this page.</h1>
          <p className="mt-2 text-base text-ink-2">Your data is safe. Reloading usually fixes it; if it keeps happening, copy the diagnostics below and share them.</p>
          <div className="mt-4">
            <CodeBlock label="error" code={[head, ...(error.stack ?? "").split("\n").slice(1)].join("\n")} copyText={this.diagnostics()} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Link to="/map" className="btn">
              Go to map
            </Link>
            <Button
              variant="ghost"
              onClick={async () => {
                if (await copyText(this.diagnostics())) {
                  this.setState({ copied: true });
                  window.setTimeout(() => this.setState({ copied: false }), 1500);
                }
              }}
            >
              {this.state.copied ? "Diagnostics copied" : "Report: copy diagnostics"}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/** Router-aware boundary: resets when the route changes and reports the failing route in the fallback. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <Boundary route={loc.pathname + loc.search}>{children}</Boundary>;
}
