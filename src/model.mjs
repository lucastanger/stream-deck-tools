export const ACTION = 'com.local.teamsmic.toggle';
export const CAMERA_ACTION = 'com.local.teamsmic.camera';
export const REACTION_ACTION = 'com.local.teamsmic.reaction';
export const REACTIONS = Object.freeze({ like: 'Like', love: 'Love', applause: 'Applause', laugh: 'Laugh', surprised: 'Surprised' });
export const ACTION_CONTROLS = Object.freeze({ [ACTION]: 'microphone', [CAMERA_ACTION]: 'camera', [REACTION_ACTION]: 'reaction' });
export const CONTROL_STATES = Object.freeze({ microphone: ['muted', 'unmuted'], camera: ['off', 'on'], reaction: ['ready'] });
export function configuredReaction(settings = {}) {
  const value = settings?.reaction ?? 'like';
  return typeof value === 'string' && Object.hasOwn(REACTIONS, value) ? value : null;
}
export function normalizeState(message, now = Date.now()) {
  const control = message?.control ?? 'microphone';
  const allowed = Object.hasOwn(CONTROL_STATES, control) ? CONTROL_STATES[control] : [];
  const state = allowed.includes(message?.state) ? message.state : 'unknown';
  return {
    control,
    state,
    enabled: state !== 'unknown' && message.enabled === true,
    reason: typeof message?.reason === 'string' ? message.reason : '',
    error: typeof message?.error === 'string' ? message.error : '',
    receivedAt: now,
  };
}
export function presentation(snapshot, now = Date.now(), busy = false, reaction = 'like') {
  if (busy) return { state: 0, title: snapshot?.control === 'reaction' ? 'Reacting…' : 'Updating…' };
  if (snapshot?.control === 'reaction' && !Object.hasOwn(REACTIONS, reaction)) return { state: 0, title: 'Choose' };
  if (!snapshot || now - snapshot.receivedAt > 6000 || snapshot.state === 'unknown') {
    return { state: 0, title: 'Unknown' };
  }
  if (!snapshot.enabled) return { state: 3, title: 'Blocked' };
  if (snapshot.control === 'reaction') return { state: 1, title: REACTIONS[reaction] };
  if (snapshot.control === 'camera') {
    return snapshot.state === 'off' ? { state: 1, title: 'Off' } : { state: 2, title: 'ON' };
  }
  return snapshot.state === 'muted'
    ? { state: 1, title: 'Muted' }
    : { state: 2, title: 'LIVE' };
}
export function canToggle(snapshot, now = Date.now()) {
  return Boolean(snapshot && now - snapshot.receivedAt <= 6000 && snapshot.enabled &&
    Object.hasOwn(CONTROL_STATES, snapshot.control) && CONTROL_STATES[snapshot.control].includes(snapshot.state));
}
