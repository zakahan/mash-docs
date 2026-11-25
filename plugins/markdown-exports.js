const fs = require('node:fs/promises');
const path = require('node:path');
const markdownPath = require('./markdown-path');
const cheerio = require('cheerio');

// The SSE schema is authored as an HTML tree. Export the complete paths,
// including array element fields, independently of the browser's open state.
function exportTree(html) {
  const $ = cheerio.load(html, null, false);
  const lines = [];
  function visit(el, prefix = '') {
    const node = $(el);
    if (node.is('details')) {
      const summary = node.children('summary');
      const name = summary.children('code').first().text();
      if (!name) {
        lines.push('\n' + summary.text() + '\n');
        node.children().not('summary').each((_, child) => visit(child, prefix));
        return;
      }
      const variant = ['openviking_context', 'external_skill_package'].includes(name);
      const field = variant ? prefix : [prefix, name].filter(Boolean).join('.');
      lines.push('- `' + (variant ? name : field) + '` · ' + summary.children('small').text() + ' ' + summary.children('span').text());
      const childPath = ['mcp_servers', 'resources'].includes(name) ? field + '[]' : field;
      node.children().not('summary').each((_, child) => visit(child, childPath));
    } else if (node.is('.api-property')) {
      const dt = node.children('dt');
      const name = dt.children('code').first().text();
      lines.push('- `' + [prefix, name].filter(Boolean).join('.') + '` · ' + dt.children('small').text() + ' — ' + node.children('dd').text());
    } else if (node.is('pre')) {
      lines.push('\n```json\n' + node.text() + '\n```\n');
    } else if (node.is('p,h4')) {
      lines.push('\n' + node.text() + '\n');
    } else {
      node.children().each((_, child) => visit(child, prefix));
    }
  }
  $.root().children().each((_, child) => visit(child));
  return lines.join('\n');
}

module.exports = function markdownExports(context) {
  return {
    name: 'markdown-exports',
    async postBuild({outDir, plugins}) {
      const docs = plugins.find(plugin => plugin.name === 'docusaurus-plugin-content-docs');
      for (const version of docs.content.loadedVersions) {
        const index = ['# VeADK Agent Loop · ' + version.label, '', '> AgentKit Runtime 使用指南与 API 参考。'];
        const groups = new Map();
        const directory = path.join(outDir, markdownPath(version.docs[0]).slice(context.siteConfig.baseUrl.length).slice(0, -(version.docs[0].id.length + 3)));
        for (const doc of version.docs) {
          if (doc.draft || doc.unlisted) continue;
          const filename = doc.id + '.md';
          const source = await fs.readFile(path.join(context.siteDir, doc.source.replace(/^@site\//, '')), 'utf8');
          const markdown = source.replace(/^---\n[\s\S]*?\n---\n/, '')
            .replace(/<div class="api-contract"><section>[\s\S]*?<\/aside><\/div>|<div class="api-contract-meta">[^\n]+/g, exportTree);
          const target = path.join(directory, filename);
          await fs.mkdir(path.dirname(target), {recursive: true});
          await fs.writeFile(target, markdown);
          const group = {api: 'API 参考', app: 'Harness App', managed: 'Managed Agents Worker'}[doc.id.split('/')[0]] || '概览与版本';
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push('- [' + doc.title + '](' + filename + ')');
        }
        for (const [heading, links] of groups) index.push('', '## ' + heading, '', ...links);
        await fs.writeFile(path.join(directory, 'llms.txt'), index.join('\n') + '\n');
      }
    },
  };
};
