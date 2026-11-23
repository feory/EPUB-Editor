// O relatório de falhas do assistente como página HTML com endereço próprio (/api/ebooks/:isbn/report/:file). O editor gera o HTML
// e grava-o aqui; só fica o último. O GET é público (um separador novo não leva token): o nome tem 128 bits aleatórios, por isso só
// abre quem recebeu a ligação. A CSP tira scripts e ligações à página, que é só texto e estilos.
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { corsHeaders } from '../response.js';
import { DATA_DIR } from '../config.js';

const MAX_SIZE = 2_000_000;
const FILE = /^report_[0-9a-f]{32}\.html$/;

export async function saveReport(req, isbn) {
  const html = await req.text();
  if (!html.trim()) return Response.json({ error: 'Relatório vazio' }, { status: 400, headers: corsHeaders });
  if (html.length > MAX_SIZE) return Response.json({ error: 'Relatório demasiado grande' }, { status: 413, headers: corsHeaders });
  const dir = join(DATA_DIR, isbn);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (FILE.test(f)) unlinkSync(join(dir, f));
  const file = `report_${randomBytes(16).toString('hex')}.html`;
  await Bun.write(join(dir, file), html);
  return Response.json({ url: `/api/ebooks/${isbn}/report/${file}` }, { headers: corsHeaders });
}

export async function getReport(isbn, file) {
  const path = join(DATA_DIR, isbn, file);
  if (!FILE.test(file) || !existsSync(path)) return Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
  return new Response(Bun.file(path), {
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'", 'Cache-Control': 'no-store' },
  });
}
