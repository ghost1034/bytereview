'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, Check, Linkedin } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AmbientVideo } from './home-interactions'
import { NAV_ITEMS } from './content'

export default function PublicFooter() {
  const pathname = usePathname()
  const [form, setForm] = useState({ name: '', company: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const submitting = useRef(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setStatus('submitting')
    try {
      await apiClient.submitContact({ ...form, subject: 'Website inquiry', inquiryType: 'general' } as Parameters<typeof apiClient.submitContact>[0])
      setStatus('success')
      setForm({ name: '', company: '', email: '', message: '' })
    } catch { setStatus('error') }
    finally { submitting.current = false }
  }

  return <footer className="ps-footer">
    <AmbientVideo name="footer" className="ps-footer__video" />
    <div className="ps-footer__shade" aria-hidden />
    <div className="ph-container ps-footer__inner">
      <div className="ps-footer__top">
        <section id="CTA-Form" className={pathname === '/contact' ? 'ps-footer-contact ps-footer-contact--compact' : 'ps-footer-contact'} aria-label="Contact CPAAutomation">
          <span className="ps-footer-contact__orbit" aria-hidden />
          <div className="ps-footer-contact__heading"><h2>Less Manual Work.<br />More Possibility.</h2><p>{pathname === '/contact' ? 'One AI platform for professional work.' : 'Tell us about the workflow your team should never have to do manually again.'}</p></div>
          {pathname !== '/contact' && (status === 'success' ? <div className="ps-footer-contact__success" role="status"><Check aria-hidden /><h3>Thank you!</h3><p>Your request has been received. We’ll be in touch.</p><button type="button" onClick={() => setStatus('idle')}>Send another message</button></div> : <form onSubmit={submit} className="ps-footer-contact__form" aria-label="Website inquiry" aria-busy={status === 'submitting'}>
            <Input required maxLength={256} autoComplete="name" placeholder="Your name*" aria-label="Your name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <Input required maxLength={256} autoComplete="organization" placeholder="Your company name*" aria-label="Company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
            <Input required maxLength={256} type="email" autoComplete="email" placeholder="Your business email*" aria-label="Business email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <Textarea required maxLength={5000} placeholder="Message*" aria-label="Tell us about the workflow" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            <button type="submit" disabled={status === 'submitting'}>{status === 'submitting' ? 'Sending…' : 'Send your request'}<ArrowUpRight aria-hidden /></button>
            {status === 'error' && <p role="alert">Your request could not be sent. Please try again or <Link href="/contact">contact us directly</Link>.</p>}
          </form>)}
        </section>
      </div>
      <div className="ps-footer-nav">
        <div className="ps-footer-nav__social"><a href="https://www.linkedin.com/company/cpa-automation-inc" target="_blank" rel="noreferrer"><Linkedin aria-hidden />LinkedIn<ArrowUpRight aria-hidden /></a><a href="mailto:support@cpaautomation.ai">support@cpaautomation.ai<ArrowUpRight aria-hidden /></a></div>
        <nav aria-label="Footer navigation">{NAV_ITEMS.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}</nav>
      </div>
      <div className="ps-footer-signoff"><Link href="/" className="ps-footer-signoff__brand" aria-label="CPAAutomation home"><Image src="/logo.png" alt="CPAAutomation" width={1050} height={350} sizes="(max-width: 479px) 240px, 312px" /></Link><div><span>© {new Date().getFullYear()} CPA Automation, Inc.</span><span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span></div></div>
    </div>
  </footer>
}
