import { PublicDemo } from '@/components/public-site/pages/marketing-pages'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.demo)

export default function DemoPage() {
  return <PublicDemo />
}
