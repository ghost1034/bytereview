import { NextRequest, NextResponse } from 'next/server';

// Name of the cookie that allows access past maintenance gate
const COOKIE_NAME = 'cpaa_maint_ok';

// Paths that should be accessible without the cookie
const PUBLIC_PATHS = [
  '/maintenance',
  '/api/maintenance-unlock',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/sitemap-0.xml',
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Always allow next internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  // Allow explicitly public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const hasCookie = req.cookies.get(COOKIE_NAME)?.value === 'true';

  if (hasCookie) {
    return NextResponse.next();
  }

  // Internally rewrite to maintenance page with redirect back to the original url
  const url = req.nextUrl.clone();
  url.pathname = '/maintenance';
  const redirectTarget = pathname + (search || '');
  url.search = redirectTarget ? `?redirect=${encodeURIComponent(redirectTarget)}` : '';
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
