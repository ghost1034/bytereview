import type { Metadata } from 'next'
import {
  Instrument_Sans,
  IBM_Plex_Mono,
  Dancing_Script,
  Caveat,
  Great_Vibes,
  Homemade_Apple,
} from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

// Used for the hero eyebrow, metric numerals, and small data labels — a "ledger /
// precision" accent face.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

// Cursive faces for the e-signature "type your signature" adoption flow. The
// slugs must stay in sync with ALLOWED_TYPED_FONTS (backend signing service)
// and the embedded TTFs used at sealing time (backend/assets/fonts).
const dancingScript = Dancing_Script({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-signature',
  display: 'swap',
})

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-signature-caveat',
  display: 'swap',
})

const greatVibes = Great_Vibes({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-signature-great-vibes',
  display: 'swap',
})

const homemadeApple = Homemade_Apple({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-signature-homemade-apple',
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
    <html
      lang="en"
      className={`${instrumentSans.variable} ${ibmPlexMono.variable} ${dancingScript.variable} ${caveat.variable} ${greatVibes.variable} ${homemadeApple.variable}`}
    >
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
