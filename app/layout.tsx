import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CPAAutomation - The AI Platform for Accounting, Finance & Legal Professionals',
    template: '%s | CPAAutomation'
  },
  description: 'From document intelligence to AI writing, time tracking, and autonomous agents — one AI platform built by CPAs for accounting, finance, and legal professionals.',
  keywords: [
    'CPA automation',
    'accounting AI platform',
    'AI for accountants',
    'AI for finance',
    'AI for legal',
    'document extraction',
    'AI writing',
    'time tracking',
    'AI agents',
    'legal automation',
    'invoice processing',
    'financial document analysis',
    'accounting automation',
    'professional services automation'
  ],
  authors: [{ name: 'CPAAutomation' }],
  creator: 'CPAAutomation',
  metadataBase: new URL('https://cpaautomation.ai'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cpaautomation.ai',
    siteName: 'CPAAutomation.ai',
    title: 'CPAAutomation - The AI Platform for Accounting, Finance & Legal Professionals',
    description: 'From document intelligence to AI writing, time tracking, and autonomous agents — one AI platform built by CPAs for accounting, finance, and legal professionals.',
    // OG image is generated dynamically via app/opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CPAAutomation - The AI Platform for Accounting, Finance & Legal Professionals',
    description: 'From document intelligence to AI writing, time tracking, and autonomous agents — one AI platform built by CPAs for accounting, finance, and legal professionals.',
    creator: '@cpaautomation',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CPAAutomation.ai',
    alternateName: 'CPAAutomation',
    url: 'https://cpaautomation.ai',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CPAAutomation.ai',
    alternateName: 'CPAAutomation',
    url: 'https://cpaautomation.ai',
    logo: 'https://cpaautomation.ai/logo.png',
  },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}