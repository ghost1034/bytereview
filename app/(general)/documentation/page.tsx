import Documentation from '@/components/pages/documentation'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.documentation)

export default function DocumentationPage() {
  return <Documentation />
}