import Consulting from '@/components/pages/consulting'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.consulting)

export default function ConsultingPage() {
  return <Consulting />
}
