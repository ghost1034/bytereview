import PublicSpeech2Write from '@/components/public-site/pages/speech2write'
import { generateMetadata, pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.speech2write)

export default function Speech2WritePage() {
  return <PublicSpeech2Write />
}
