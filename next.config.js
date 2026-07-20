/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Server-side rollout flag exposed to the compiled client composer.
    NEXT_PUBLIC_ESIGN_ADVANCED_RECIPIENTS_ENABLED:
      process.env.ESIGN_ADVANCED_RECIPIENTS_ENABLED ??
      process.env.NEXT_PUBLIC_ESIGN_ADVANCED_RECIPIENTS_ENABLED ??
      'false',
  },
  // Remove experimental.appDir as it's now stable in Next.js 14
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/api/:path*',
          destination: 'https://api.cpaautomation.ai/api/:path*',
        },
      ]
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ]
  },
  // Frame protection for the app pages (served from Cloud Run). This is intentionally
  // set here rather than on the Firebase Hosting site, because that site serves the
  // Firebase auth handler/iframe (/__/auth/**), which must remain frameable for
  // signInWithPopup to relay credentials back to the app.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // The LLM governance deck is embedded in a same-origin iframe on
      // /consulting/llm-governance, so it must remain frameable by the app.
      // Later rules override earlier ones for the same header key.
      {
        source: '/llm-governance.html',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
  output: 'standalone',
  // Disable type checking during build for now
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable ESLint during build for now
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
