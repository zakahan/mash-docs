module.exports = function markdownPath(doc) {
  const slug = doc.slug.replace(/\/$/, '');
  const permalink = doc.permalink.replace(/\/$/, '');
  const prefix = permalink.slice(0, permalink.length - slug.length);
  return prefix + '/' + doc.id + '.md';
};
