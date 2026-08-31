import PublicHome from '@/components/public-site/pages/home'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.home)

export default function HomePage() {
  return <PublicHome />
}
