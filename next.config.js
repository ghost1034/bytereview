/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove experimental.appDir as it's now stable in Next.js 14
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [
        // Keep the maintenance unlock route handled by Next.js itself (do not proxy to external API)
        {
          source: '/api/maintenance-unlock',
          destination: '/api/maintenance-unlock',
        },
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