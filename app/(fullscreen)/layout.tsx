import PublicHeader from '@/components/public-site/header'
import '../(general)/public-site.css'

interface FullscreenLayoutProps {
  children: React.ReactNode
}

// Fullscreen pages (e.g. the LLM governance deck) keep the site header but omit
// the footer and lock the page to the viewport so nothing scrolls past the content.
export default function FullscreenLayout({ children }: FullscreenLayoutProps) {
  return (
    <div className="ps-site flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <a href="#main-content" className="ps-skip-link">Skip to content</a>
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-hidden pt-20 outline-none focus-visible:outline-none"
      >
        {children}
      </main>
    </div>
  )
}
