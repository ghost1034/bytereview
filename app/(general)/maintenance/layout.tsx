export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  // Minimal layout to avoid loading marketing/global heavy components during maintenance gate
  return <>{children}</>
}
