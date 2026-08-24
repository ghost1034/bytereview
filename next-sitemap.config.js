const fs = require('fs')
const path = require('path')

/**
 * Enumerate documentation routes from the filesystem — the same source of truth
 * the /docs route uses (`content/docs/<section>/<page>.md`, slug = file name).
 * next-sitemap doesn't reliably expand the `[[...slug]]` catch-all, so docs URLs
 * are listed explicitly here. Returns ['/docs', '/docs/<section>/<page>', ...].
 */
function getDocsPaths() {
  const docsRoot = path.join(__dirname, 'content', 'docs')
  const paths = ['/docs']
  let sections
  try {
    sections = fs.readdirSync(docsRoot, { withFileTypes: true })
  } catch {
    return paths
  }
  for (const section of sections) {
    if (!section.isDirectory()) continue
    let files
    try {
      files = fs.readdirSync(path.join(docsRoot, section.name))
    } catch {
      continue
    }
    for (const file of files) {
      if (file.startsWith('.') || !/\.md$/i.test(file)) continue
      paths.push(`/docs/${section.name}/${file.replace(/\.md$/i, '')}`)
    }
  }
  return paths
}

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.SITE_URL || 'https://cpaautomation.ai',
  generateRobotsTxt: true,
  sitemapSize: 7000,
  changefreq: 'weekly',
  priority: 0.7,
  exclude: [
    '/dashboard*',
    '/admin*',
    '/api*',
    '/404',
    '/500',
    '/integrations*',
    '/subscribe*',
    '/pbc/access'
  ],
  additionalPaths: async (config) => {
    const staticPaths = [
      '/',
      '/about',
      '/pricing',
      '/features',
      '/claw',
      '/consulting',
      '/demo',
      '/contact',
      '/privacy',
      '/terms',
      '/case-study/LFO',
    ]
    const allPaths = [...staticPaths, ...getDocsPaths()]
    return Promise.all(allPaths.map((p) => config.transform(config, p)))
  },
  transform: async (config, path) => {
    // Custom priority and changefreq for different pages
    const customConfig = {
      '/': { priority: 1.0, changefreq: 'daily' },
      '/pricing': { priority: 0.9, changefreq: 'weekly' },
      '/features': { priority: 0.9, changefreq: 'weekly' },
      '/claw': { priority: 0.9, changefreq: 'weekly' },
      '/consulting': { priority: 0.8, changefreq: 'monthly' },
      '/about': { priority: 0.8, changefreq: 'monthly' },
      '/demo': { priority: 0.8, changefreq: 'weekly' },
      '/contact': { priority: 0.7, changefreq: 'monthly' },
      '/case-study/LFO': { priority: 0.6, changefreq: 'monthly' },
    };

    const pageConfig = customConfig[path] || {};

    return {
      loc: path,
      changefreq: pageConfig.changefreq || config.changefreq,
      priority: pageConfig.priority || config.priority,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
    };
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/api', '/integrations', '/subscribe', '/pbc/access'],
      },
    ],
  },
}
