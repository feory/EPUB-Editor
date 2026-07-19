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

export async function handleGetFile(filePath, headers) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not Found", { status: 404, headers });
  return new Response(file, { headers });
}

export function safeSegment(seg) {
  return typeof seg === 'string' && /^[a-zA-Z0-9_\-.]{1,200}$/.test(seg) && !seg.includes('..');
}
