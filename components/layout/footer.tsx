import Link from 'next/link'
import { FaLinkedin } from 'react-icons/fa'

interface FooterLinkProps {
  href: string
  children: React.ReactNode
}

function FooterLink({ href, children }: FooterLinkProps) {
  return (
    <Link
      href={href}
      className="text-marketing-hero-foreground-muted transition-colors hover:text-marketing-hero-foreground"
    >
      {children}
    </Link>
  )
}

function ComingSoonItem({ label }: { label: string }) {
  return (
    <span className="text-marketing-hero-foreground-muted/70">
      {label}{' '}
      <span className="text-xs text-marketing-hero-foreground-muted/50">
        (Soon)
      </span>
    </span>
  )
}

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-marketing-hero-from to-marketing-hero-to py-16 text-marketing-hero-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4">
              <span className="text-xl font-semibold tracking-tight">
                CPAAutomation
              </span>
            </div>
            <p className="mb-4 text-sm text-marketing-hero-foreground-muted">
              The AI platform for accounting, finance, and legal professionals.
            </p>
            <div className="flex gap-4">
              <a
                href="https://www.linkedin.com/company/cpa-automation-inc"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="CPAAutomation on LinkedIn"
                className="text-marketing-hero-foreground-muted transition-colors hover:text-marketing-hero-foreground"
              >
                <FaLinkedin className="size-5" aria-hidden />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-marketing-hero-foreground">
              Products
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <FooterLink href="/features">Document Analysis</FooterLink>
              </li>
              <li>
                <FooterLink href="/dashboard/form-fill">Form Fill</FooterLink>
              </li>
              <li>
                <FooterLink href="/dashboard/inkwise">Inkwise</FooterLink>
              </li>
              <li>
                <FooterLink href="/#chrona-showcase">Chrona</FooterLink>
              </li>
              <li>
                <FooterLink href="/claw">Claw Series</FooterLink>
              </li>
              <li>
                <FooterLink href="/dashboard/analytics">
                  AI Analytics Suite
                </FooterLink>
              </li>
              <li>
                <ComingSoonItem label="AI Productivity Suite" />
              </li>
              <li>
                <FooterLink href="/dashboard/cpe-tracker">
                  CPE Tracker
                </FooterLink>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-marketing-hero-foreground">
              Resources
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <FooterLink href="/docs">Documentation</FooterLink>
              </li>
              <li>
                <FooterLink href="/demo">Demo</FooterLink>
              </li>
              <li>
                <FooterLink href="/pricing">Pricing</FooterLink>
              </li>
              <li>
                <FooterLink href="/case-study/LFO">Case study</FooterLink>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-marketing-hero-foreground">
              Company
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <FooterLink href="/about">About</FooterLink>
              </li>
              <li>
                <FooterLink href="/contact">Contact</FooterLink>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-marketing-hero-foreground">
              Legal
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <FooterLink href="/privacy">Privacy policy</FooterLink>
              </li>
              <li>
                <FooterLink href="/terms">Terms of service</FooterLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-marketing-hero-border pt-8 text-center">
          <p className="text-sm text-marketing-hero-foreground-muted/70">
            &copy; {new Date().getFullYear()} CPA Automation, Inc. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
