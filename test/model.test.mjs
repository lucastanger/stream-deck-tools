import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, presentation, canToggle, configuredReaction, REACTIONS } from '../src/model.mjs';

test('unknown is never displayed as muted or permitted to toggle', () => {
  const value = normalizeState({ state: 'anything', enabled: true }, 100);
  assert.equal(value.state, 'unknown');
  assert.equal(value.enabled, false);
  assert.deepEqual(presentation(value, 100), { state: 0, title: 'Unknown' });
  assert.equal(canToggle(value, 100), false);
});
test('muted and live states reflect native observations', () => {
  const muted = normalizeState({ state: 'muted', enabled: true }, 100);
  const live = normalizeState({ state: 'unmuted', enabled: true }, 100);
  assert.deepEqual(presentation(muted, 100), { state: 1, title: 'Muted' });
  assert.deepEqual(presentation(live, 100), { state: 2, title: 'LIVE' });
  assert.equal(canToggle(muted, 100), true);
});
test('stale native state fails closed', () => {
  const value = normalizeState({ state: 'muted', enabled: true }, 100);
  assert.equal(presentation(value, 6101).state, 0);
  assert.equal(canToggle(value, 6101), false);
});
test('disabled microphone is blocked even when mute state is known', () => {
  const value = normalizeState({ state: 'unmuted', enabled: false }, 100);
  assert.deepEqual(presentation(value, 100), { state: 3, title: 'Blocked' });
  assert.equal(canToggle(value, 100), false);
});
test('pending press never optimistically displays the target state', () => {
  const value = normalizeState({ state: 'muted', enabled: true }, 100);
  assert.deepEqual(presentation(value, 100, true), { state: 0, title: 'Updating…' });
});
test('missing messages remain unknown', () => {
  assert.equal(presentation(undefined).state, 0);
  assert.equal(canToggle(undefined), false);
});
test('camera off and on have their own labels and valid states', () => {
  const off = normalizeState({ control: 'camera', state: 'off', enabled: true }, 100);
  const on = normalizeState({ control: 'camera', state: 'on', enabled: true }, 100);
  assert.deepEqual(presentation(off, 100), { state: 1, title: 'Off' });
  assert.deepEqual(presentation(on, 100), { state: 2, title: 'ON' });
  assert.equal(canToggle(off, 100), true);
  assert.equal(canToggle(on, 100), true);
  assert.deepEqual(presentation(off, 100, true), { state: 0, title: 'Updating…' });
});
test('camera disabled and stale states fail closed', () => {
  const disabled = normalizeState({ control: 'camera', state: 'on', enabled: false }, 100);
  const stale = normalizeState({ control: 'camera', state: 'off', enabled: true }, 100);
  assert.deepEqual(presentation(disabled, 100), { state: 3, title: 'Blocked' });
  assert.equal(canToggle(disabled, 100), false);
  assert.equal(presentation(stale, 6101).state, 0);
  assert.equal(canToggle(stale, 6101), false);
});
test('microphone and camera states cannot be confused', () => {
  for (const message of [
    { control: 'camera', state: 'muted', enabled: true },
    { control: 'microphone', state: 'off', enabled: true },
    { control: 'unsupported', state: 'on', enabled: true },
    { control: '__proto__', state: 'on', enabled: true },
  ]) {
    const value = normalizeState(message, 100);
    assert.equal(value.state, 'unknown');
    assert.equal(canToggle(value, 100), false);
    assert.equal(presentation(value, 100).state, 0);
  }
});
test('reaction readiness is momentary, selection-specific, and never a sent state', () => {
  const value = normalizeState({ control: 'reaction', state: 'ready', enabled: true }, 100);
  assert.equal(canToggle(value, 100), true);
  for (const [reaction, label] of Object.entries(REACTIONS)) {
    assert.deepEqual(presentation(value, 100, false, reaction), { state: 1, title: label });
  }
  assert.deepEqual(presentation(value, 100, true, 'love'), { state: 0, title: 'Reacting…' });
  assert.deepEqual(presentation(value, 100, false, null), { state: 0, title: 'Choose' });
  assert.equal(presentation(value, 6101).state, 0);
  assert.equal(canToggle(value, 6101), false);
  const invalid = normalizeState({ control: 'reaction', state: 'sent', enabled: true }, 100);
  assert.equal(invalid.state, 'unknown');
  assert.equal(canToggle(invalid, 100), false);
});
test('reaction settings default safely and reject unsupported values', () => {
  assert.equal(configuredReaction(), 'like');
  assert.equal(configuredReaction({ reaction: 'love' }), 'love');
  for (const reaction of ['unsupported', '__proto__', '', ['like'], 1]) {
    assert.equal(configuredReaction({ reaction }), null);
  }
});
test('disabled reaction readiness is blocked', () => {
  const value = normalizeState({ control: 'reaction', state: 'ready', enabled: false }, 100);
  assert.deepEqual(presentation(value, 100), { state: 3, title: 'Blocked' });
  assert.equal(canToggle(value, 100), false);
});
