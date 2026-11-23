const text = value => ({type: 'text', value});
const element = (tagName, children, properties = {}) => ({type: 'element', tagName, properties, children});
const label = node => node.value ?? (node.children || []).map(label).join('');
const elements = node => node.children.filter(child => child.type === 'element');

function fieldList(table) {
  const [head, body] = elements(table);
  if (head?.tagName !== 'thead' || body?.tagName !== 'tbody') return table;
  const columns = elements(elements(head)[0]).map(label);
  if (!['字段', '参数'].includes(columns[0]) || columns[1] !== '类型' || columns.at(-1) !== '说明') return table;
  const roots = [];
  const byPath = new Map();
  for (const row of elements(body)) {
    const cells = elements(row);
    const name = label(cells[0]);
    const field = {name, cells, children: []};
    let path = name;
    while (path.includes('.')) {
      path = path.slice(0, path.lastIndexOf('.'));
      const parent = byPath.get(path) || byPath.get(path.replace(/\[\]$/, ''));
      if (parent) {
        parent.children.push(field);
        field.name = name.slice(path.length + 1);
        break;
      }
    }
    if (field.name === name) roots.push(field);
    byPath.set(name, field);
  }
  function render({name, cells, children}) {
    const metadata = [label(cells[1])];
    for (let i = 2; i < columns.length - 1; i++) {
      const value = label(cells[i]);
      if (columns[i] === '默认值') {
        if (value && value !== '—') metadata.push('默认值 ' + value);
      } else if (value === '是') metadata.push(columns[i].includes('返') ? '必返' : '必填');
      else if (value === '否') metadata.push(columns[i].includes('返') ? '可能省略' : '可选');
      else metadata.push(value);
    }
    const heading = [element('code', [text(name)]), text(' '), element('small', [text(metadata.join(' · '))])];
    const description = cells.at(-1).children;
    if (children.length) return element('details', [
      element('summary', [...heading, element('span', description, {className: ['api-field-description']})]),
      ...children.map(render),
    ]);
    return element('dl', [element('dt', heading), element('dd', description)], {className: ['api-property']});
  }
  return element('div', roots.map(render), {className: ['api-fields']});
}

function presentTable(table) {
  const fields = fieldList(table);
  if (fields !== table) return fields;
  const head = elements(table)[0];
  const count = head ? elements(elements(head)[0] || {children: []}).length : 0;
  table.properties.className = [...(table.properties.className || []), 'api-summary-table'];
  return element('div', [table], {className: ['api-table-scroll', count >= 4 ? 'api-table-wide' : 'api-table-compact']});
}

// Keep the response fields in reading order while placing the request example
// alongside its fields. Bound every lookup to the current operation.
function placeExamples(nodes) {
  // Grouped contracts (headers, path/query parameters and body) share one
  // example. Keep their labels and response explanations together.
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].tagName !== 'h3') continue;
    const title = label(nodes[i]);
    if (!['请求参数', '响应参数', '响应字段'].includes(title)) continue;
    const examples = title === '请求参数' ? ['调用示例', '请求示例'] : ['响应示例'];
    for (let j = i + 1; j < nodes.length; j++) {
      if (['h1', 'h2'].includes(nodes[j].tagName)) break;
      if (nodes[j].tagName !== 'h3') continue;
      if (!examples.includes(label(nodes[j]))) break;
      const k = nodes.findIndex((n, index) => index > j && n.type !== 'text');
      if (nodes[k]?.tagName !== 'pre') break;
      const fields = nodes.slice(i + 1, j);
      const sample = nodes.slice(j, k + 1);
      nodes.splice(i + 1, k - i, element('div', [
        element('section', fields), element('aside', sample),
      ], {className: ['api-contract']}));
      break;
    }
  }
  const isFieldList = node => node?.properties?.className?.includes('api-fields');
  for (let i = 0; i < nodes.length; i++) {
    if (!isFieldList(nodes[i])) continue;
    const heading = nodes.slice(0, i).findLast(n => n.type === 'element');
    if (!heading || !['请求参数', '响应参数', '响应字段'].includes(label(heading))) continue;
    const request = label(heading) === '请求参数';
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[j].tagName === 'h2') break;
      const title = label(nodes[j]).replace(/：$/, '');
      if (!(request ? ['调用示例','请求示例'] : ['响应示例']).includes(title)) continue;
      const k = nodes.findIndex((n, index) => index > j && n.type !== 'text');
      if (nodes[k]?.tagName !== 'pre') break;
      const sample = nodes.splice(j, k - j + 1);
      nodes[i] = element('div', [element('section', [nodes[i]]), element('aside', sample)], {className: ['api-contract']});
      break;
    }
  }
  return nodes;
}

module.exports = function apiFields() {
  return (tree, file) => {
    if (!/\/api\/(app|chat|files|session|harness|environment|conventions)\.md$/.test(file.path)) return;
    tree.children = placeExamples(tree.children.map(node => node.tagName === 'table' ? presentTable(node) : node));
  };
};
