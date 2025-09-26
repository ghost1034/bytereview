import Contact from '@/components/pages/contact'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.contact)

export default function ContactPage() {
  return <Contact />
}