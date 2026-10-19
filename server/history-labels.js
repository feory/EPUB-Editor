// Versões do histórico marcadas pelo utilizador ("Antes da revisão"): history/labels.json
// { "<ficheiro>": "<nome>" }. Fica dentro de history/ (acompanha o rename do ISBN) e fora dos filtros
// `content_*` do histórico e da limpeza. Versão marcada = protegida da limpeza automática.
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './config.js';

const MAX_LABEL = 80;
const fileOf = (isbn) => join(DATA_DIR, isbn, 'history', 'labels.json');

export function readLabels(isbn) {
  try { return JSON.parse(readFileSync(fileOf(isbn), 'utf8')); } catch { return {}; }
}

/** `label` vazio remove a marca. Devolve o nome guardado ('' se removido). */
export function setLabel(isbn, filename, label) {
  const labels = readLabels(isbn);
  const clean = String(label ?? '').trim().slice(0, MAX_LABEL);
  if (clean) labels[filename] = clean; else delete labels[filename];
  const tmp = `${fileOf(isbn)}.tmp`; // atómico: nunca um labels.json a meio
  writeFileSync(tmp, JSON.stringify(labels));
  renameSync(tmp, fileOf(isbn));
  return clean;
}
