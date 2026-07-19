import { db, stmt } from '../database.js';
import { corsHeaders } from '../response.js';

export function getGrammar(isbn) {
  const rows = stmt.grammarGetAll.all(isbn);
  const session = stmt.grammarSessionGet.get(isbn);
  const cache = {};
  for (const r of rows) {
    try { cache[r.hash] = JSON.parse(r.matches); } catch { cache[r.hash] = []; }
  }
  let matches = [];
  try { matches = JSON.parse(session?.matches ?? '[]'); } catch { /* empty */ }
  return Response.json({ matches, cache }, { headers: corsHeaders });
}

const MAX_MATCHES = 10_000;
const MAX_CACHE_BYTES = 500_000;

export async function saveGrammar(req, isbn) {
  const { cache, matches } = await req.json();
  if (cache && typeof cache === 'object') {
    if (JSON.stringify(cache).length > MAX_CACHE_BYTES) {
      return Response.json({ error: 'Cache too large' }, { status: 400, headers: corsHeaders });
    }
    db.transaction(() => {
      for (const [hash, m] of Object.entries(cache)) {
        stmt.grammarUpsert.run(isbn, hash, JSON.stringify(m));
      }
    })();
  }
  if (Array.isArray(matches)) {
    if (matches.length > MAX_MATCHES) {
      return Response.json({ error: 'Too many matches' }, { status: 400, headers: corsHeaders });
    }
    stmt.grammarSessionUpsert.run(isbn, JSON.stringify(matches));
  }
  return Response.json({ message: 'Grammar saved' }, { headers: corsHeaders });
}
