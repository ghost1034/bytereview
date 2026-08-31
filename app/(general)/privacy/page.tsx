import { PublicPrivacy } from '@/components/public-site/pages/legal'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.privacy)

export default function PrivacyPage() {
  return <PublicPrivacy />
}
