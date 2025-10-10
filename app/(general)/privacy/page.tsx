import Privacy from '@/components/pages/privacy'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.privacy)

export default function PrivacyPage() {
  return <Privacy />
}