import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Packaging requires a validated macOS build.');
const output = resolve('com.local.teamsmic.sdPlugin');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
if (manifest.Version !== `${version}.0`) throw new Error('Build is stale. Run npm run package.');

// Finder can recreate metadata after the initial copy. Strip it just before pack.
async function removeMetadata(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name === '.DS_Store' || entry.name.startsWith('._')) await rm(path, { force: true, recursive: true });
    else if (entry.isDirectory()) await removeMetadata(path);
  }
}
await removeMetadata(output);
execFileSync('codesign', ['--verify', '--deep', '--strict', join(output, 'bin/Teams Mic Helper.app')], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
execFileSync(resolve('node_modules/.bin/streamdeck'), [
  'pack', output, '--output', 'dist', '--force', '--no-update-check', '--no-file-list',
], { stdio: 'inherit' });
const file = resolve('dist/com.local.teamsmic.streamDeckPlugin');
const hash = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(file + '.sha256', `${hash}  ${basename(file)}\n`);
console.log('Package SHA-256:', hash);
