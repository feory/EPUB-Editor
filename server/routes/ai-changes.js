// Registo das alterações da IA (ver ai-changes.js). Quem pode ver o livro pode ver e registar (o router já valida o acesso);
// o registo é só texto + nomes de ficheiros do histórico, que têm de existir.
import { corsHeaders, safeSegment } from '../response.js';
import { listChanges, addChange, markReverted, markRestored, hasHistoryFile } from '../ai-changes.js';

const HTML_FILE = /^content_[\w-]+\.html(\.gz)?$/;
const CSS_FILE = /^style_[\w-]+\.css$/;
const json = (body, status = 200) => Response.json(body, { status, headers: corsHeaders });
const by = (user) => user.email;

export const list = (isbn) => json({ changes: listChanges(isbn) });

export async function add(req, isbn, user) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const { request, lines, htmlFile, cssFile } = body ?? {};
  if (typeof request !== 'string' || !request.trim() || request.length > 200) return json({ error: 'request inválido' }, 400);
  if (!Array.isArray(lines) || lines.length > 30 || !lines.every((l) => typeof l === 'string' && l.length <= 300)) return json({ error: 'lines inválido' }, 400);
  if (!htmlFile && !cssFile) return json({ error: 'Falta o ficheiro do estado anterior' }, 400);
  if (htmlFile && !(HTML_FILE.test(htmlFile) && hasHistoryFile(isbn, htmlFile))) return json({ error: 'htmlFile inválido' }, 400);
  if (cssFile && !(CSS_FILE.test(cssFile) && hasHistoryFile(isbn, cssFile))) return json({ error: 'cssFile inválido' }, 400);
  return json({ change: addChange(isbn, { by: by(user), request: request.trim(), lines, htmlFile, cssFile }) });
}

// PUT /api/ebooks/:isbn/ai-changes/:id  → marca como revertida; o corpo (opcional) traz o estado de antes de reverter, para o repor
export async function revert(isbn, id, user, req) {
  if (!safeSegment(id)) return json({ error: 'id inválido' }, 400);
  let body = {};
  try { body = (await req?.json()) ?? {}; } catch { /* sem corpo */ }
  const { htmlFile, cssFile } = body;
  if (htmlFile && !(HTML_FILE.test(htmlFile) && hasHistoryFile(isbn, htmlFile))) return json({ error: 'htmlFile inválido' }, 400);
  if (cssFile && !(CSS_FILE.test(cssFile) && hasHistoryFile(isbn, cssFile))) return json({ error: 'cssFile inválido' }, 400);
  const entry = markReverted(isbn, id, by(user), { htmlFile, cssFile });
  return entry ? json({ change: entry }) : json({ error: 'Not Found' }, 404);
}

// DELETE /api/ebooks/:isbn/ai-changes/:id  → tira a marca de revertida (a alteração foi reposta)
export function restore(isbn, id) {
  if (!safeSegment(id)) return json({ error: 'id inválido' }, 400);
  const entry = markRestored(isbn, id);
  return entry ? json({ change: entry }) : json({ error: 'Not Found' }, 404);
}
