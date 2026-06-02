import Header from '@/components/layout/header'

interface FullscreenLayoutProps {
  children: React.ReactNode
}

// Fullscreen pages (e.g. the LLM governance deck) keep the site header but omit
// the footer and lock the page to the viewport so nothing scrolls past the content.
export default function FullscreenLayout({ children }: FullscreenLayoutProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-hidden pt-[var(--header-height)] outline-none focus-visible:outline-none"
      >
        {children}
      </main>
    </div>
  )
}
