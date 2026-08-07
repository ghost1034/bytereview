import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Prepared by Client',
  description: 'Collect, review, and package client-prepared audit evidence.',
}

export default function PbcLayout({ children }: { children: ReactNode }) {
  return children
}

