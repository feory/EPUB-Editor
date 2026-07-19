import { existsSync, mkdirSync } from 'fs';
import { readdir, unlink, stat } from 'fs/promises';
import { requireAdmin } from '../middleware/auth.js';
import { join } from 'path';
import { corsHeaders } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';

export async function cleanupHistory(user) {
  const adminErr = requireAdmin(user);
  if (adminErr) return adminErr;
  const limit = Date.now() - 7 * 24 * 3600 * 1000;
  let count = 0;
  let totalBytes = 0;
  const isbns = await readdir(DATA_DIR);
  for (const isbn of isbns) {
    const dir = join(DATA_DIR, isbn, 'history');
    if (!existsSync(dir)) continue;
    const files = await readdir(dir);
    // Recolher stats e identificar o conteúdo mais recente (preservar sempre)
    let newestPath = null, newestMtime = -1;
    const entries = [];
    for (const f of files) {
      const p = join(dir, f);
      const st = await stat(p);
      entries.push({ p, st });
      if (f.startsWith('content_') && st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newestPath = p; }
    }
    for (const { p, st } of entries) {
      if (p === newestPath) continue; // manter sempre o ficheiro mais recente
      if (st.mtimeMs < limit) { totalBytes += st.size; await unlink(p); count++; }
    }
  }
  const sizeSavedMB = (totalBytes / 1024 / 1024).toFixed(2);
  return Response.json({ message: 'Cleanup done', deletedCount: count, sizeSavedMB }, { headers: corsHeaders });
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
