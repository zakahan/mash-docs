const {spawnSync} = require('node:child_process');

function git(args, capture = false) {
  const result = spawnSync('git', args, {encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return capture ? result.stdout.trim() : '';
}

try {
  if (git(['branch', '--show-current'], true) !== 'main') {
    throw new Error('Switch to main before syncing.');
  }
  if (git(['status', '--porcelain'], true)) {
    throw new Error('Commit or stash local changes before syncing.');
  }
  for (const remote of ['origin', 'github']) {
    git(['fetch', remote, 'main']);
    git(['merge-base', '--is-ancestor', `${remote}/main`, 'HEAD']);
  }
  for (const remote of ['origin', 'github']) {
    git(['push', remote, 'main']);
  }
  console.log('Both remotes are synced. GitHub Pages will deploy automatically.');
} catch (error) {
  console.error(error.message);
  console.error('Sync stopped. Check the remote history before retrying; no force push is used.');
  process.exitCode = 1;
}
