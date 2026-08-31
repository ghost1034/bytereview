import { PublicCaseStudy } from '@/components/public-site/pages/marketing-pages'
import { generateMetadata } from '@/lib/metadata'
import { pageMetadata } from '@/lib/metadata'

export const metadata = generateMetadata(pageMetadata.caseStudyLFO)

export default function CaseStudyPage() {
  return <PublicCaseStudy />
}
