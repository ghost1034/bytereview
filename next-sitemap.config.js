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
    '/subscribe*'
  ],
  additionalPaths: async (config) => [
    await config.transform(config, '/'),
    await config.transform(config, '/about'),
    await config.transform(config, '/pricing'),
    await config.transform(config, '/features'),
    await config.transform(config, '/demo'),
    await config.transform(config, '/contact'),
    await config.transform(config, '/privacy'),
    await config.transform(config, '/terms'),
    await config.transform(config, '/case-study/LFO'),
    await config.transform(config, '/documentation'),
  ],
  transform: async (config, path) => {
    // Custom priority and changefreq for different pages
    const customConfig = {
      '/': { priority: 1.0, changefreq: 'daily' },
      '/pricing': { priority: 0.9, changefreq: 'weekly' },
      '/features': { priority: 0.9, changefreq: 'weekly' },
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
        disallow: ['/dashboard', '/admin', '/api', '/integrations', '/subscribe'],
      },
    ],
  },
}