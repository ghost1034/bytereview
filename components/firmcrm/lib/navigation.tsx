'use client'

import NextLink from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

export { useParams }
export const crmHref = (path: string) => path.startsWith('/dashboard/') || !path.startsWith('/') ? path : `/dashboard/firmcrm${path === '/' ? '' : path}`
export function Link({ to, ...props }: Omit<ComponentProps<typeof NextLink>, 'href'> & { to: string }) {
  return <NextLink href={crmHref(to)} {...props} />
}
export function useNavigate() {
  const router = useRouter()
  return (path: string, options?: { replace?: boolean }) => options?.replace ? router.replace(crmHref(path)) : router.push(crmHref(path))
}
export function useLocation() {
  const pathname = usePathname()
  return { pathname: pathname.replace(/^\/dashboard\/firmcrm/, '') || '/' }
}
