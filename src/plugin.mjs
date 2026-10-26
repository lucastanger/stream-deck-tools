import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ACTION_CONTROLS, CONTROL_STATES, REACTIONS, configuredReaction, normalizeState, presentation, canToggle } from './model.mjs';

// Stream Deck supplies these arguments; do not expose a network server ourselves.
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];
if (!/^\d+$/.test(args['-port'] ?? '') || !args['-pluginUUID'] || args['-registerEvent'] !== 'registerPlugin') {
  console.error('This plugin must be launched by Stream Deck.');
  process.exit(1);
}
const root = resolve(__dirname, '..');
// Preserve helper and plugin identities so existing microphone keys keep working.
const helperApp = resolve(root, 'bin/Teams Mic Helper.app');
const helperPath = resolve(helperApp, 'Contents/MacOS/TeamsMicHelper');
const socket = new WebSocket(`ws://127.0.0.1:${args['-port']}`);
const contexts = new Map(); // key context -> microphone | camera | reaction
const settings = new Map();
const rendered = new Map();
const snapshots = new Map(Object.keys(CONTROL_STATES).map(control =>
  [control, normalizeState({ control, state: 'unknown', reason: 'Starting helper' })]));
let helper;
let helperReady = false;
let pending; // One operation across all controls; never queue or replay a press.
let restarting;
let restartDelay = 1000;
let stopping = false;

function send(event, context, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, context, payload }));
}
function publish(force = false) {
  for (const [context, control] of contexts) {
    const snapshot = snapshots.get(control);
    const busy = pending?.control === control;
    const reaction = configuredReaction(settings.get(context));
    const display = presentation(snapshot, Date.now(), busy, reaction);
    const signature = JSON.stringify(display);
    if (force || rendered.get(context) !== signature) {
      send('setState', context, { state: display.state });
      send('setTitle', context, { title: display.title, target: 0 });
      rendered.set(context, signature);
    }
    send('sendToPropertyInspector', context, { ...snapshot, busy, display: display.title, reaction });
  }
}
function unknown(reason, error = '', control) {
  for (const kind of control ? [control] : Object.keys(CONTROL_STATES)) {
    snapshots.set(kind, normalizeState({ control: kind, state: 'unknown', reason, error }));
  }
  publish();
}
function clearPending() {
  if (pending) clearTimeout(pending.timer);
  pending = undefined;
}
function command(command, requestID = randomUUID(), control = 'microphone', extra = {}) {
  if (!helper || !helperReady || !helper.stdin.writable) return false;
  helper.stdin.write(JSON.stringify({ command, requestID, control, ...extra }) + '\n', (error) => {
    if (error) { clearPending(); unknown('Helper communication failed; check Teams before retrying', error.message); }
  });
  return true;
}
function startHelper() {
  if (stopping || helper) return;
  helperReady = false;
  // Stream Deck's installer may extract native binaries as mode 0644.
  try { chmodSync(helperPath, 0o755); }
  catch (error) { console.error('Could not make bundled helper executable:', error.message); }
  let launchError;
  const child = spawn(helperPath, ['--daemon'], { stdio: ['pipe', 'pipe', 'pipe'] });
  helper = child;
  child.stdin.on('error', () => {});
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (line.length > 16384) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.event !== 'state') return;
    const control = message.control ?? 'microphone';
    if (!Object.hasOwn(CONTROL_STATES, control)) return;
    helperReady = true;
    restartDelay = 1000;
    snapshots.set(control, normalizeState({ ...message, control }));
    if (pending && control === pending.control && message.requestID === pending.id) {
      const context = pending.context;
      clearPending();
      if (message.error) send('showAlert', context, {});
      else if (message.result === 'pressed') send('showOk', context, {});
    }
    publish();
  });
  child.stderr.on('data', (data) => console.error('[helper]', data.toString().slice(0, 2000)));
  child.on('error', (error) => {
    launchError = error.message;
    console.error('Helper launch failed:', error.message);
  });
  child.on('close', () => {
    lines.close();
    if (helper !== child) return;
    helper = undefined;
    helperReady = false;
    clearPending();
    unknown(launchError ? `Helper failed to start: ${launchError}` : 'Helper disconnected; check Teams before retrying');
    if (!stopping) {
      restarting = setTimeout(startHelper, restartDelay);
      restartDelay = Math.min(restartDelay * 2, 30000);
    }
  });
}
function activate(context) {
  const control = contexts.get(context);
  const reaction = configuredReaction(settings.get(context));
  if (pending || !helperReady || !canToggle(snapshots.get(control)) || (control === 'reaction' && !reaction)) {
    send('showAlert', context, {});
    return;
  }
  const id = randomUUID();
  pending = {
    id, context, control,
    timer: setTimeout(() => {
      clearPending();
      unknown('Command timed out. Check Teams manually; no retry was sent.', '', control);
      send('showAlert', context, {});
    }, control === 'reaction' ? 20000 : 10000),
  };
  publish();
  if (!command(control === 'reaction' ? 'react' : 'toggle', id, control, control === 'reaction' ? { reaction } : {})) {
    clearPending();
    unknown('Helper unavailable; no command sent');
    send('showAlert', context, {});
  }
}
function openLocal(target, reveal = false) {
  const process = spawn('/usr/bin/open', reveal ? ['-R', target] : [target], { stdio: 'ignore' });
  process.on('error', (error) => console.error('Could not open setup:', error.message));
}
socket.on('open', () => {
  socket.send(JSON.stringify({ event: args['-registerEvent'], uuid: args['-pluginUUID'] }));
  startHelper();
});
socket.on('message', (raw) => {
  let event;
  try { event = JSON.parse(raw.toString()); } catch { return; }
  if (event.action && !Object.hasOwn(ACTION_CONTROLS, event.action)) return;
  const control = Object.hasOwn(ACTION_CONTROLS, event.action) ? ACTION_CONTROLS[event.action] : contexts.get(event.context);
  switch (event.event) {
    case 'willAppear':
      if (!control) return;
      contexts.set(event.context, control);
      settings.set(event.context, event.payload?.settings ?? {});
      publish(true);
      break;
    case 'willDisappear':
      contexts.delete(event.context);
      settings.delete(event.context);
      rendered.delete(event.context);
      break;
    case 'keyDown':
      if (contexts.get(event.context) === control && control) activate(event.context);
      break;
    case 'didReceiveSettings':
      if (contexts.has(event.context)) settings.set(event.context, event.payload?.settings ?? {});
      publish(true);
      break;
    case 'propertyInspectorDidAppear':
      publish(true);
      break;
    case 'sendToPlugin':
      if (!control) return;
      if (event.payload?.command === 'configure' && control === 'reaction') {
        const reaction = event.payload.reaction;
        if (typeof reaction !== 'string' || !Object.hasOwn(REACTIONS, reaction)) { send('showAlert', event.context, {}); return; }
        const value = { ...settings.get(event.context), reaction };
        settings.set(event.context, value);
        send('setSettings', event.context, value);
        publish(true);
      }
      if (event.payload?.command === 'inspect') publish(true);
      if (event.payload?.command === 'refresh') command('status', randomUUID(), control);
      if (event.payload?.command === 'permission') {
        openLocal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
        if (!command('permission', randomUUID(), control)) unknown('Helper unavailable. Reopen Stream Deck, then request permission again.');
      }
      if (event.payload?.command === 'privacy') openLocal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      if (event.payload?.command === 'reveal') openLocal(helperApp, true);
      break;
  }
});
const watchdog = setInterval(publish, 1000);
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(watchdog);
  clearTimeout(restarting);
  clearPending();
  helper?.stdin.end();
  helper?.kill('SIGTERM');
  socket.close();
  setTimeout(() => process.exit(0), 150).unref();
}
socket.on('close', shutdown);
socket.on('error', (error) => { console.error('Stream Deck connection:', error.message); shutdown(); });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
