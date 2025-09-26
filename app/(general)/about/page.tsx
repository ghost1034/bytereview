import About from '@/components/pages/about'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.about)

export default function AboutPage() {
  return <About />
}