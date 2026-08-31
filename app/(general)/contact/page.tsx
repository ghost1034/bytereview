import PublicContact from '@/components/public-site/pages/contact'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.contact)

export default function ContactPage() {
  return <PublicContact />
}
