import Features from '@/components/pages/features'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.features)

export default function FeaturesPage() {
  return <Features />
}