/** Thin fetch wrapper: JSON in/out, and a typed error for non-2xx responses. */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.issues = body?.issues ?? [];
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'network_error', message: 'Could not reach the server. Is it running?' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  getProfile: () => request('GET', '/profile'),
  getSampleProfile: () => request('GET', '/profile/sample'),
  saveProfile: (profile) => request('PUT', '/profile', profile),
  deleteProfile: () => request('DELETE', '/profile'),
  getOpportunities: () => request('GET', '/opportunities'),
  getMatches: () => request('GET', '/matches'),
  getMatch: (id) => request('GET', `/matches/${encodeURIComponent(id)}`),
  getOpportunity: (id) => request('GET', `/opportunities/${encodeURIComponent(id)}`),
  getShortlist: () => request('GET', '/shortlist'),
  addToShortlist: (opportunityId) => request('POST', '/shortlist', { opportunityId }),
  setShortlistStatus: (id, status) => request('PATCH', `/shortlist/${encodeURIComponent(id)}`, { status }),
  removeFromShortlist: (id) => request('DELETE', `/shortlist/${encodeURIComponent(id)}`),
};
