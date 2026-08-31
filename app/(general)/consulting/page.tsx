import { PublicConsulting } from '@/components/public-site/pages/marketing-pages'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.consulting)

export default function ConsultingPage() {
  return <PublicConsulting />
}
