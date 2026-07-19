const store = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 15;
const MAX_STORE_SIZE = 10_000;

export function loginRateLimit(req, headers) {
  const ip = req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    if (store.size >= MAX_STORE_SIZE) purgeRateLimitStore();
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: 'Too many login attempts. Try again later.' }),
      { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } }
    );
  }
  entry.count++;
  return null;
}

export function purgeRateLimitStore() {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (entry.resetAt < now) store.delete(ip);
  }
}
