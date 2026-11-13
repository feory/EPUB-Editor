import { existsSync, mkdirSync, realpathSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { corsHeaders, jsonResponse, safeSegment } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';
import { readLabels, setLabel } from '../history-labels.js';

const MAX_CONTENT_SIZE = 50_000_000;

// Versão mais recente do histórico (nomes com timestamp ISO → ordem lexicográfica), ou null.
async function latestContentFile(dir) {
  const files = (await readdir(dir))
    .filter(f => f.startsWith('content_') && (f.endsWith('.html') || f.endsWith('.html.gz')))
    .sort();
  return files.length ? files[files.length - 1] : null;
}

// Mesmo conteúdo? O gzip leva a data no cabeçalho, por isso o mesmo texto comprimido em
// segundos diferentes dá strings diferentes: se ambos forem gzip compara-se o texto descomprimido.
function sameContent(stored, content) {
  if (stored === content) return true;
  try {
    const a = Buffer.from(stored, 'base64'), b = Buffer.from(content, 'base64');
    const gz = (x) => x[0] === 0x1f && x[1] === 0x8b;
    return gz(a) && gz(b) && Buffer.from(Bun.gunzipSync(a)).equals(Buffer.from(Bun.gunzipSync(b)));
  } catch { return false; }
}

export async function saveContent(req, isbn) {
  const { content } = await req.json();
  if (typeof content !== 'string') return Response.json({ error: 'Invalid content' }, { status: 400, headers: corsHeaders });
  if (content.length > MAX_CONTENT_SIZE) return Response.json({ error: 'Content too large' }, { status: 413, headers: corsHeaders });
  const historyDir = join(DATA_DIR, isbn, 'history');
  if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });

  let isCompressed = false;
  if (content.length > 10 && !content.startsWith('UNCOMPRESSED:')) {
    try {
      const buffer = Buffer.from(content.slice(0, 12), 'base64');
      isCompressed = buffer[0] === 0x1f && buffer[1] === 0x8b;
    } catch (err) {
      debugLog('⚠️ [Compression] Detecção falhou:', err.message);
    }
  }

  // Igual à última versão → não escreve outra (cada save guarda o livro inteiro: ~600 KB).
  const latest = await latestContentFile(historyDir);
  if (latest && sameContent(await Bun.file(join(historyDir, latest)).text(), content)) {
    return Response.json({ message: 'Unchanged', filename: latest }, { headers: corsHeaders });
  }

  const extension = isCompressed ? '.html.gz' : '.html';
  const filename = `content_${new Date().toISOString().replace(/[:.]/g, '-')}${extension}`;
  await Bun.write(join(historyDir, filename), content);
  debugLog(`💾 [Save] ${filename} - ${(content.length / 1024).toFixed(2)}KB ${isCompressed ? '(comprimido ✓)' : ''}`);

  return Response.json({ message: 'Saved', filename }, { headers: corsHeaders });
}

export async function getContent(req, isbn, url) {
  const filename = url.searchParams.get('filename');
  const dir = join(DATA_DIR, isbn, 'history');
  if (!existsSync(dir)) return Response.json({ message: 'No content' }, { status: 404, headers: corsHeaders });

  let target = filename;
  if (target) {
    if (!safeSegment(target)) {
      return Response.json({ error: 'Invalid filename' }, { status: 400, headers: corsHeaders });
    }
    let resolvedFile;
    try { resolvedFile = realpathSync(join(dir, target)); } catch {
      return Response.json({ error: 'File not found' }, { status: 404, headers: corsHeaders });
    }
    if (!resolvedFile.startsWith(realpathSync(dir) + '/')) {
      return Response.json({ error: 'Invalid filename' }, { status: 400, headers: corsHeaders });
    }
  }
  if (!target) {
    target = await latestContentFile(dir);
    if (!target) return Response.json({ message: 'No content' }, { status: 404, headers: corsHeaders });
  }

  const file = Bun.file(join(dir, target));
  return jsonResponse({ content: await file.text(), filename: target }, req, corsHeaders);
}

export async function getHistory(req, isbn) {
  const dir = join(DATA_DIR, isbn, 'history');
  if (!existsSync(dir)) return Response.json({ history: [] }, { headers: corsHeaders });
  const labels = readLabels(isbn);
  const files = (await readdir(dir))
    .filter(f => f.endsWith('.html') || f.endsWith('.html.gz'))
    .map(f => ({
      filename: f,
      timestamp: f.replace('content_', '').replace('.html.gz', '').replace('.html', ''),
      ...(labels[f] ? { label: labels[f] } : {}),
    }))
    .sort((a, b) => b.filename.localeCompare(a.filename));
  return jsonResponse({ history: files }, req, corsHeaders);
}

// PUT /api/ebooks/:isbn/history/:filename  { label }  — marca (ou, com label vazio, desmarca) uma versão.
export async function setHistoryLabel(req, isbn, filename) {
  if (!safeSegment(filename) || !filename.startsWith('content_') || !existsSync(join(DATA_DIR, isbn, 'history', filename)))
    return Response.json({ error: 'File not found' }, { status: 404, headers: corsHeaders });
  const { label } = await req.json();
  return Response.json({ label: setLabel(isbn, filename, label) }, { headers: corsHeaders });
}

// ---- Versões do CSS ----
// O histórico do livro guarda o HTML; os estilos (style.css) não tinham. Antes de a IA alterar o CSS, o cliente guarda aqui o
// CSS anterior (`style_<data>.css`, sempre uma versão nova e com etiqueta própria, por isso protegida da limpeza automática)
// para se poder repor. Fica na mesma pasta `history/` e acompanha o rename do ISBN.
const MAX_STYLE_SIZE = 5_000_000;

// POST /api/ebooks/:isbn/history-style  { css, label } → { filename }
export async function saveStyleSnapshot(req, isbn) {
  const { css, label } = await req.json();
  if (typeof css !== 'string') return Response.json({ error: 'Invalid css' }, { status: 400, headers: corsHeaders });
  if (css.length > MAX_STYLE_SIZE) return Response.json({ error: 'CSS too large' }, { status: 413, headers: corsHeaders });
  const historyDir = join(DATA_DIR, isbn, 'history');
  if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });
  const filename = `style_${new Date().toISOString().replace(/[:.]/g, '-')}.css`;
  await Bun.write(join(historyDir, filename), css);
  if (typeof label === 'string' && label.trim()) setLabel(isbn, filename, label);
  return Response.json({ filename }, { headers: corsHeaders });
}

// GET /api/ebooks/:isbn/history-style/:filename → { css }
export async function getStyleSnapshot(isbn, filename) {
  if (!safeSegment(filename) || !/^style_[\w-]+\.css$/.test(filename))
    return Response.json({ error: 'Invalid filename' }, { status: 400, headers: corsHeaders });
  const file = Bun.file(join(DATA_DIR, isbn, 'history', filename));
  if (!(await file.exists())) return Response.json({ error: 'File not found' }, { status: 404, headers: corsHeaders });
  return Response.json({ css: await file.text() }, { headers: corsHeaders });
}
