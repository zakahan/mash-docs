// Mark environment reference tables by their column headings in both versions.
module.exports = function environmentTables() {
  function visit(node) {
    if (node.type === 'table') {
      const headings = node.children[0].children.map(cell => cell.children[0]?.value);
      if (headings.join('|') === '环境变量|默认值|说明') {
        node.data ??= {};
        node.data.hProperties = {...node.data.hProperties, className: 'env-reference'};
      }
    }
    node.children?.forEach(visit);
  }
  return visit;
};
