/**
 * Static, pure-CSS backdrop for the hero. Renders as the always-present base layer
 * behind the WebGL canvas (visible during the 3D chunk download and permanently when
 * WebGL is unavailable / reduced-motion). Decorative only.
 */
export function HeroPoster() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-gradient-to-br from-marketing-hero-from to-marketing-hero-to"
    >
      {/* Accent glows — kept faint so the static poster matches the calmer live scene */}
      <span className="animate-glow-pulse pointer-events-none absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-accent-blue-400/10 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-40 right-1/4 h-[480px] w-[480px] rounded-full bg-accent-blue-500/5 blur-3xl" />
      {/* Faint data grid */}
      <span className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(hsl(var(--marketing-hero-border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--marketing-hero-border))_1px,transparent_1px)] [background-size:44px_44px]" />
      {/* Bottom fade into the page */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}
