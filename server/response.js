import { ALLOWED_ORIGIN } from './config.js';

export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Id",
  "Access-Control-Allow-Credentials": "true",
  "Vary": "Origin",
};

const GZIP_THRESHOLD = 4096;

export function jsonResponse(data, req, baseHeaders, status = 200) {
  const json = JSON.stringify(data);
  const acceptsGzip = req.headers.get('Accept-Encoding')?.includes('gzip');
  if (acceptsGzip && json.length > GZIP_THRESHOLD) {
    const compressed = Bun.gzipSync(json);
    return new Response(compressed, {
      status,
      headers: { ...baseHeaders, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    });
  }
  return Response.json(data, { status, headers: baseHeaders });
}

// Com `req`, o ficheiro leva validadores (ETag + Last-Modified) e `no-cache`: o browser guarda a cópia
// mas pergunta sempre se mudou e recebe 304 sem corpo. Serve ficheiros mutáveis (as imagens são
// substituídas pelo mesmo nome ao recortar/trocar) — um max-age serviria a versão antiga.
export async function handleGetFile(filePath, headers, req) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404, headers });
  if (!req) return new Response(file, { headers });
  const etag = `W/"${file.size.toString(36)}-${Math.floor(file.lastModified).toString(36)}"`;
  const validators = { ...headers, ETag: etag, 'Last-Modified': new Date(file.lastModified).toUTCString(), 'Cache-Control': 'private, no-cache' };
  const inm = req.headers.get('If-None-Match');
  const ims = Date.parse(req.headers.get('If-Modified-Since') ?? '');
  const fresh = inm ? inm.split(',').some(t => t.trim() === etag || t.trim() === '*') : ims >= Math.floor(file.lastModified / 1000) * 1000;
  return fresh ? new Response(null, { status: 304, headers: validators }) : new Response(file, { headers: validators });
}

export function getClientIp(req) {
  return req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? null;
}

export function safeSegment(seg) {
  return typeof seg === 'string' && /^[a-zA-Z0-9_\-.]{1,200}$/.test(seg) && !seg.includes('..');
}
