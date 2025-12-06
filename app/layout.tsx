import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const ibmPlexSans = IBM_Plex_Sans({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'CPAAutomation - AI Document Extraction for Accounting Professionals',
    template: '%s | CPAAutomation'
  },
  description: 'Professional-grade AI extraction built with deep accounting and legal expertise. Extract data from invoices, financial statements, and documents with 99%+ accuracy. Built by CPAs for CPAs.',
  keywords: [
    'CPA automation',
    'document extraction',
    'AI accounting',
    'invoice processing',
    'financial document analysis',
    'accounting automation',
    'data extraction',
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
    siteName: 'CPAAutomation',
    title: 'CPAAutomation - AI Document Extraction for Accounting Professionals',
    description: 'Professional-grade AI extraction built with deep accounting and legal expertise. Extract data from invoices, financial statements, and documents with 99%+ accuracy. Built by CPAs for CPAs.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CPAAutomation - AI Document Extraction Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CPAAutomation - AI Document Extraction for Accounting Professionals',
    description: 'Professional-grade AI extraction built with deep accounting and legal expertise. Extract data from invoices, financial statements, and documents with 99%+ accuracy. Built by CPAs for CPAs.',
    images: ['/og-image.png'],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={ibmPlexSans.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}