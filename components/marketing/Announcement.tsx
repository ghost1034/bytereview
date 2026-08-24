'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

const key = 'cpaa-consulting-announcement-dismissed'

export function Announcement() {
  const [visible, setVisible] = useState(false)
  useEffect(() => setVisible(sessionStorage.getItem(key) !== 'true'), [])
  if (!visible) return null

  return (
    <aside className="ps-announcement" aria-label="Forward-Deployed Consulting announcement">
      <div className="ps-container">
        <strong>Need a custom AI build, not just a platform?</strong>
        <span>Forward-Deployed Consulting — senior engineers and operators who embed with your team.</span>
        <Link href="/consulting">Learn more</Link>
        <button type="button" aria-label="Dismiss consulting announcement" onClick={() => { sessionStorage.setItem(key, 'true'); setVisible(false) }}><X size={16} /></button>
      </div>
    </aside>
  )
}
