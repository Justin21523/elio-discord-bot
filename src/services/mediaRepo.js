// Domain Service: MediaRepo
// English-only. In-memory repo with tags/nsfw. Replace with Mongo later.

const _items = []; // { id, url, tags:[], nsfw:false, disabled:false, addedAt }

function _id() { return Math.random().toString(36).slice(2, 10); }

/** Add an item */
export async function add({ url, tags = [], nsfw = false }) {
  if (!url) return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'url required' } };
  const it = { id: _id(), url, tags, nsfw: !!nsfw, disabled: false, addedAt: Date.now() };
  _items.push(it);
  return { ok: true, data: it };
}

/** Disable an item */
export async function disable(id, disabled = true) {
  const it = _items.find(x => x.id === id);
  if (!it) return { ok: false, error: { code: 'NOT_FOUND', message: 'item not found' } };
  it.disabled = !!disabled;
  return { ok: true, data: it };
}

/** List items */
export async function list({ tags = [], includeDisabled = false } = {}) {
  let arr = _items.slice();
  if (tags.length) {
    arr = arr.filter(x => x.tags.some(t => tags.includes(t)));
  }
  if (!includeDisabled) arr = arr.filter(x => !x.disabled);
  return { ok: true, data: arr.sort((a, b) => b.addedAt - a.addedAt) };
}

/** Pick a random item (respect nsfwAllowed + optional tags) */
export async function pickRandom({ nsfwAllowed = false, tags = [] } = {}) {
  let arr = _items.filter(x => !x.disabled);
  if (!nsfwAllowed) arr = arr.filter(x => !x.nsfw);
  if (tags.length) arr = arr.filter(x => x.tags.some(t => tags.includes(t)));
  if (!arr.length) return { ok: false, error: { code: 'NOT_FOUND', message: 'no media matched' } };
  const it = arr[Math.floor(Math.random() * arr.length)];
  return { ok: true, data: it };
}
