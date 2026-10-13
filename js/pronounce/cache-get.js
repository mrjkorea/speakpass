export async function cachedResponse(url, cacheName) {
  let cache = null;
  try {
    if (typeof caches !== 'undefined') cache = await caches.open(cacheName);
  } catch (err) {
    cache = null;
  }
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return { response: hit, fromCache: true };
    } catch (err) { /* read through */ }
  }
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error('download-failed');
  let putError = '';
  if (cache) {
    try { await cache.put(url, response.clone()); } catch (err) { putError = String(err && err.message || err); }
  }
  return { response, fromCache: false, putError };
}
