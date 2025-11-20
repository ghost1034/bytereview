import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'cpaa_maint_ok'
const PASSWORD = process.env.MAINTENANCE_PASSWORD || 'Drakobaby#1!'

export async function POST(req: NextRequest) {
  try {
    const { password, redirect } = await req.json()

    if (typeof password !== 'string' || password !== PASSWORD) {
      return new NextResponse('Invalid password', { status: 401 })
    }

    const resBody = { ok: true as const, redirect: typeof redirect === 'string' ? redirect : '/' }

    const res = NextResponse.json(resBody, { status: 200 })
    // Set httpOnly cookie so it cannot be modified via client-side JS
    res.cookies.set({
      name: COOKIE_NAME,
      value: 'true',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours
    })

    // Always return JSON and let the client perform navigation to avoid absolute-URL redirects using container hostname
    return res
  } catch (e) {
    return new NextResponse('Bad request', { status: 400 })
  }
}
