'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

import { SPEECH2WRITE_FILES } from '@/lib/speech2write'

export default function Speech2WriteDownloadButton({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <button type="button" className={`ps-button ps-button--download ps-button--${variant}`} onClick={() => setAttempt((value) => value + 1)}>
        <span>Download</span>
        <span className="ps-button__icon" aria-hidden><Download /></span>
      </button>
      {/* Separate browsing contexts keep GitHub's attachment redirects from cancelling one another. */}
      {attempt > 0 && SPEECH2WRITE_FILES.map((file) => (
        <iframe key={`${attempt}-${file.name}`} src={file.url} title={`Download ${file.name}`} hidden />
      ))}
    </>
  )
}
