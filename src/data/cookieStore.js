import { profileSchema } from '../validation/schemas.js';

/**
 * Per-visitor store for hosted demos, where the server has no durable disk.
 *
 * The visitor's profile and saved jobs travel in an HttpOnly cookie, so the server
 * stays stateless and each visitor only ever sees their own data. It exposes the same
 * interface as the file store (`store.js`), so the API code does not know which one
 * it is talking to.
 *
 * The cookie comes from the browser and is therefore untrusted: everything read from
 * it is validated again, and anything invalid is discarded.
 */
const COOKIE = 'cmp_state';
const MAX_BYTES = 3800; // browsers cap a cookie at about 4 KB
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export class StoreLimitError extends Error {}

function readCookie(req) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim();
  }
  return null;
}

function parseState(raw) {
  const empty = { profile: null, shortlist: [] };
  if (!raw) return empty;
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    let profile = null;
    if (data.profile) {
      const { updatedAt, ...fields } = data.profile;
      const parsed = profileSchema.safeParse(fields);
      if (parsed.success) profile = { ...parsed.data, updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined };
    }
    const shortlist = (Array.isArray(data.shortlist) ? data.shortlist : [])
      .filter((s) => s && typeof s.opportunityId === 'string' && /^[a-z0-9-]{1,40}$/.test(s.opportunityId))
      .slice(0, 50)
      .map((s) => ({
        opportunityId: s.opportunityId,
        savedAt: typeof s.savedAt === 'string' ? s.savedAt : new Date().toISOString(),
        status: s.status === 'applied' ? 'applied' : 'saved',
      }));
    return { profile, shortlist };
  } catch {
    return empty;
  }
}

/** Returns a function that builds a store for one request/response pair. */
export function cookieStoreFactory({ secure = true } = {}) {
  return (req, res) => {
    let state = parseState(readCookie(req));

    function persist() {
      const value = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
      if (value.length > MAX_BYTES) {
        throw new StoreLimitError('This profile is too large for the hosted demo. Shorten the summary or remove a few entries.');
      }
      res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${value}; Path=/api; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
      );
    }

    return {
      getProfile: () => state.profile,
      saveProfile(profile) {
        const previous = state;
        state = { ...state, profile: { ...profile, updatedAt: new Date().toISOString() } };
        try {
          persist();
        } catch (err) {
          state = previous;
          throw err;
        }
        return state.profile;
      },
      deleteProfile() {
        state = { ...state, profile: null };
        persist();
      },
      getShortlist: () => state.shortlist,
      addToShortlist(opportunityId) {
        const existing = state.shortlist.find((s) => s.opportunityId === opportunityId);
        if (existing) return { entry: existing, created: false };
        const entry = { opportunityId, savedAt: new Date().toISOString(), status: 'saved' };
        state = { ...state, shortlist: [...state.shortlist, entry] };
        persist();
        return { entry, created: true };
      },
      setShortlistStatus(opportunityId, status) {
        const entry = state.shortlist.find((s) => s.opportunityId === opportunityId);
        if (!entry) return null;
        entry.status = status;
        persist();
        return entry;
      },
      removeFromShortlist(opportunityId) {
        const before = state.shortlist.length;
        state = { ...state, shortlist: state.shortlist.filter((s) => s.opportunityId !== opportunityId) };
        if (state.shortlist.length !== before) persist();
        return state.shortlist.length !== before;
      },
    };
  };
}
