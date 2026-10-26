import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTION, CAMERA_ACTION, REACTION_ACTION } from '../src/model.mjs';

async function waitFor(predicate, label, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Timed out: ' + label);
}

async function fixture(t, camera = { state: 'off', enabled: true }, reaction = { state: 'ready', enabled: true }) {
  const dir = await mkdtemp(join(tmpdir(), 'teams-controls-test-'));
  const bin = join(dir, 'bin');
  const native = join(bin, 'Teams Mic Helper.app/Contents/MacOS');
  await mkdir(native, { recursive: true });
  await copyFile('com.local.teamsmic.sdPlugin/bin/plugin.cjs', join(bin, 'plugin.cjs'));
  const log = join(dir, 'commands.jsonl');
  const stateFile = join(dir, 'state.json');
  await writeFile(log, '');
  await writeFile(stateFile, JSON.stringify({ microphone: { state: 'muted', enabled: true }, camera, reaction }));
  // No real Teams process or Accessibility API is involved in these tests.
  await writeFile(join(native, 'TeamsMicHelper'), `#!${process.execPath}
const {createInterface}=require('node:readline');
const {appendFileSync,readFileSync,writeFileSync}=require('node:fs');
const path=${JSON.stringify(stateFile)};
function states(){return JSON.parse(readFileSync(path,'utf8'))}
function emit(control,requestID,extra={}){console.log(JSON.stringify({event:'state',control,...states()[control],...extra,requestID}));}
function poll(){for(const control of Object.keys(states()))emit(control)}
poll();
const timer=setInterval(poll,100);
createInterface({input:process.stdin}).on('line',line=>{
 const message=JSON.parse(line);
 appendFileSync(${JSON.stringify(log)},line+'\\n');
 const control=message.control;
 if(message.command==='toggle')setTimeout(()=>{
  const values=states();
  const inactive=control==='camera'?'off':'muted';
  const active=control==='camera'?'on':'unmuted';
  values[control].state=values[control].state===inactive?active:inactive;
  writeFileSync(path,JSON.stringify(values));emit(control,message.requestID);
 },120);
 else if(message.command==='react')setTimeout(()=>{
  const result=states().reaction.fail?{error:'Reaction press failed; no retry'}:{result:'pressed'};
  emit(control,message.requestID,result);
 },120);
 else emit(control,message.requestID);
}).on('close',()=>{clearInterval(timer);process.exit(0)});
`, { mode: 0o644 }); // Reproduce Stream Deck's installed package permissions.
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const received = [];
  // Install the listener before starting the child, so registration cannot race.
  const connected = new Promise(resolve => server.once('connection', socket => {
    socket.on('message', raw => received.push(JSON.parse(raw)));
    resolve(socket);
  }));
  const child = spawn(process.execPath, [join(bin, 'plugin.cjs'), '-port', String(server.address().port), '-pluginUUID', 'test-plugin', '-registerEvent', 'registerPlugin', '-info', '{}']);
  let errors = '';
  child.stderr.on('data', value => { errors += value; });
  let socket;
  t.after(async () => {
    const exited = child.exitCode === null ? once(child, 'exit') : undefined;
    child.kill('SIGTERM');
    if (exited) await exited;
    socket?.terminate();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  socket = await connected;
  await waitFor(() => received.some(value => value.event === 'registerPlugin'), 'registration');
  assert.equal(received.find(value => value.event === 'registerPlugin').uuid, 'test-plugin');
  const send = (event, context, action, payload = {}) => socket.send(JSON.stringify({ event, action, context, payload }));
  const title = context => received.filter(value => value.context === context && value.event === 'setTitle').at(-1)?.payload.title;
  const commands = async () => (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  return { dir, native, received, send, title, commands, stateFile, errors: () => errors };
}

test('repair helper permissions; mic and camera toggles route independently; duplicate presses do not queue', async t => {
  const f = await fixture(t);
  f.send('willAppear', 'mic-key', ACTION);
  f.send('willAppear', 'camera-key', CAMERA_ACTION);
  f.send('willAppear', 'camera-key-2', CAMERA_ACTION);
  await waitFor(() => f.title('mic-key') === 'Muted' && f.title('camera-key') === 'Off', 'initial independent states');
  assert.equal((await stat(join(f.native, 'TeamsMicHelper'))).mode & 0o777, 0o755);
  f.send('keyDown', 'mic-key', ACTION);
  f.send('keyDown', 'mic-key', ACTION);
  await waitFor(() => f.title('mic-key') === 'LIVE', 'confirmed microphone display');
  assert.equal(f.title('camera-key'), 'Off');
  f.send('keyDown', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.title('camera-key') === 'Updating…', 'camera pending');
  assert.equal(f.title('camera-key-2'), 'Updating…');
  assert.equal(f.title('mic-key'), 'LIVE');
  f.send('keyDown', 'camera-key-2', CAMERA_ACTION);
  f.send('keyDown', 'mic-key', ACTION); // Shared helper serialises presses; do not queue.
  await waitFor(() => f.title('camera-key') === 'ON' && f.title('camera-key-2') === 'ON', 'confirmed camera display');
  assert.equal(f.title('mic-key'), 'LIVE');
  assert.deepEqual((await f.commands()).filter(value => value.command === 'toggle').map(value => value.control), ['microphone', 'camera']);
  assert.ok(f.received.some(value => value.event === 'showAlert'));
  f.send('sendToPlugin', 'camera-key', CAMERA_ACTION, { command: 'refresh' });
  await waitFor(async () => (await f.commands()).some(value => value.command === 'status' && value.control === 'camera'), 'camera-specific refresh');
  f.send('sendToPlugin', 'mic-key', ACTION, { command: 'refresh' });
  await waitFor(async () => (await f.commands()).some(value => value.command === 'status' && value.control === 'microphone'), 'microphone-specific refresh');
  f.send('keyDown', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.title('camera-key') === 'Off' && f.title('camera-key-2') === 'Off', 'camera toggles back off');
  assert.equal(f.title('mic-key'), 'LIVE');
  assert.deepEqual((await f.commands()).filter(value => value.command === 'toggle').map(value => value.control), ['microphone', 'camera', 'camera']);
  assert.equal(f.errors(), '');
});

test('missing or disabled camera never blocks mic state or sends a camera press', async t => {
  const f = await fixture(t, { state: 'unknown', enabled: false, reason: 'No camera control' });
  f.send('willAppear', 'mic-key', ACTION);
  f.send('willAppear', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.title('mic-key') === 'Muted', 'microphone available');
  assert.equal(f.title('camera-key'), 'Unknown');
  f.send('keyDown', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.received.some(value => value.context === 'camera-key' && value.event === 'showAlert'), 'unknown-camera alert');
  assert.equal((await f.commands()).length, 0);
  f.send('keyDown', 'mic-key', ACTION);
  await waitFor(() => f.title('mic-key') === 'LIVE', 'mic works without camera');
  const values = JSON.parse(await readFile(f.stateFile, 'utf8'));
  values.camera = { state: 'on', enabled: false, reason: 'Camera disabled' };
  await writeFile(f.stateFile, JSON.stringify(values));
  await waitFor(() => f.title('camera-key') === 'Blocked', 'disabled camera display');
  const alertsBefore = f.received.filter(value => value.event === 'showAlert').length;
  f.send('keyDown', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.received.filter(value => value.event === 'showAlert').length > alertsBefore, 'disabled-camera alert');
  assert.deepEqual((await f.commands()).map(value => value.control), ['microphone']);
  assert.equal(f.title('mic-key'), 'LIVE');
  assert.equal(f.errors(), '');
});

test('manual camera changes update camera keys, not microphone keys', async t => {
  const f = await fixture(t);
  f.send('willAppear', 'mic-key', ACTION);
  f.send('willAppear', 'camera-key', CAMERA_ACTION);
  await waitFor(() => f.title('camera-key') === 'Off' && f.title('mic-key') === 'Muted', 'initial states');
  const values = JSON.parse(await readFile(f.stateFile, 'utf8'));
  values.camera.state = 'on';
  await writeFile(f.stateFile, JSON.stringify(values));
  await waitFor(() => f.title('camera-key') === 'ON', 'external camera change');
  assert.equal(f.title('mic-key'), 'Muted');
  assert.equal((await f.commands()).length, 0);
});

test('reactions use per-key settings, persist changes, and dispatch once without changing mic/camera', async t => {
  const f = await fixture(t);
  f.send('willAppear', 'mic', ACTION);
  f.send('willAppear', 'camera', CAMERA_ACTION);
  f.send('willAppear', 'like', REACTION_ACTION);
  f.send('willAppear', 'love', REACTION_ACTION, { settings: { reaction: 'love' } });
  await waitFor(() => f.title('like') === 'Like' && f.title('love') === 'Love' && f.title('mic') === 'Muted', 'configured reactions ready');
  f.send('keyDown', 'love', REACTION_ACTION);
  f.send('keyDown', 'love', REACTION_ACTION);
  await waitFor(() => f.title('love') === 'Reacting…', 'pending reaction');
  assert.equal(f.title('mic'), 'Muted');
  assert.equal(f.title('camera'), 'Off');
  await waitFor(() => f.received.some(value => value.event === 'showOk' && value.context === 'love'), 'press acknowledgement');
  let commands = await f.commands();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'react');
  assert.equal(commands[0].control, 'reaction');
  assert.equal(commands[0].reaction, 'love');
  f.send('sendToPlugin', 'like', REACTION_ACTION, { command: 'configure', reaction: 'applause' });
  await waitFor(() => f.title('like') === 'Applause', 'updated setting');
  assert.ok(f.received.some(value => value.event === 'setSettings' && value.context === 'like' && value.payload.reaction === 'applause'));
  assert.equal(f.title('love'), 'Love');
  assert.equal((await f.commands()).length, 1); // Saving is never a send action.
  f.send('keyDown', 'like', REACTION_ACTION);
  await waitFor(() => f.received.some(value => value.event === 'showOk' && value.context === 'like'), 'second reaction acknowledgement');
  commands = await f.commands();
  assert.deepEqual(commands.map(value => value.reaction), ['love', 'applause']);
  assert.equal(f.title('mic'), 'Muted');
  assert.equal(f.title('camera'), 'Off');
  assert.equal(f.errors(), '');
});

test('invalid stored reaction fails closed; invalid configuration does not send or change settings', async t => {
  const f = await fixture(t);
  f.send('willAppear', 'bad', REACTION_ACTION, { settings: { reaction: 'not-supported' } });
  await waitFor(() => f.title('bad') === 'Choose', 'invalid selection');
  f.send('keyDown', 'bad', REACTION_ACTION);
  await waitFor(() => f.received.some(value => value.event === 'showAlert'), 'invalid-selection alert');
  assert.equal((await f.commands()).length, 0);
  f.send('sendToPlugin', 'bad', REACTION_ACTION, { command: 'configure', reaction: '__proto__' });
  f.send('sendToPlugin', 'bad', REACTION_ACTION, { command: 'inspect' });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(f.title('bad'), 'Choose');
  assert.equal(f.received.filter(value => value.event === 'setSettings').length, 0);
  f.send('didReceiveSettings', 'bad', REACTION_ACTION, { settings: { reaction: 'surprised' } });
  await waitFor(() => f.title('bad') === 'Surprised', 'restored persisted setting');
  assert.equal((await f.commands()).length, 0);
});

test('unavailable reactions are blocked without affecting other controls', async t => {
  const f = await fixture(t, { state: 'off', enabled: true }, { state: 'unknown', enabled: false });
  f.send('willAppear', 'reaction', REACTION_ACTION);
  f.send('willAppear', 'mic', ACTION);
  await waitFor(() => f.title('mic') === 'Muted', 'mic ready');
  assert.equal(f.title('reaction'), 'Unknown');
  f.send('keyDown', 'reaction', REACTION_ACTION);
  await waitFor(() => f.received.some(value => value.event === 'showAlert'), 'unavailable reaction alert');
  assert.equal((await f.commands()).length, 0);
  f.send('keyDown', 'mic', ACTION);
  await waitFor(() => f.title('mic') === 'LIVE', 'independent mic operation');
  const values = JSON.parse(await readFile(f.stateFile, 'utf8'));
  values.reaction = { state: 'ready', enabled: false };
  await writeFile(f.stateFile, JSON.stringify(values));
  await waitFor(() => f.title('reaction') === 'Blocked', 'disabled reactions');
  f.send('keyDown', 'reaction', REACTION_ACTION);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual((await f.commands()).map(value => value.control), ['microphone']);
});

test('reaction failure is reported without retry or success feedback', async t => {
  const f = await fixture(t, { state: 'off', enabled: true }, { state: 'ready', enabled: true, fail: true });
  f.send('willAppear', 'reaction', REACTION_ACTION, { settings: { reaction: 'laugh' } });
  await waitFor(() => f.title('reaction') === 'Laugh', 'reaction ready');
  f.send('keyDown', 'reaction', REACTION_ACTION);
  await waitFor(() => f.received.some(value => value.event === 'showAlert'), 'failure feedback');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(f.received.filter(value => value.event === 'showOk').length, 0);
  assert.equal((await f.commands()).length, 1);
});
