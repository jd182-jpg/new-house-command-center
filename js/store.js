// Saves and loads state from this browser's localStorage. Nothing leaves the device.
import seed from './seed-data.js';
import { buildStateFromSeed, normalizeState } from './model.js';

const KEY = 'nhcc.state.v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (err) {
    console.warn('Saved data could not be read, starting from seed.', err);
  }
  return buildStateFromSeed(seed);
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Could not save.', err);
    return false;
  }
}

export function resetToSeed() {
  const fresh = buildStateFromSeed(seed);
  saveState(fresh);
  return fresh;
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'new-house-command-center', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  return normalizeState(JSON.parse(text));
}
