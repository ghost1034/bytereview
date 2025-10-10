import CaseStudyLFO from '@/components/pages/case-study-lfo'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.caseStudyLFO)

export default function CaseStudyPage() {
  return <CaseStudyLFO />
}