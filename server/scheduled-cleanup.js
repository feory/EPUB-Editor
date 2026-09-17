// Limpeza automática de histórico + purga da Reciclagem, com horário configurável (separador
// Sistema do Painel) — módulo à parte de routes/maintenance.js (mesma razão do backup.js: os
// handlers HTTP de lá chamam reschedule() daqui depois de guardar, sem import circular).
import { existsSync } from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { stmt, purgeOldTrash } from './database.js';
import { DATA_DIR } from './config.js';
import { nextRun } from './cron-schedule.js';

const CLEANUP_RETENTION_DEFAULT = 7;
const TRASH_RETENTION_DEFAULT = 30;
export const CLEANUP_SCHEDULE_DEFAULT = '0 2 * * *';
export const TRASH_SCHEDULE_DEFAULT = '30 2 * * *'; // desfasado da limpeza de histórico (mesmo tick evitado, sem necessidade real de correr em simultâneo)

function scheduleString(key, fallback) {
  const row = stmt.getSetting.get(key);
  return row?.value?.trim() || fallback;
}
export function cleanupSchedule() { return scheduleString('cleanup_schedule', CLEANUP_SCHEDULE_DEFAULT); }
export function trashSchedule() { return scheduleString('trash_schedule', TRASH_SCHEDULE_DEFAULT); }

function settingNumber(key, fallback) {
  const row = stmt.getSetting.get(key);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function cleanupRetentionDays() { return settingNumber('cleanup_retention_days', CLEANUP_RETENTION_DEFAULT); }
export function trashRetentionDays() { return settingNumber('trash_retention_days', TRASH_RETENTION_DEFAULT); }

// Apaga, dentro de `dir`, os ficheiros que passam `filter` e têm mais de `limit` (mtime) —
// preservando SEMPRE o mais recente. Devolve { count, bytes } apagados.
async function purgeOldExceptNewest(dir, filter, limit) {
  if (!existsSync(dir)) return { count: 0, bytes: 0 };
  const files = (await readdir(dir)).filter(filter);
  let newestPath = null, newestMtime = -1;
  const entries = [];
  for (const f of files) {
    const p = join(dir, f);
    const st = await stat(p);
    entries.push({ p, st });
    if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newestPath = p; }
  }
  let count = 0, bytes = 0;
  for (const { p, st } of entries) {
    if (p === newestPath) continue; // manter sempre o mais recente
    if (st.mtimeMs < limit) { bytes += st.size; await unlink(p); count++; }
  }
  return { count, bytes };
}

// Núcleo puro (sem Response/auth) — partilhado pelo botão manual (cleanupHistory, em
// routes/maintenance.js) e pelo disparo agendado (performHistoryCleanup abaixo).
export async function runHistoryCleanup(retentionDays) {
  const limit = Date.now() - retentionDays * 24 * 3600 * 1000;
  let count = 0;
  let totalBytes = 0;
  const isbns = await readdir(DATA_DIR);
  for (const isbn of isbns) {
    const history = await purgeOldExceptNewest(
      join(DATA_DIR, isbn, 'history'), f => f.startsWith('content_'), limit);
    count += history.count; totalBytes += history.bytes;
    // Versões antigas do EPUB exportado (Epub/ebook_<timestamp>.epub) — nunca o `<isbn>.epub`
    // (ponteiro para a versão atual, sem prefixo ebook_, fica sempre fora deste filtro).
    const epubs = await purgeOldExceptNewest(
      join(DATA_DIR, isbn, 'Epub'), f => f.startsWith('ebook_') && f.endsWith('.epub'), limit);
    count += epubs.count; totalBytes += epubs.bytes;
  }
  return { count, sizeSavedMB: (totalBytes / 1024 / 1024).toFixed(2) };
}

async function performHistoryCleanup() {
  try {
    const { count, sizeSavedMB } = await runHistoryCleanup(cleanupRetentionDays());
    stmt.setSetting.run('cleanup_last_run', JSON.stringify({ at: new Date().toISOString(), status: 'success', deletedCount: count, sizeSavedMB }));
    if (count > 0) console.log(`🧹 [Limpeza automática] ${count} ficheiros removidos (${sizeSavedMB} MB)`);
  } catch (err) {
    stmt.setSetting.run('cleanup_last_run', JSON.stringify({ at: new Date().toISOString(), status: 'error', error: err.message }));
    console.error('🧹 [Limpeza automática] falhou:', err.message);
  }
}

async function performTrashPurge() {
  try {
    const count = purgeOldTrash(trashRetentionDays());
    stmt.setSetting.run('trash_purge_last_run', JSON.stringify({ at: new Date().toISOString(), status: 'success', deletedCount: count }));
  } catch (err) {
    stmt.setSetting.run('trash_purge_last_run', JSON.stringify({ at: new Date().toISOString(), status: 'error', error: err.message }));
    console.error('🗑️ [Purga Reciclagem] falhou:', err.message);
  }
}

// Fábrica de agendador cron (setTimeout, relê o horário guardado a cada disparo — uma
// alteração a meio do intervalo é sempre aplicada na hora, nunca só na volta seguinte).
// Mesma forma do scheduler do backup (server/backup.js), generalizada: usada aqui por
// history-cleanup e trash-purge, cada um com a sua settings key + default + tarefa.
function createScheduler(settingsKey, defaultCron, label, taskFn) {
  let timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    const row = stmt.getSetting.get(settingsKey);
    const expr = row?.value?.trim() || defaultCron;
    let when;
    try {
      when = nextRun(expr);
    } catch (err) {
      console.error(`${label} agendamento "${expr}" inválido (${err.message}), a usar default "${defaultCron}"`);
      when = nextRun(defaultCron);
    }
    console.log(`${label} próxima corrida agendada: ${when.toLocaleString('pt-PT')}`);
    const delay = Math.max(1000, when.getTime() - Date.now());
    timer = setTimeout(async () => {
      await taskFn();
      schedule(); // reagenda a seguir
    }, delay);
  }
  return { start: schedule, reschedule: schedule, stop: () => { if (timer) clearTimeout(timer); } };
}

const cleanupScheduler = createScheduler('cleanup_schedule', CLEANUP_SCHEDULE_DEFAULT, '🧹 [Limpeza automática]', performHistoryCleanup);
const trashScheduler = createScheduler('trash_schedule', TRASH_SCHEDULE_DEFAULT, '🗑️ [Purga Reciclagem]', performTrashPurge);

export function startScheduledCleanup() { cleanupScheduler.start(); trashScheduler.start(); }
export function rescheduleCleanup() { cleanupScheduler.reschedule(); }
export function rescheduleTrashPurge() { trashScheduler.reschedule(); }
export function stopScheduledCleanup() { cleanupScheduler.stop(); trashScheduler.stop(); }
