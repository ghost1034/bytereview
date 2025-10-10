import type { Metadata } from 'next'

interface PageMetadata {
  title: string
  description: string
  canonical?: string
  keywords?: string[]
  openGraph?: {
    title?: string
    description?: string
    images?: Array<{
      url: string
      width: number
      height: number
      alt: string
    }>
  }
}

export function generateMetadata(page: PageMetadata): Metadata {
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical: page.canonical,
    },
    openGraph: {
      title: page.openGraph?.title || page.title,
      description: page.openGraph?.description || page.description,
      url: page.canonical,
      images: page.openGraph?.images || [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: page.title,
        },
      ],
    },
    twitter: {
      title: page.openGraph?.title || page.title,
      description: page.openGraph?.description || page.description,
      images: page.openGraph?.images?.map(img => img.url) || ['/og-image.png'],
    },
  }
}

// Page-specific metadata configurations
export const pageMetadata = {
  home: {
    title: 'CPAAutomation - AI Document Extraction for Accounting Professionals',
    description: 'Professional-grade AI extraction built with deep accounting and legal expertise. Extract data from invoices, financial statements, and documents with 99%+ accuracy. Built by CPAs for CPAs.',
    canonical: 'https://cpaautomation.ai',
    keywords: [
      'CPA automation',
      'document extraction',
      'AI accounting',
      'invoice processing',
      'financial document analysis',
      'automated data entry',
      'professional document processing'
    ],
  },
  about: {
    title: 'About Us - Founded by CPAs for Professional Use',
    description: 'Learn about CPAAutomation\'s mission to empower accounting professionals with AI-powered document extraction. Founded by Ian Stewart and validated by industry experts.',
    canonical: 'https://cpaautomation.ai/about',
    keywords: [
      'CPA founders',
      'accounting automation history',
      'Ian Stewart',
      'professional validation',
      'CPA expertise'
    ],
  },
  pricing: {
    title: 'Pricing Plans - Professional AI Document Extraction',
    description: 'Choose the perfect plan for your accounting practice. Starting with 100 free pages per month. Professional-grade AI extraction with transparent pricing.',
    canonical: 'https://cpaautomation.ai/pricing',
    keywords: [
      'CPA automation pricing',
      'document extraction cost',
      'accounting software pricing',
      'professional plans',
      'free trial'
    ],
  },
  features: {
    title: 'Features - Advanced AI Document Processing Capabilities',
    description: 'Discover CPAAutomation\'s powerful features: custom field extraction, table recognition, automated workflows, and seamless integrations. Built for professional use.',
    canonical: 'https://cpaautomation.ai/features',
    keywords: [
      'AI document features',
      'custom field extraction',
      'table recognition',
      'automated workflows',
      'professional integrations'
    ],
  },
  demo: {
    title: 'Try Demo - Test AI Document Extraction',
    description: 'Experience CPAAutomation\'s AI-powered document extraction in action. Upload your documents and see how our platform extracts data with professional accuracy.',
    canonical: 'https://cpaautomation.ai/demo',
    keywords: [
      'document extraction demo',
      'AI demo',
      'try CPA automation',
      'test document processing',
      'free trial'
    ],
  },
  contact: {
    title: 'Contact Us - Get in Touch with Our Team',
    description: 'Contact CPAAutomation for enterprise solutions, custom integrations, or technical support. We\'re here to help optimize your document processing workflows.',
    canonical: 'https://cpaautomation.ai/contact',
    keywords: [
      'contact CPA automation',
      'enterprise support',
      'custom integrations',
      'technical support',
      'professional services'
    ],
  },
  caseStudyLFO: {
    title: 'Case Study: Family Office Success',
    description: 'See how a leading family office saves hundreds of hours annually processing investment statements with CPAAutomation\'s AI extraction platform.',
    canonical: 'https://cpaautomation.ai/case-study/LFO',
    keywords: [
      'family office automation',
      'investment statement processing',
      'CPA case study',
      'document automation success',
      'financial processing'
    ],
  },
  documentation: {
    title: 'Documentation - API & Integration Guides',
    description: 'Complete documentation for CPAAutomation\'s API, integrations, and platform features. Get started with our comprehensive guides and tutorials.',
    canonical: 'https://cpaautomation.ai/documentation',
    keywords: [
      'CPA automation API',
      'integration documentation',
      'developer guides',
      'technical documentation',
      'platform tutorials'
    ],
  },
  privacy: {
    title: 'Privacy Policy - Data Protection & Security',
    description: 'Learn about CPAAutomation\'s commitment to data privacy and security. Our privacy policy outlines how we protect your sensitive financial documents.',
    canonical: 'https://cpaautomation.ai/privacy',
    keywords: [
      'data privacy',
      'document security',
      'CPA data protection',
      'privacy policy',
      'secure processing'
    ],
  },
  terms: {
    title: 'Terms of Service - Platform Usage Agreement',
    description: 'Review CPAAutomation\'s terms of service and usage agreement. Understand your rights and responsibilities when using our AI extraction platform.',
    canonical: 'https://cpaautomation.ai/terms',
    keywords: [
      'terms of service',
      'usage agreement',
      'platform terms',
      'service agreement',
      'legal terms'
    ],
  },
}