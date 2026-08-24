// Mirror para o B2 (rclone sync) + agendamento — módulo à parte de routes/maintenance.js
// (que fica só com handlers HTTP finos) para setBackupSchedule poder chamar rescheduleBackup()
// sem import circular (maintenance.js → backup.js, nunca o inverso).
import { stmt } from './database.js';
import { DATA_DIR } from './config.js';
import { b2Configured, b2RcloneRemote } from './b2-client.js';
import { nextRun } from './cron-schedule.js';

const DEFAULT_SCHEDULE = '0 3 * * *'; // 03:00 diariamente — usado sem valor guardado, ou valor inválido

// Mirror de data/ inteira (todos os livros: ativos, Reciclagem, histórico, relatórios ACE)
// para "<bucket>/data" no B2, via `rclone sync` — só transfere o que mudou desde a última
// corrida (ao contrário de um tar.gz novo de cada vez). `sync` apaga no B2 o que já não existe
// localmente (livro purgado, history/ rodado) para ficar espelho fiel; isto é seguro aqui
// porque o bucket não tem lifecycle rule nenhuma (verificado via b2_list_buckets) — o B2
// mantém TODAS as versões antigas por omissão, portanto um "delete" do sync não perde nada,
// só deixa de ser a versão corrente (recuperável por b2_list_file_versions se precisar).
// Partilhado pelo botão manual (runBackup, exige admin) e pelo agendamento (source='cron').
export async function performBackup(source = 'manual') {
  if (!b2Configured()) throw new Error('B2 não configurado (B2_KEY_ID/B2_APPLICATION_KEY/B2_BUCKET_NAME em falta no .env).');
  const runId = stmt.startBackupRun.run(source).lastInsertRowid;
  try {
    const proc = Bun.spawn(
      ['rclone', 'sync', DATA_DIR, b2RcloneRemote('data'), '--fast-list', '-v', '--stats-one-line'],
      { stdout: 'ignore', stderr: 'pipe' }, // stdout nunca é lido — 'pipe' sem dreno enche o buffer do SO e trava o processo se o rclone alguma vez escrever lá
    );
    const [exitCode, stderr] = await Promise.all([proc.exited, Bun.readableStreamToText(proc.stderr)]);
    if (exitCode !== 0) throw new Error(`rclone sync falhou (${exitCode}): ${stderr}`);
    // --stats-one-line escreve 1 linha de resumo (Transferred/Checks/Deleted/...) em cada tick +
    // no fim — a última linha não-vazia do stderr é sempre essa.
    const summary = stderr.trim().split('\n').filter(Boolean).pop() ?? 'sem resumo';
    stmt.finishBackupRun.run('success', summary, runId);
    return { summary };
  } catch (err) {
    stmt.finishBackupRun.run('error', err.message, runId);
    throw err;
  }
}

// Corre performBackup e regista sucesso/erro nos logs do servidor — partilhado pelo botão
// manual (runBackup, maintenance.js) e pelo disparo do cron abaixo, mesma mensagem nos dois.
export async function runAndLog(source) {
  try {
    const r = await performBackup(source);
    console.log(`💾 [Mirror B2] ${r.summary}`);
  } catch (err) {
    console.error('💾 [Mirror B2] falhou:', err.message);
  }
}

let timer = null;

// Agenda a PRÓXIMA corrida (setTimeout, não setInterval) e relê o horário guardado de cada
// vez — assim uma alteração feita a meio do intervalo (setBackupSchedule → rescheduleBackup)
// é sempre aplicada na hora, nunca só na volta seguinte.
function schedule() {
  if (timer) clearTimeout(timer);
  if (!b2Configured()) { timer = setTimeout(schedule, 24 * 3600 * 1000); return; } // sem B2, só confere 1x/dia se ficou configurado entretanto
  const row = stmt.getSetting.get('backup_schedule');
  const expr = row?.value?.trim() || DEFAULT_SCHEDULE;
  let when;
  try {
    when = nextRun(expr);
  } catch (err) {
    console.error(`💾 [Mirror B2] agendamento "${expr}" inválido (${err.message}), a usar default "${DEFAULT_SCHEDULE}"`);
    when = nextRun(DEFAULT_SCHEDULE);
  }
  console.log(`💾 [Mirror B2] próxima sincronização agendada: ${when.toLocaleString('pt-PT')}`);
  const delay = Math.max(1000, when.getTime() - Date.now());
  timer = setTimeout(async () => {
    await runAndLog('cron');
    schedule(); // reagenda a seguir
  }, delay);
}

export function startBackupScheduler() { schedule(); }
export function rescheduleBackup() { schedule(); } // chamado por setBackupSchedule (maintenance.js) depois de guardar
export function stopBackupScheduler() { if (timer) clearTimeout(timer); }
