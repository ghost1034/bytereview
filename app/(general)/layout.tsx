import MainLayout from '@/components/layout/main-layout'

interface MarketingLayoutProps {
  children: React.ReactNode
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return <MainLayout>{children}</MainLayout>
}