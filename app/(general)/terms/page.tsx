import Terms from '@/components/pages/terms'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.terms)

export default function TermsPage() {
  return <Terms />
}