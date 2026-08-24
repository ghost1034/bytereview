'use client'

import Link from 'next/link'
import { Linkedin } from 'lucide-react'

import { useCookieConsentContext } from '@/components/privacy/CookieConsentProvider'
import { footerGroups } from '@/lib/marketing/config'

export function MarketingFooter() {
  const { openPreferences } = useCookieConsentContext()

  return (
    <footer className="ps-footer">
      <div className="ps-container">
        <div className="ps-footer__top">
          <div className="ps-footer__brand">
            <Link className="ps-brand ps-brand--footer" href="/" aria-label="CPAAutomation home"><span className="ps-brand__mark">C</span><span>CPA<span>Automation</span></span></Link>
            <p>The AI platform for accounting, finance, and legal professionals.</p>
            <a className="ps-social" href="https://www.linkedin.com/company/cpa-automation-inc" target="_blank" rel="noreferrer" aria-label="CPAAutomation on LinkedIn"><Linkedin size={18} /></a>
          </div>
          {footerGroups.map((group) => (
            <div className="ps-footer__group" key={group.title}>
              <h2>{group.title}</h2>
              {group.links.map((link) => <Link key={link.label} href={link.href}>{link.label}</Link>)}
            </div>
          ))}
        </div>
        <div className="ps-footer__bottom">
          <p>© {new Date().getFullYear()} CPA Automation, Inc. All rights reserved.</p>
          <button type="button" onClick={openPreferences}>Cookie preferences</button>
        </div>
      </div>
    </footer>
  )
}
