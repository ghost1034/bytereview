'use client'

import { FormEvent, useState } from 'react'
import { apiClient } from '@/lib/api'

export type ContactFormValues = {
  name: string
  email: string
  company: string
  inquiryType: string
  subject: string
  message: string
}

export function buildContactPayload(values: ContactFormValues) {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    company: values.company.trim() || null,
    inquiryType: values.inquiryType,
    subject: values.subject.trim(),
    message: values.message.trim(),
  }
}

const initialValues: ContactFormValues = { name: '', email: '', company: '', inquiryType: '', subject: '', message: '' }

export function ContactForm() {
  const [values, setValues] = useState(initialValues)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [validation, setValidation] = useState('')

  const change = (field: keyof ContactFormValues, value: string) => setValues((current) => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!values.inquiryType) {
      setValidation('Please select an inquiry type')
      return
    }
    setValidation('')
    setStatus('loading')
    try {
      await apiClient.submitContact(buildContactPayload(values))
      setStatus('success')
      setValues(initialValues)
    } catch {
      setStatus('error')
    }
  }

  return <form className="ps-form" onSubmit={submit} noValidate={false}>
    <h2>Send us a message</h2>
    <div className="ps-fields">
      <div className="ps-field"><label htmlFor="contact-name">Full name *</label><input id="contact-name" required value={values.name} onChange={(e) => change('name', e.target.value)} autoComplete="name" /></div>
      <div className="ps-field"><label htmlFor="contact-email">Work email *</label><input id="contact-email" type="email" required value={values.email} onChange={(e) => change('email', e.target.value)} autoComplete="email" /></div>
      <div className="ps-field"><label htmlFor="contact-company">Company</label><input id="contact-company" value={values.company} onChange={(e) => change('company', e.target.value)} autoComplete="organization" /></div>
      <div className="ps-field"><label htmlFor="contact-inquiry">Inquiry type</label><select id="contact-inquiry" value={values.inquiryType} onChange={(e) => change('inquiryType', e.target.value)} aria-describedby={validation ? 'contact-validation' : undefined}><option value="">Select inquiry type</option>{['Sales & pricing','Technical support','Enterprise solutions','Partnership','General questions'].map(item => <option key={item}>{item}</option>)}</select></div>
      <div className="ps-field ps-field--full"><label htmlFor="contact-subject">Subject *</label><input id="contact-subject" required value={values.subject} onChange={(e) => change('subject', e.target.value)} /></div>
      <div className="ps-field ps-field--full"><label htmlFor="contact-message">Message *</label><textarea id="contact-message" required value={values.message} onChange={(e) => change('message', e.target.value)} placeholder="Tell us about your document processing needs…" /></div>
    </div>
    {validation && <p className="ps-form-status" id="contact-validation" role="alert">{validation}</p>}
    {status === 'success' && <p className="ps-form-status" role="status">Thanks! Your message has been sent.</p>}
    {status === 'error' && <p className="ps-form-status" role="alert">Failed to submit</p>}
    <div className="ps-button-row"><button className="ps-button" type="submit" disabled={status === 'loading'}>{status === 'loading' ? 'Sending…' : 'Send message'}</button></div>
  </form>
}
