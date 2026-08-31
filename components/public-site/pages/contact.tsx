'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertCircle, CheckCircle2, Clock3, Mail, MapPin, Phone, Send } from 'lucide-react'

import { apiClient } from '@/lib/api'
import { PageHero, Reveal, SectionHeading } from '../ui'

const INITIAL_FORM = {
  name: '',
  email: '',
  company: '',
  inquiryType: '',
  subject: '',
  message: '',
}

export default function PublicContact() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.inquiryType) {
      setStatus('error')
      setError('Please select an inquiry type.')
      return
    }
    setStatus('submitting')
    setError('')
    try {
      await apiClient.submitContact(form as Parameters<typeof apiClient.submitContact>[0])
      setStatus('success')
      setForm(INITIAL_FORM)
    } catch (submissionError) {
      setStatus('error')
      setError(submissionError instanceof Error ? submissionError.message : 'Your message could not be sent. Please try again.')
    }
  }

  return (
    <>
      <PageHero eyebrow="Contact" title={<>Tell us about the work <span className="ps-gradient-text">you want to transform.</span></>} description="Questions about the platform, enterprise deployment, or a custom AI build? Reach the team directly." />
      <section className="ps-section">
        <div className="ps-container ps-contact-layout">
          <Reveal className="ps-contact-form-card">
            <div className="ps-contact-form-card__head"><span>001 · Send a message</span><Send /></div>
            <form onSubmit={submit} className="ps-contact-form">
              <label>Full name *<input required value={form.name} onChange={(event) => update('name', event.target.value)} autoComplete="name" /></label>
              <label>Work email *<input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} autoComplete="email" /></label>
              <label>Company<input value={form.company} onChange={(event) => update('company', event.target.value)} autoComplete="organization" /></label>
              <label>Inquiry type *<select required value={form.inquiryType} onChange={(event) => update('inquiryType', event.target.value)}><option value="">Select an inquiry type</option><option value="sales">Sales &amp; pricing</option><option value="support">Technical support</option><option value="enterprise">Enterprise solutions</option><option value="partnership">Partnership</option><option value="general">General question</option></select></label>
              <label className="ps-contact-form__wide">Subject *<input required value={form.subject} onChange={(event) => update('subject', event.target.value)} /></label>
              <label className="ps-contact-form__wide">Message *<textarea required rows={6} value={form.message} onChange={(event) => update('message', event.target.value)} /></label>
              {status === 'success' && <div className="ps-form-status ps-form-status--success" role="status"><CheckCircle2 />Thank you. Your message has been received.</div>}
              {status === 'error' && <div className="ps-form-status ps-form-status--error" role="alert"><AlertCircle />{error}</div>}
              <button className="ps-submit" type="submit" disabled={status === 'submitting'}><span>{status === 'submitting' ? 'Sending…' : 'Send message'}</span><Send /></button>
            </form>
          </Reveal>
          <aside className="ps-contact-aside">
            <Reveal><span>Direct contact</span><h2>Talk to a person who understands the platform.</h2><p>Our US-based team can route product, technical, enterprise, and consulting questions.</p></Reveal>
            <div className="ps-contact-methods">
              {[[Mail, 'Email', 'support@CPAAutomation.ai', 'sales@CPAAutomation.ai'], [Phone, 'Phone', '(415) 680-5881', '(513) 593-1883'], [Clock3, 'Hours', 'Monday–Friday', '9:00 AM–6:00 PM EST'], [MapPin, 'Office', 'United States', 'US-based support team']].map(([Icon, label, line1, line2]) => { const MethodIcon = Icon as typeof Mail; return <Reveal key={label as string}><MethodIcon /><div><strong>{label as string}</strong><span>{line1 as string}</span><span>{line2 as string}</span></div></Reveal> })}
            </div>
          </aside>
        </div>
      </section>
      <section className="ps-section ps-section--soft">
        <div className="ps-container">
          <SectionHeading number="002" eyebrow="Who you will hear from" title="A small team, close to the work." />
          <div className="ps-people-grid">
            <Reveal><Image src="/ian.jpg" alt="Ian Stewart" width={500} height={500} /><div><h3>Ian Stewart</h3><p>Founder &amp; engineer</p><a href="mailto:ianstewart@cpaautomation.ai">ianstewart@cpaautomation.ai</a></div></Reveal>
            <Reveal><Image src="/ray.jpg" alt="Ray Sang" width={500} height={500} /><div><h3>Ray Sang</h3><p>Finance systems</p><a href="mailto:raysang@cpaautomation.ai">raysang@cpaautomation.ai</a></div></Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
