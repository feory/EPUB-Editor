import { existsSync, mkdirSync } from 'fs';
import { PORT, DATA_DIR, TEMP_DIR, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { db, stmt, migrateGrammarToDb } from './database.js';
import { cleanupTempDir } from './temp-cleanup.js';
import { handleRequest } from './router.js';
import { purgeRateLimitStore } from './middleware/rateLimit.js';
import { startBackupScheduler, stopBackupScheduler } from './backup.js';
import { startScheduledCleanup, stopScheduledCleanup } from './scheduled-cleanup.js';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR);

cleanupTempDir();
const cleanupInterval = setInterval(() => {
  cleanupTempDir();
  stmt.purgeExpiredTokens.run();
  purgeRateLimitStore();
}, 30 * 60 * 1000);

migrateGrammarToDb();

// Mirror para o B2 (rclone sync) segundo o horário guardado (separador Backup do Painel,
// backup_schedule em settings — default "0 3 * * *" sem valor guardado) — ver server/backup.js.
startBackupScheduler();
// Limpeza automática de histórico + purga da Reciclagem, horário configurável (separador
// Sistema do Painel, defaults "0 4 * * *"/"30 4 * * *") — ver server/scheduled-cleanup.js.
startScheduledCleanup();

async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return null;
  const existing = stmt.getUserByEmail.get(ADMIN_EMAIL);
  if (existing) return existing.id;
  const hash = await Bun.password.hash(ADMIN_PASSWORD);
  const result = stmt.createUser.run(ADMIN_EMAIL, hash, 'admin');
  console.log(`Admin user created: ${ADMIN_EMAIL}`);
  return result.lastInsertRowid;
}

const adminId = await seedAdmin();
if (adminId) {
  db.run('UPDATE ebooks SET user_id = ? WHERE user_id IS NULL', [adminId]);
}

export const server = Bun.serve({
  port: PORT,
  // Default (128M) é curto para o upload em lote de imagens do import IDML — livros com
  // Links/ de alta resolução podem ultrapassar isso numa só request de /images/batch.
  maxRequestBodySize: 500 * 1024 * 1024,
  fetch: handleRequest,
});

console.log(`Server running at http://localhost:${server.port}`);

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  stopBackupScheduler();
  stopScheduledCleanup();
  console.log('→ Cleanup interval cleared');
  server.stop();
  console.log('→ Server stopped accepting connections');
  db.close();
  console.log('→ Database connection closed');
  cleanupTempDir();
  console.log('→ Temp directory cleaned');
  console.log('Goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
