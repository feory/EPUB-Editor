// Registo das alterações que a IA aplicou a um livro: data/<isbn>/ai-changes.json (acompanha o rename do ISBN). Cada entrada
// guarda o pedido, um resumo legível e os ficheiros do histórico com o estado ANTERIOR (HTML e/ou CSS), para se poder reverter.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './config.js';

const MAX_ENTRIES = 200;
const fileOf = (isbn) => join(DATA_DIR, isbn, 'ai-changes.json');

function read(isbn) {
  try { return JSON.parse(readFileSync(fileOf(isbn), 'utf8')); } catch { return []; }
}

function write(isbn, entries) {
  mkdirSync(join(DATA_DIR, isbn), { recursive: true });
  const tmp = `${fileOf(isbn)}.tmp`; // atómico: nunca um registo a meio
  writeFileSync(tmp, JSON.stringify(entries));
  renameSync(tmp, fileOf(isbn));
}

/** Mais recentes primeiro. */
export const listChanges = (isbn) => read(isbn).reverse();

export function addChange(isbn, { by, request, lines, htmlFile, cssFile }) {
  const entry = {
    id: crypto.randomUUID(), at: new Date().toISOString(), by, request, lines,
    ...(htmlFile ? { htmlFile } : {}), ...(cssFile ? { cssFile } : {}),
  };
  write(isbn, [...read(isbn), entry].slice(-MAX_ENTRIES));
  return entry;
}

/** Marca a entrada como revertida (por quem e quando). null se não existe. */
export function markReverted(isbn, id, by) {
  const entries = read(isbn);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.revertedAt = new Date().toISOString();
  entry.revertedBy = by;
  write(isbn, entries);
  return entry;
}

export const hasHistoryFile = (isbn, filename) => existsSync(join(DATA_DIR, isbn, 'history', filename));
