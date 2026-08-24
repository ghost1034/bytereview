'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useState } from 'react'

const testimonials = [
  { company: 'A*** Manufacturing', person: 'D*** Wilton, Supply Chain Director', title: 'Handles complex supplier documents', quote: '“We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our procurement system.”' },
  { company: 'S****** Ventures', person: 'J*** Park, Partner', title: 'Essential for due diligence', quote: '“We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it\'s literally done in minutes.”' },
  { company: 'N********** Technologies', person: 'A*** Kumar, CLO', title: 'Accelerates contract processing', quote: '“Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes two minutes.”' },
]

export function Testimonials() {
  const [index, setIndex] = useState(0)
  const item = testimonials[index]
  return (
    <div className="ps-testimonial" aria-live="polite">
      <div><span className="ps-label">{String(index + 1).padStart(2, '0')} / {String(testimonials.length).padStart(2, '0')}</span><h3>{item.title}</h3><blockquote>{item.quote}</blockquote><p><strong>{item.company}</strong><br />{item.person}</p></div>
      <div className="ps-testimonial__controls">
        <button type="button" aria-label="Previous testimonial" onClick={() => setIndex((index - 1 + testimonials.length) % testimonials.length)}><ArrowLeft /></button>
        <button type="button" aria-label="Next testimonial" onClick={() => setIndex((index + 1) % testimonials.length)}><ArrowRight /></button>
      </div>
      <small>Names abbreviated at our clients’ request to protect confidentiality.</small>
    </div>
  )
}
