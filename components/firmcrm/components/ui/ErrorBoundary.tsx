import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("UI error", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center bg-crm-sand-50 p-8">
        <div className="card w-full max-w-md p-6 text-[13px] leading-5">
          <div className="text-[15px] leading-[22px] font-semibold tracking-[-0.01em] text-crm-sand-900">Something went wrong</div>
          <p className="mt-1 text-crm-sand-600">The page hit an unexpected error. Your data is safe; reload to continue. If it persists, send the reference below to your administrator.</p>
          <pre className="mono mt-4 max-h-32 overflow-auto rounded-crm-md border border-crm-sand-150 bg-crm-sand-25 p-3 text-crm-sand-700 whitespace-pre-wrap">{this.state.error.message}</pre>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center rounded-crm-md border border-crm-accent-600 bg-crm-accent-600 px-3 font-medium text-white hover:bg-crm-accent-700">Reload</button>
            <button type="button" onClick={() => { window.location.href = "/"; }} className="inline-flex h-8 items-center rounded-crm-md border border-crm-sand-200 bg-crm-sand-0 px-3 font-medium text-crm-sand-900 hover:bg-crm-sand-25">Go to dashboard</button>
          </div>
        </div>
      </div>
    );
  }
}
