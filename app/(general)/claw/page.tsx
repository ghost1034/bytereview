import PublicClaw from '@/components/public-site/pages/claw'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.claw)

export default function ClawPage() {
  return <PublicClaw />
}
