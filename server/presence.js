// In-memory presence/edit-lock per ebook.
// Identidade = clientId (por separador/janela), não userId — distingue 2 janelas da mesma conta.
// ponytail: lock em memória; se for preciso throughput multi-processo, mover para tabela SQLite com TTL.

const TTL_MS = 15_000; // heartbeat do cliente a cada 5s → tolera ~2 falhas
const locks = new Map(); // isbn -> Map<clientId, { email, since, lastSeen }>

function prune(isbn) {
  const clients = locks.get(isbn);
  if (!clients) return null;
  const cutoff = Date.now() - TTL_MS;
  for (const [cid, info] of clients) {
    if (info.lastSeen < cutoff) clients.delete(cid);
  }
  if (clients.size === 0) { locks.delete(isbn); return null; }
  return clients;
}

// holder = cliente presente com menor `since` (desempate por clientId)
function holderOf(clients) {
  let holderId = null, holder = null;
  for (const [cid, info] of clients) {
    if (holder === null || info.since < holder.since || (info.since === holder.since && cid < holderId)) {
      holderId = cid; holder = info;
    }
  }
  return { holderId, holder };
}

export function touch(isbn, clientId, email) {
  let clients = locks.get(isbn);
  if (!clients) { clients = new Map(); locks.set(isbn, clients); }
  const now = Date.now();
  const existing = clients.get(clientId);
  if (existing) { existing.lastSeen = now; existing.email = email; }
  else clients.set(clientId, { email, since: now, lastSeen: now });
  prune(isbn);
  clients = locks.get(isbn) ?? new Map();
  const { holderId, holder } = holderOf(clients);
  const others = [];
  for (const [cid, info] of clients) if (cid !== clientId) others.push(info.email);
  return {
    holderId,
    holderEmail: holder ? holder.email : null,
    others,
    canEdit: holderId === clientId,
  };
}

export function release(isbn, clientId) {
  const clients = locks.get(isbn);
  if (!clients) return;
  clients.delete(clientId);
  if (clients.size === 0) locks.delete(isbn);
}

export function anyonePresent(isbn) {
  return prune(isbn) !== null;
}

export function isHolder(isbn, clientId) {
  const clients = prune(isbn);
  if (!clients) return false;
  return holderOf(clients).holderId === clientId;
}

export function holderEmail(isbn) {
  const clients = prune(isbn);
  if (!clients) return null;
  const { holder } = holderOf(clients);
  return holder ? holder.email : null;
}
