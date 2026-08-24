import { existsSync, mkdirSync } from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { requireAdmin } from '../middleware/auth.js';
import { join } from 'path';
import { corsHeaders } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';
import { stmt } from '../database.js';
import { b2Configured, b2RcloneRemote } from '../b2-client.js';

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

export async function cleanupHistory(user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  const limit = Date.now() - 7 * 24 * 3600 * 1000;
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
  const sizeSavedMB = (totalBytes / 1024 / 1024).toFixed(2);
  return Response.json({ message: 'Cleanup done', deletedCount: count, sizeSavedMB }, { headers: corsHeaders });
}

// Soma recursiva de bytes de uma pasta (não existia utilitário nenhum no código — mesmo
// idioma do purgeOldExceptNewest acima: guarda existsSync, readdir, stat por entrada).
async function dirSizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(entry => {
    const p = join(dir, entry.name);
    return entry.isDirectory() ? dirSizeBytes(p) : stat(p).then(st => st.size);
  }));
  return sizes.reduce((a, b) => a + b, 0);
}

// Divisão por categoria de um livro: Epub (versões exportadas), history (saves), images,
// thumbnails, ace-reports (validação de acessibilidade — nunca purgado por nada), e misc
// (print.pdf + cover.jpg + style.css, ficheiros soltos na raiz da pasta do isbn).
async function isbnUsage(isbn) {
  const dir = join(DATA_DIR, isbn);
  const [epub, history, images, thumbnails, aceReports] = await Promise.all([
    dirSizeBytes(join(dir, 'Epub')),
    dirSizeBytes(join(dir, 'history')),
    dirSizeBytes(join(dir, 'images')),
    dirSizeBytes(join(dir, 'thumbnails')),
    dirSizeBytes(join(dir, 'ace-reports')),
  ]);
  let misc = 0;
  for (const f of ['print.pdf', 'cover.jpg', 'style.css']) {
    const p = join(dir, f);
    if (existsSync(p)) misc += (await stat(p)).size;
  }
  return { epub, history, images, thumbnails, aceReports, misc, total: epub + history + images + thumbnails + aceReports + misc };
}

export async function diskUsage(user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;

  const byIsbn = new Map([...stmt.listEbooks.all(), ...stmt.listTrash.all()].map(e => [e.ebook_isbn, e]));
  const diskIsbns = existsSync(DATA_DIR) ? await readdir(DATA_DIR) : [];

  // Pastas independentes entre si — varridas em paralelo (cada isbnUsage já paraleliza as
  // suas próprias categorias por dentro).
  const results = (await Promise.all(diskIsbns.map(async (isbn) => {
    const dirStat = await stat(join(DATA_DIR, isbn));
    if (!dirStat.isDirectory()) return null;
    const ebook = byIsbn.get(isbn);
    return {
      isbn, title: ebook?.title ?? null, author: ebook?.author ?? null,
      // pasta em disco sem registo na BD (nem ativo, nem reciclagem) — só reporta, não apaga.
      status: ebook?.deleted_at ? 'trashed' : ebook ? 'active' : 'orphaned',
      deletedAt: ebook?.deleted_at ?? null,
      ...(await isbnUsage(isbn)),
    };
  }))).filter(Boolean);

  const bucket = (status) => results.filter(r => r.status === status).sort((a, b) => b.total - a.total);
  const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
  const toBucketJson = (list) => ({
    count: list.length, totalBytes: sum(list, 'total'),
    categoryTotals: {
      epub: sum(list, 'epub'), history: sum(list, 'history'), images: sum(list, 'images'),
      thumbnails: sum(list, 'thumbnails'), aceReports: sum(list, 'aceReports'), misc: sum(list, 'misc'),
    },
    books: list,
  });

  const active = bucket('active'), trash = bucket('trashed'), orphaned = bucket('orphaned');
  return Response.json({
    generatedAt: new Date().toISOString(),
    active: toBucketJson(active),
    trash: toBucketJson(trash),
    orphaned: { count: orphaned.length, totalBytes: sum(orphaned, 'total'), books: orphaned },
    grandTotalBytes: sum(results, 'total'),
  }, { headers: corsHeaders });
}

export async function migrateEpubs(user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  let migratedCount = 0;
  const errors = [];
  try {
    for (const isbn of await readdir(DATA_DIR)) {
      const ebookDir = join(DATA_DIR, isbn);
      if (!(await stat(ebookDir)).isDirectory()) continue;
      const allFiles = await readdir(ebookDir);
      const files = [];
      for (const f of allFiles) {
        if (f.endsWith('.epub') && (await stat(join(ebookDir, f))).isFile()) files.push(f);
      }
      if (files.length === 0) continue;
      const epubDir = join(ebookDir, 'Epub');
      if (!existsSync(epubDir)) mkdirSync(epubDir, { recursive: true });
      for (const file of files) {
        try {
          const oldPath = join(ebookDir, file);
          const newPath = join(epubDir, file);
          await Bun.write(newPath, Bun.file(oldPath));
          await unlink(oldPath);
          migratedCount++;
          debugLog(`Migrated: ${isbn}/${file}`);
        } catch (err) {
          errors.push(`${isbn}/${file}: ${err.message}`);
        }
      }
    }
    return Response.json({
      success: true, message: 'Migration completed', migratedCount,
      ...(errors.length ? { errors } : {}),
    }, { headers: corsHeaders });
  } catch (err) {
    return Response.json({ success: false, error: err.message, migratedCount, errors }, { status: 500, headers: corsHeaders });
  }
}

// Mirror de data/ inteira (todos os livros: ativos, Reciclagem, histórico, relatórios ACE)
// para "<bucket>/data" no B2, via `rclone sync` — só transfere o que mudou desde a última
// corrida (ao contrário de um tar.gz novo de cada vez). `sync` apaga no B2 o que já não existe
// localmente (livro purgado, history/ rodado) para ficar espelho fiel; isto é seguro aqui
// porque o bucket não tem lifecycle rule nenhuma (verificado via b2_list_buckets) — o B2
// mantém TODAS as versões antigas por omissão, portanto um "delete" do sync não perde nada,
// só deixa de ser a versão corrente (recuperável por b2_list_file_versions se precisar).
// Partilhado pelo botão manual (runBackup, exige admin) e pelo cron diário (server/index.js
// chama isto direto, sem `user` — é o próprio servidor a correr).
export async function performBackup() {
  if (!b2Configured()) throw new Error('B2 não configurado (B2_KEY_ID/B2_APPLICATION_KEY/B2_BUCKET_NAME em falta no .env).');
  const proc = Bun.spawn(
    ['rclone', 'sync', DATA_DIR, b2RcloneRemote('data'), '--fast-list', '-v', '--stats-one-line'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stderr] = await Promise.all([proc.exited, Bun.readableStreamToText(proc.stderr)]);
  if (exitCode !== 0) throw new Error(`rclone sync falhou (${exitCode}): ${stderr}`);
  // --stats-one-line escreve 1 linha de resumo (Transferred/Checks/Deleted/...) em cada tick +
  // no fim — a última linha não-vazia do stderr é sempre essa.
  const summary = stderr.trim().split('\n').filter(Boolean).pop() ?? 'sem resumo';
  return { summary };
}

// Dispara e não espera: uma sincronização pode levar minutos (testado: ~5min só para 86MB,
// muitos ficheiros pequenos — overhead da API do B2 por ficheiro, não largura de banda), bem
// acima do idleTimeout máximo que o Bun aceita (255s) para aguentar synchronamente numa
// request HTTP. O resultado fica só nos logs do servidor (mesmo padrão do cron diário,
// server/index.js) — sem isto, o botão do Painel rebentava em timeout na 1ª sincronização.
export async function runBackup(user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  if (!b2Configured()) {
    return Response.json({ error: 'B2 não configurado (B2_KEY_ID/B2_APPLICATION_KEY/B2_BUCKET_NAME em falta no .env).' }, { status: 400, headers: corsHeaders });
  }
  performBackup()
    .then(r => console.log(`💾 [Mirror B2] ${r.summary}`))
    .catch(err => console.error(`💾 [Mirror B2] falhou:`, err.message));
  return Response.json({ message: 'Mirror iniciado em background — confere os logs do servidor quando terminar.' }, { headers: corsHeaders });
}

export async function healthCheck() {
  let epubcheckStatus = "not installed";
  try {
    const proc = Bun.spawn(["epubcheck", "--version"], { stdout: "pipe", stderr: "pipe" });
    const version = await Bun.readableStreamToText(proc.stdout);
    await proc.exited;
    if (proc.exitCode === 0) epubcheckStatus = version.trim();
  } catch {}
  return Response.json({
    status: "ok",
    runtime: "Bun " + Bun.version,
    memory: process.memoryUsage(),
    deps: { epubcheck: epubcheckStatus },
  }, { headers: corsHeaders });
}

export async function languageTool(req) {
  const ltBase = (process.env.LANGUAGETOOL_URL || "https://api.languagetool.org").replace(/\/$/, "");
  const body = await req.text();
  const ltResp = await fetch(`${ltBase}/v2/check`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await ltResp.text();
  return new Response(data, {
    status: ltResp.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
