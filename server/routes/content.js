import { existsSync, mkdirSync, realpathSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { corsHeaders, jsonResponse, safeSegment } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';

const MAX_CONTENT_SIZE = 50_000_000;

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
    const files = (await readdir(dir))
      .filter(f => f.startsWith('content_') && (f.endsWith('.html') || f.endsWith('.html.gz')))
      .sort()
      .reverse();
    if (files.length === 0) return Response.json({ message: 'No content' }, { status: 404, headers: corsHeaders });
    target = files[0];
  }

  const file = Bun.file(join(dir, target));
  return jsonResponse({ content: await file.text(), filename: target }, req, corsHeaders);
}

export async function getHistory(req, isbn) {
  const dir = join(DATA_DIR, isbn, 'history');
  if (!existsSync(dir)) return Response.json({ history: [] }, { headers: corsHeaders });
  const files = (await readdir(dir))
    .filter(f => f.endsWith('.html') || f.endsWith('.html.gz'))
    .map(f => ({
      filename: f,
      timestamp: f.replace('content_', '').replace('.html.gz', '').replace('.html', ''),
    }))
    .sort((a, b) => b.filename.localeCompare(a.filename));
  return jsonResponse({ history: files }, req, corsHeaders);
}
