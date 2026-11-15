import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Minimal JSON-file store for the single-user prototype: one profile and one
 * shortlist. Writes go to a temp file first and are then renamed, so a crash mid-write
 * never leaves a half-written store. A real deployment would replace this module with
 * a database behind the same interface (see docs/TECHNICAL_NOTE.md).
 */
const EMPTY = () => ({ profile: null, shortlist: [] });

export function createStore(filePath) {
  let state = load();

  function load() {
    if (!existsSync(filePath)) return EMPTY();
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      const shortlist = Array.isArray(data.shortlist) ? data.shortlist.map((s) => ({ status: 'saved', ...s })) : [];
      return { profile: data.profile ?? null, shortlist };
    } catch {
      // A corrupt store should not take the app down; start fresh and keep the bad file.
      renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
      return EMPTY();
    }
  }

  function persist() {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, filePath);
  }

  return {
    getProfile: () => state.profile,
    saveProfile(profile) {
      state.profile = { ...profile, updatedAt: new Date().toISOString() };
      persist();
      return state.profile;
    },
    deleteProfile() {
      state.profile = null;
      persist();
    },
    getShortlist: () => state.shortlist,
    addToShortlist(opportunityId) {
      const existing = state.shortlist.find((s) => s.opportunityId === opportunityId);
      if (existing) return { entry: existing, created: false };
      const entry = { opportunityId, savedAt: new Date().toISOString(), status: 'saved' };
      state.shortlist.push(entry);
      persist();
      return { entry, created: true };
    },
    /** Track progress on a saved opportunity ('saved' or 'applied'). Returns null if it is not saved. */
    setShortlistStatus(opportunityId, status) {
      const entry = state.shortlist.find((s) => s.opportunityId === opportunityId);
      if (!entry) return null;
      entry.status = status;
      entry.statusUpdatedAt = new Date().toISOString();
      persist();
      return entry;
    },
    removeFromShortlist(opportunityId) {
      const before = state.shortlist.length;
      state.shortlist = state.shortlist.filter((s) => s.opportunityId !== opportunityId);
      if (state.shortlist.length !== before) persist();
      return state.shortlist.length !== before;
    },
  };
}
