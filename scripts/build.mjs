import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('Build requires macOS and Xcode Command Line Tools.');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('The native/package build currently supports stable major.minor.patch versions only.');
}
const output = resolve('com.local.teamsmic.sdPlugin');
const temporary = resolve('.build');
await rm(output, { recursive: true, force: true });
await mkdir(temporary, { recursive: true });
await mkdir('dist', { recursive: true });
await cp('plugin', output, { recursive: true, filter: path => !path.endsWith('.DS_Store') });
await cp('node_modules/ws/LICENSE', resolve(output, 'WS-LICENSE.txt'));
await cp('LICENSE', resolve(output, 'LICENSE'));
await cp('THIRD_PARTY_NOTICES.md', resolve(output, 'THIRD_PARTY_NOTICES.md'));
// package.json is the source of truth; override the template's display version.
const manifestPath = resolve(output, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.Version = `${version}.0`;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const app = resolve(output, 'bin/Teams Mic Helper.app');
const contents = resolve(app, 'Contents');
const macOS = resolve(contents, 'MacOS');
await mkdir(macOS, { recursive: true });
await writeFile(resolve(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.local.teamsmic.helper</string>
<key>CFBundleName</key><string>Teams Mic Helper</string>
<key>CFBundleDisplayName</key><string>Teams Mic Helper</string>
<key>CFBundleExecutable</key><string>TeamsMicHelper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>LSUIElement</key><true/>
<key>NSAccessibilityUsageDescription</key><string>Control Teams microphone, camera, and meeting reactions from your Stream Deck.</string>
</dict></plist>\n`);
for (const arch of ['arm64', 'x86_64']) {
  console.log('Compiling helper:', arch);
  execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macosx12.0`, 'native/TeamsMicHelper.swift', '-o', resolve(temporary, `helper-${arch}`)], { stdio: 'inherit' });
}
const binary = resolve(macOS, 'TeamsMicHelper');
execFileSync('lipo', ['-create', resolve(temporary, 'helper-arm64'), resolve(temporary, 'helper-x86_64'), '-output', binary], { stdio: 'inherit' });
// Ad-hoc signing is for local installation, not notarised distribution.
execFileSync('codesign', ['--force', '--sign', '-', '--identifier', 'com.local.teamsmic.helper', app], { stdio: 'inherit' });
execFileSync(binary, ['--self-test'], { stdio: 'inherit' });
execFileSync('swift', ['scripts/icons.swift', resolve(output, 'images')], { stdio: 'inherit' });
await build({ entryPoints: ['src/plugin.mjs'], outfile: resolve(output, 'bin/plugin.cjs'), bundle: true, platform: 'node', target: 'node20', format: 'cjs', logLevel: 'info' });
console.log('Built', output);
