'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'

import { apiClient } from '@/lib/api'
import { PRODUCTS } from './content'

export default function PublicFooter() {
  const pathname = usePathname()
  const [form, setForm] = useState({ name: '', company: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('submitting')
    try {
      await apiClient.submitContact({ ...form, subject: 'Website inquiry', inquiryType: 'general' } as Parameters<typeof apiClient.submitContact>[0])
      setStatus('success')
      setForm({ name: '', company: '', email: '', message: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <footer className="ps-footer">
      <video
        className="ps-footer__video"
        autoPlay
        muted
        loop
        playsInline
        poster="/public-site/footer-poster.jpg"
        aria-hidden
      >
        <source src="/public-site/footer.webm" type="video/webm" />
        <source src="/public-site/footer.mp4" type="video/mp4" />
      </video>
      <div className="ps-footer__shade" aria-hidden />
      <div className="ps-container ps-footer__inner">
        {pathname === '/contact' ? (
          <section className="ps-footer-cta ps-footer-cta--compact">
            <span className="ps-footer-cta__orbit" aria-hidden />
            <div><span className="ps-footer-cta__eyebrow">Built for professional work</span><h2>One platform. Less manual work.</h2></div>
          </section>
        ) : (
          <section className="ps-footer-cta ps-footer-cta--form">
            <span className="ps-footer-cta__orbit" aria-hidden />
            <div><span className="ps-footer-cta__eyebrow">Start a conversation</span><h2>What work should your team never do manually again?</h2></div>
            <form onSubmit={submit}>
              <input required placeholder="Your name*" aria-label="Your name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              <input required placeholder="Company*" aria-label="Company" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} />
              <input required type="email" placeholder="Business email*" aria-label="Business email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              <textarea required placeholder="Tell us about the workflow*" aria-label="Tell us about the workflow" value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} />
              <button type="submit" disabled={status === 'submitting'}>{status === 'submitting' ? 'Sending…' : status === 'success' ? 'Request received' : 'Send your request'}<ArrowUpRight /></button>
              {status === 'error' && <p role="alert">Something went wrong. Please try again or use the contact page.</p>}
            </form>
          </section>
        )}

        <div className="ps-footer__links">
          <div className="ps-footer__brand">
            <Link href="/" className="ps-wordmark ps-wordmark--light">
              <span className="ps-wordmark__mark" aria-hidden>CA</span>
              <span>CPAAutomation</span>
            </Link>
            <p>One AI platform for accounting, finance, and legal professionals.</p>
            <a href="https://www.linkedin.com/company/cpa-automation-inc" target="_blank" rel="noreferrer">
              LinkedIn <ArrowUpRight aria-hidden />
            </a>
          </div>
          <div>
            <h3>Products</h3>
            {PRODUCTS.slice(0, 6).map((product) => (
              <Link key={product.name} href={product.href}>{product.name}</Link>
            ))}
          </div>
          <div>
            <h3>Platform</h3>
            {PRODUCTS.slice(6).map((product) => (
              <Link key={product.name} href={product.href}>{product.name}</Link>
            ))}
          </div>
          <div>
            <h3>Company</h3>
            <Link href="/demo">Demo</Link>
            <Link href="/consulting">Consulting</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
        <div className="ps-footer__bottom">
          <span>© {new Date().getFullYear()} CPA Automation, Inc.</span>
          <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </div>
      </div>
    </footer>
  )
}
