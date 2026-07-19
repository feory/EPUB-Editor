import { existsSync, mkdirSync, renameSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { corsHeaders, handleGetFile, safeSegment } from '../response.js';
import { DATA_DIR } from '../config.js';

const MAX_EPUB_SIZE = 30_000_000;
const MAX_COVER_SIZE = 3_000_000;

export async function saveEpub(req, isbn) {
  const formData = await req.formData();
  const epubFile = formData.get('epub');
  if (!epubFile) return Response.json({ error: "No EPUB file" }, { status: 400, headers: corsHeaders });
  if (epubFile.size > MAX_EPUB_SIZE) return Response.json({ error: "File too large" }, { status: 413, headers: corsHeaders });

  const epubDir = join(DATA_DIR, isbn, 'Epub');
  if (!existsSync(epubDir)) mkdirSync(epubDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const versionedPath = join(epubDir, `ebook_${timestamp}.epub`);
  const latestPath = join(epubDir, `${isbn}.epub`);
  const tmpPath = join(epubDir, `${isbn}.epub.tmp`);
  await Bun.write(versionedPath, epubFile);
  await Bun.write(tmpPath, epubFile);
  renameSync(tmpPath, latestPath);

  return Response.json({ message: 'EPUB saved', filename: `${isbn}.epub` }, { headers: corsHeaders });
}

export function getEpub(isbn) {
  return handleGetFile(join(DATA_DIR, isbn, 'Epub', `${isbn}.epub`), corsHeaders);
}

export async function getEpubHistory(isbn) {
  const epubDir = join(DATA_DIR, isbn, 'Epub');
  if (!existsSync(epubDir)) return Response.json({ epubs: [] }, { headers: corsHeaders });
  const names = (await readdir(epubDir)).filter(f => f.endsWith('.epub') && f.startsWith('ebook_'));
  const files = (await Promise.all(names.map(async f => ({
    filename: f,
    timestamp: f.replace('ebook_', '').replace('.epub', ''),
    size: (await stat(join(epubDir, f))).size,
  })))).sort((a, b) => b.filename.localeCompare(a.filename));
  return Response.json({ epubs: files }, { headers: corsHeaders });
}

export function getEpubFile(isbn, filename) {
  if (!safeSegment(filename)) return new Response("Not Found", { status: 404, headers: corsHeaders });
  const filePath = join(DATA_DIR, isbn, 'Epub', filename);
  if (!resolve(filePath).startsWith(resolve(join(DATA_DIR, isbn, 'Epub')) + '/')) {
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
  return handleGetFile(filePath, corsHeaders);
}

export async function getStyle(isbn) {
  try {
    const text = await Bun.file(join(DATA_DIR, isbn, 'style.css')).text();
    return new Response(text, { headers: { ...corsHeaders, 'Content-Type': 'text/css' } });
  } catch {
    return new Response(null, { status: 404, headers: corsHeaders });
  }
}

export async function saveStyle(req, isbn) {
  const { css } = await req.json();
  if (typeof css !== 'string') return new Response("Missing css", { status: 400, headers: corsHeaders });
  await Bun.write(join(DATA_DIR, isbn, 'style.css'), css);
  return Response.json({ ok: true }, { headers: corsHeaders });
}

export function getCover(isbn) {
  return handleGetFile(join(DATA_DIR, isbn, 'cover.jpg'), corsHeaders);
}

export async function saveCover(req, isbn) {
  const formData = await req.formData();
  const cover = formData.get('cover');
  if (!cover || !cover.type?.startsWith('image/')) {
    return Response.json({ error: 'Invalid cover file' }, { status: 400, headers: corsHeaders });
  }
  if (cover.size > MAX_COVER_SIZE) return Response.json({ error: 'File too large' }, { status: 413, headers: corsHeaders });
  await Bun.write(join(DATA_DIR, isbn, 'cover.jpg'), cover);
  return Response.json({ message: 'Cover saved' }, { headers: corsHeaders });
}
