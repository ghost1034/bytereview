import { PublicAbout } from '@/components/public-site/pages/marketing-pages'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.about)

export default function AboutPage() {
  return <PublicAbout />
}
