'use client'

import React, { useCallback, useMemo } from 'react'
import NextLink from 'next/link'
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation'

const BASE = '/dashboard/taxatlas'

function internalPath(to: string) {
  if (!to.startsWith('/')) return `${BASE}/${to}`
  return `${BASE}${to === '/' ? '/map' : to}`
}

export function Link({ to, ...props }: Omit<React.ComponentProps<typeof NextLink>, 'href'> & { to: string }) {
  return <NextLink href={internalPath(to)} {...props} />
}

export function NavLink({ to, ...props }: Omit<React.ComponentProps<typeof NextLink>, 'href'> & { to: string }) {
  const pathname = usePathname() ?? ''
  const href = internalPath(to)
  const active = pathname === href || pathname.startsWith(`${href}/`)
  return <NextLink href={href} aria-current={active ? 'page' : undefined} {...props} />
}

export function useNavigate() {
  const router = useRouter()
  return (to: string, options?: { replace?: boolean }) => {
    const href = internalPath(to)
    if (options?.replace) router.replace(href)
    else router.push(href)
  }
}

export function useLocation() {
  const pathname = usePathname() ?? `${BASE}/map`
  const relative = pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/map' : pathname
  const search = typeof window === 'undefined' ? '' : window.location.search
  return { pathname: relative, search }
}

export function useParams(): Record<string, string> {
  const pathname = usePathname() ?? ''
  const match = pathname.match(/\/dashboard\/taxatlas\/jurisdictions\/([^/]+)/)
  return match ? { code: decodeURIComponent(match[1]) } : {}
}

type SearchInput = URLSearchParams | Record<string, string> | ((current: URLSearchParams) => URLSearchParams)

export function useSearchParams(): [URLSearchParams, (next: SearchInput, options?: { replace?: boolean }) => void] {
  const current = useNextSearchParams()
  const pathname = usePathname() ?? `${BASE}/map`
  const router = useRouter()
  const search = current.toString()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const setParams = useCallback(
    (next: SearchInput, options?: { replace?: boolean }) => {
      const resolved = typeof next === 'function'
        ? next(new URLSearchParams(params))
        : next instanceof URLSearchParams
          ? next
          : new URLSearchParams(next)
      const query = resolved.toString()
      const href = `${pathname}${query ? `?${query}` : ''}`
      if (options?.replace) router.replace(href)
      else router.push(href)
    },
    [params, pathname, router],
  )
  return [params, setParams]
}

export function Outlet() {
  return null
}
