const groups = [
  ['概览', 'intro'],
  ['Harness App', 'app/guide'],
  ['Managed Agents Worker', 'managed/guide'],
  ['API 参考', 'api/index'],
];
module.exports = {
  title: 'VeADK Agent Loop',
  plugins: ['./plugins/markdown-exports'],
  url: process.env.DOCS_URL || 'http://localhost:3000',
  baseUrl: process.env.DOCS_BASE_URL || '/',
  onBrokenLinks: 'throw',
  i18n: {defaultLocale: 'zh-Hans', locales: ['zh-Hans']},
  markdown: {format: 'detect', hooks: {onBrokenMarkdownLinks: 'throw'}},
  presets: [['classic', {blog: false, sitemap: false, theme: {customCss: ['./src/css/tables.css', './src/css/docs.css']}, docs: {
    remarkPlugins: [require('./env-tables')],
    rehypePlugins: [require('./plugins/api-fields')],
    sidebarPath: './sidebars.js',
    routeBasePath: '/',
    lastVersion: 'current',
    versions: {current: {label: 'latest（0.3.1）', path: '/', banner: 'none'}, '0.3.1': {label: '0.3.1', path: '0.3.1', banner: 'none'}, '0.2.0': {label: '0.2.0', path: '0.2.0', banner: 'none'}},
  }}]],
  themeConfig: {navbar: {title: 'VeADK Agent Loop', items: [
    ...groups.map(([label, docId]) => ({type: 'doc', label, docId, position: 'left'})),
    {type: 'docsVersionDropdown', position: 'right', dropdownActiveClassDisabled: true}
  ]}},
};
