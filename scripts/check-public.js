const fs = require('node:fs');
const path = require('node:path');

// Scan generated HTML, JS, Markdown and assets; never print matched secrets.
const roots = process.argv.slice(2);
if (!roots.length) roots.push('docs', 'versioned_docs', 'static', 'build');
const rules = [
  ['internal address', /(?:\b[\w.-]+\.byted\.org\b|[\w.-]*bytedance\.(?:larkoffice|feishu)\.com|\bagentkit[-_](?:stg|ppe)\b)/i],
  ['local user path', /\/(?:data\d+\/home|Users)\/[^/\s"']+|\/home\/(?!gem(?:\/|\b))[^/\s"']+/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential', /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/],
];
let files = 0;
let failures = 0;
function scan(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${file}`);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(file)) scan(path.join(file, child));
    return;
  }
  files++;
  const content = fs.readFileSync(file).toString('utf8');
  for (const [name, pattern] of rules) {
    const match = pattern.exec(content);
    if (!match) continue;
    const line = content.slice(0, match.index).split('\n').length;
    console.error(`${file}:${line}: ${name}`);
    failures++;
  }
}
for (const root of roots) scan(root);
if (failures) {
  console.error(`Public content check failed: ${failures} findings.`);
  process.exitCode = 1;
} else {
  console.log(`Public content check passed (${files} files).`);
}
