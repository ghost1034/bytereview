import { PublicTerms } from '@/components/public-site/pages/legal'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.terms)

export default function TermsPage() {
  return <PublicTerms />
}
