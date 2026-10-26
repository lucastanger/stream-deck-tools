import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { ACTION, CAMERA_ACTION, REACTION_ACTION, ACTION_CONTROLS } from '../src/model.mjs';

test('manifest preserves microphone/camera identities and declares all independent actions and assets', async () => {
  const manifest = JSON.parse(await readFile('com.local.teamsmic.sdPlugin/manifest.json', 'utf8'));
  assert.equal(manifest.UUID, 'com.local.teamsmic');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(manifest.Version, `${pkg.version}.0`);
  const helperInfo = await readFile('com.local.teamsmic.sdPlugin/bin/Teams Mic Helper.app/Contents/Info.plist', 'utf8');
  assert.ok(helperInfo.includes(`<key>CFBundleShortVersionString</key><string>${pkg.version}</string>`));
  assert.ok(helperInfo.includes(`<key>CFBundleVersion</key><string>${pkg.version}</string>`));
  for (const notice of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'WS-LICENSE.txt']) {
    await access('com.local.teamsmic.sdPlugin/' + notice);
  }
  assert.deepEqual(manifest.Actions.map(action => action.UUID), [ACTION, CAMERA_ACTION, REACTION_ACTION]);
  for (const action of manifest.Actions) {
    assert.ok(ACTION_CONTROLS[action.UUID]);
    assert.equal(action.DisableAutomaticStates, true);
    assert.equal(action.States.length, 4);
    await access('com.local.teamsmic.sdPlugin/' + action.PropertyInspectorPath);
    for (const image of [action.Icon, ...action.States.map(state => state.Image)]) {
      await access('com.local.teamsmic.sdPlugin/' + image + '.png');
      await access('com.local.teamsmic.sdPlugin/' + image + '@2x.png');
    }
  }
});
