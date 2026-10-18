// Saves and loads state from this browser's localStorage. Syncing to other devices is js/sync.js.
import seed from './seed-data.js';
import { buildStateFromSeed, normalizeState, stampUpdated } from './model.js';

const KEY = 'nhcc.state.v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Saved before sync existed: it holds real edits, so it should beat untouched seed data (0).
      if (!parsed.updatedAt) parsed.updatedAt = 1;
      return normalizeState(parsed);
    }
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
  // Stamped, so a deliberate reset reaches your other devices too.
  const fresh = stampUpdated(buildStateFromSeed(seed));
  saveState(fresh);
  return fresh;
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'new-house-command-center', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  return normalizeState(JSON.parse(text));
}
