interface FullscreenLayoutProps {
  children: React.ReactNode
}

// Isolate self-contained fullscreen experiences from the public-site redesign.
export default function FullscreenLayout({ children }: FullscreenLayoutProps) {
  return (
    <main id="main-content" className="h-dvh w-full overflow-hidden">
      {children}
    </main>
  )
}
