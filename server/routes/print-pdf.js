import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { corsHeaders, handleGetFile } from '../response.js';
import { DATA_DIR } from '../config.js';

export async function getPrintPdf(isbn) {
  const path = join(DATA_DIR, isbn, 'print.pdf');
  return handleGetFile(path, corsHeaders);
}

export async function savePrintPdf(req, isbn) {
  const dir = join(DATA_DIR, isbn);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const blob = await req.blob(); // o limite (150 MB) é o da rota, verificado antes de ler (ebook-routes.js)
  await Bun.write(join(dir, 'print.pdf'), blob);
  return Response.json({ message: 'PDF saved' }, { headers: corsHeaders });
}
