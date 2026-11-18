// A tabela das rotas POR EBOOK (`/api/ebooks/:isbn/...`): método + caminho (depois do isbn) → handler. As exceções à política do pedido
// (server/router.js) são colunas visíveis em vez de `if` espalhados:
//   public      — responde sem login (o <img> do browser não leva token); `true` ou um predicado dos parâmetros
//   lockExempt  — escrever é permitido a quem NÃO detém o lock de edição (presença e partilhas)
//   prefix      — o caminho pode ter segmentos a mais (só as imagens)
import { corsHeaders, safeSegment } from './response.js';
import { stmt } from './database.js';
import * as presence from './presence.js';
import * as ebooks from './routes/ebooks.js';
import * as content from './routes/content.js';
import * as grammar from './routes/grammar.js';
import * as comments from './routes/comments.js';
import * as epub from './routes/epub.js';
import * as images from './routes/images.js';
import * as printPdf from './routes/print-pdf.js';
import * as validation from './routes/validation.js';
import * as ai from './routes/ai.js';
import * as aiChanges from './routes/ai-changes.js';

const notFound = () => new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
/** Um imageId que não é um nome de ficheiro seguro nunca chega ao handler. */
const safeImage = (fn) => (c) => (safeSegment(c.params.imageId) ? fn(c) : notFound());
const touchPresence = ({ isbn, user, clientId }) =>
  Response.json(presence.touch(isbn, clientId, stmt.getDisplayName.get(Number(user.sub))?.name ?? user.email), { headers: corsHeaders });

/** [método, caminho, handler({ req, url, isbn, user, clientId, params }), opções] */
export const EBOOK_ROUTES = [
  ['GET', '', ({ isbn }) => ebooks.getEbook(isbn)],
  ['DELETE', '', ({ req, isbn, user }) => ebooks.deleteEbook(req, isbn, user)],

  ['POST', 'presence', touchPresence, { lockExempt: true }],
  ['DELETE', 'presence', ({ isbn, clientId }) => { presence.release(isbn, clientId); return Response.json({ ok: true }, { headers: corsHeaders }); }, { lockExempt: true }],

  ['PUT', 'status', ({ req, isbn, user }) => ebooks.updateStatus(req, isbn, user)],
  ['PUT', 'metadata', ({ req, isbn }) => ebooks.updateMetadata(req, isbn)],
  ['POST', 'content', ({ req, isbn }) => content.saveContent(req, isbn)],
  ['GET', 'content', ({ req, isbn, url }) => content.getContent(req, isbn, url)],
  ['GET', 'history', ({ req, isbn }) => content.getHistory(req, isbn)],
  ['POST', 'history-style', ({ req, isbn }) => content.saveStyleSnapshot(req, isbn)],
  ['GET', 'cover', ({ isbn }) => epub.getCover(isbn), { public: true }],
  ['POST', 'cover', ({ req, isbn }) => epub.saveCover(req, isbn)],
  ['DELETE', 'cover', ({ isbn }) => epub.deleteCover(isbn)],
  ['GET', 'grammar', ({ isbn }) => grammar.getGrammar(isbn)],
  ['POST', 'grammar', ({ req, isbn }) => grammar.saveGrammar(req, isbn)],
  ['GET', 'comments', ({ isbn }) => comments.getComments(isbn)],
  ['POST', 'comments', ({ req, isbn, user }) => comments.addComment(req, isbn, user)],
  ['POST', 'validate', ({ req }) => validation.validate(req)],
  ['POST', 'ai', ({ req, isbn, user }) => ai.chat(req, user, isbn)],
  ['POST', 'ai-alt', ({ req, isbn, user }) => ai.altText(req, isbn, user)],
  ['GET', 'ai-changes', ({ isbn }) => aiChanges.list(isbn)],
  ['POST', 'ai-changes', ({ req, isbn, user }) => aiChanges.add(req, isbn, user)],
  ['POST', 'validate-accessibility', ({ req, isbn }) => validation.validateAccessibility(req, isbn)],
  ['POST', 'epub', ({ req, isbn }) => epub.saveEpub(req, isbn)],
  ['GET', 'epub', ({ isbn }) => epub.getEpub(isbn)],
  ['GET', 'epubs', ({ isbn }) => epub.getEpubHistory(isbn)],
  ['GET', 'style', ({ isbn }) => epub.getStyle(isbn)],
  ['PUT', 'style', ({ req, isbn }) => epub.saveStyle(req, isbn)],
  ['GET', 'share', ({ isbn, user }) => ebooks.listShares(isbn, user)],
  ['POST', 'share', ({ req, isbn, user }) => ebooks.shareEbook(req, isbn, user)],
  ['GET', 'print-pdf', ({ isbn }) => printPdf.getPrintPdf(isbn)],
  ['POST', 'print-pdf', ({ req, isbn }) => printPdf.savePrintPdf(req, isbn)],

  ['GET', 'epubs/:file', ({ isbn, params }) => epub.getEpubFile(isbn, params.file)],
  ['PUT', 'ai-changes/:id', ({ req, isbn, user, params }) => aiChanges.revert(isbn, params.id, user, req)],
  ['DELETE', 'ai-changes/:id', ({ isbn, params }) => aiChanges.restore(isbn, params.id)],
  ['GET', 'history-style/:file', ({ isbn, params }) => content.getStyleSnapshot(isbn, params.file)],
  ['PUT', 'history/:file', ({ req, isbn, params }) => content.setHistoryLabel(req, isbn, params.file)],
  ['DELETE', 'share/:userId', ({ isbn, user, params }) => ebooks.unshareEbook(isbn, params.userId, user)],
  ['PUT', 'comments/:id', ({ req, isbn, user, params }) => comments.resolveComment(req, isbn, Number(params.id), user)],
  ['DELETE', 'comments/:id', ({ isbn, user, params }) => comments.deleteComment(isbn, Number(params.id), user)],

  ['GET', 'images', ({ req, isbn }) => images.listImages(req, isbn)],
  ['POST', 'images/compress', ({ req, isbn }) => images.compressImages(req, isbn), { prefix: true }],
  ['POST', 'images/batch', ({ req, isbn }) => images.batchImages(req, isbn), { prefix: true }],
  ['GET', 'images/:imageId', safeImage(({ req, url, isbn, params }) => images.getImage(isbn, params.imageId, url, req)), { prefix: true, public: (p) => !!p.imageId && p.imageId !== 'batch' }],
  ['PUT', 'images/:imageId', safeImage(({ req, isbn, params }) => images.renameImage(req, isbn, params.imageId)), { prefix: true }],
  ['DELETE', 'images/:imageId', safeImage(({ isbn, params }) => images.deleteImage(isbn, params.imageId)), { prefix: true }],
  ['POST', 'images/:imageId', safeImage(({ req, isbn, params }) => images.saveSingleImage(req, isbn, params.imageId)), { prefix: true }],
];

function matchPath(pattern, rest, prefix) {
  const want = pattern === '' ? [] : pattern.split('/');
  if (prefix ? rest.length < want.length : rest.length !== want.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = rest[i];
    else if (want[i] !== rest[i]) return null;
  }
  return params;
}

/** `rest` = os segmentos depois do isbn. Devolve { route, params } da primeira linha que casa, ou null. */
export function matchEbookRoute(method, rest) {
  for (const route of EBOOK_ROUTES) {
    const [m, pattern, , opts = {}] = route;
    if (m !== method) continue;
    const params = matchPath(pattern, rest, !!opts.prefix);
    if (params) return { route, params, opts };
  }
  return null;
}

/** Responde sem login? (só GET). */
export const isPublic = (hit) => !!hit && (typeof hit.opts.public === 'function' ? hit.opts.public(hit.params) : !!hit.opts.public);

/** As partilhas ficam fora do lock de edição (sair de uma partilha não depende de quem está a editar), como a presença. */
export const isLockExempt = (hit, rest) => !!hit?.opts.lockExempt || rest[0] === 'share';
