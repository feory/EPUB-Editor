// Decisões do livro da Importação InDesign: data/indesign-maps/<isbn>.json ({ classes: { "p.X": { target, … } } }).
// Fora de data/<isbn>/ de propósito: sobrevivem a apagar e reimportar o ebook, e lêem-se antes de ele existir.
// Globais (não por utilizador): o livro é o mesmo para todos. A CLI do skill epub-indesign lê/escreve os mesmos ficheiros.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from '../config.js';
import { corsHeaders } from '../response.js';

const MAX_BYTES = 200_000;

export function getDecisions(isbn, dir = join(DATA_DIR, 'indesign-maps')) {
  const file = join(dir, `${isbn}.json`);
  let classes = {};
  try { if (existsSync(file)) classes = JSON.parse(readFileSync(file, 'utf8')).classes ?? {}; } catch { /* ficheiro estragado → sem decisões */ }
  return Response.json({ classes }, { headers: corsHeaders });
}

export async function saveDecisions(req, isbn, dir = join(DATA_DIR, 'indesign-maps')) {
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: 'Too large' }, { status: 400, headers: corsHeaders });
  let classes;
  try { classes = JSON.parse(text).classes; } catch { /* inválido abaixo */ }
  const valid = classes && typeof classes === 'object' && !Array.isArray(classes)
    && Object.values(classes).every(e => e && typeof e.target === 'string');
  if (!valid) return Response.json({ error: 'Invalid map' }, { status: 400, headers: corsHeaders });

  const file = join(dir, `${isbn}.json`);
  if (!Object.keys(classes).length) {
    rmSync(file, { force: true }); // sem decisões → o livro volta a seguir só a casa/heurística
  } else {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify({ classes }, null, 2) + '\n'); // atómico (.tmp + rename)
    renameSync(file + '.tmp', file);
  }
  return Response.json({ message: 'Decisions saved' }, { headers: corsHeaders });
}
