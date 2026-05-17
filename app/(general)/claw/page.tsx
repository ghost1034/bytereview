import Claw from '@/components/pages/claw'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.claw)

export default function ClawPage() {
  return <Claw />
}
