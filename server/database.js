import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { DATA_DIR, DB_PATH } from './config.js';

export const db = new Database(DB_PATH);

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");
db.run("PRAGMA cache_size = -128000");

console.log('Connected to the SQLite database (via Bun, WAL mode).');

db.run(`CREATE TABLE IF NOT EXISTS grammar_cache (
  isbn TEXT NOT NULL, hash TEXT NOT NULL, matches TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (isbn, hash)
)`);

db.run(`CREATE TABLE IF NOT EXISTS grammar_sessions (
  isbn TEXT PRIMARY KEY, matches TEXT NOT NULL DEFAULT '[]'
)`);

db.run(`CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`CREATE TABLE IF NOT EXISTS ebooks (
  ebook_isbn TEXT PRIMARY KEY, physical_isbn TEXT, title TEXT, author TEXT,
  description TEXT, publisher TEXT, language TEXT DEFAULT 'pt', subjects TEXT,
  pub_date TEXT, status TEXT DEFAULT 'in_progress', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// Nome e apelido (opcionais): onde a interface mostrava o email, mostra "Nome Apelido" (email se faltar).
const userColumns = db.query("PRAGMA table_info(users)").all();
for (const col of ['first_name', 'last_name']) {
  if (!userColumns.some(c => c.name === col)) db.run(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
}
// Expressão SQL do nome a mostrar para a tabela users com o alias `a`.
export const DISPLAY_NAME = (a) => `COALESCE(NULLIF(TRIM(COALESCE(${a}.first_name, '') || ' ' || COALESCE(${a}.last_name, '')), ''), ${a}.email)`;

const columns = db.query("PRAGMA table_info(ebooks)").all();
const requiredCols = ['status', 'description', 'publisher', 'language', 'subjects', 'pub_date', 'deleted_at', 'user_id'];
requiredCols.forEach(col => {
  if (!columns.some(c => c.name === col)) {
    const colType = col === 'deleted_at' ? 'DATETIME' : col === 'user_id' ? 'INTEGER' : 'TEXT';
    db.run(`ALTER TABLE ebooks ADD COLUMN ${col} ${colType}`);
  }
});

db.run("CREATE INDEX IF NOT EXISTS idx_ebooks_user_id ON ebooks(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_ebooks_deleted_at ON ebooks(deleted_at)");
db.run("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)");

db.run(`CREATE TABLE IF NOT EXISTS ebook_shares (
  ebook_isbn TEXT NOT NULL REFERENCES ebooks(ebook_isbn) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ebook_isbn, user_id)
)`);

db.run("CREATE INDEX IF NOT EXISTS idx_ebook_shares_user_id ON ebook_shares(user_id)");

// Registo do separador "Backup" do Painel (histórico de sincronizações com o B2, ver
// server/routes/maintenance.js). `source` distingue botão manual de cron diário.
db.run(`CREATE TABLE IF NOT EXISTS backup_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  status      TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','success','error')),
  source      TEXT NOT NULL CHECK(source IN ('manual','cron')),
  summary     TEXT
)`);

// Configurações simples do Painel, key-value — hoje só o horário do cron de backup (campo
// guardado, ainda por aplicar ao agendamento real, ver PainelPage.tsx/BackupTab).
db.run(`CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);

// Registo append-only de ações administráveis (login/logout, gestão de utilizadores, gestão
// de livros) — separador "Logs" do Painel. user_id sem FK enforcement (o projeto nunca liga
// PRAGMA foreign_keys) de propósito: a linha sobrevive se o utilizador for apagado depois.
// user_email é snapshot no momento do evento. Sem purga automática — decisão de reter tudo.
db.run(`CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id    INTEGER,
  user_email TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  meta       TEXT,
  ip         TEXT
)`);

db.run("CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at)");

// Comentários do editor, ancorados a um <span class="comment-anchor" data-comment-id="…">
// inserido no HTML (mesmo padrão do pagebreak) — anchor_id é esse uuid, não posição/offset.
// Removidos do HTML no export EPUB (ver html-cleaner.ts), nunca chegam ao ficheiro final.
db.run(`CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ebook_isbn TEXT NOT NULL REFERENCES ebooks(ebook_isbn) ON DELETE CASCADE,
  anchor_id  TEXT NOT NULL,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run("CREATE INDEX IF NOT EXISTS idx_comments_isbn ON comments(ebook_isbn)");

// Avisos do sino (partilha, resposta a comentário, comentário num ebook do próprio). Sem FK enforcement
// (como o resto): apagam-se à mão com o ebook (deleteNotificationsByIsbn) e acompanham o rename do ISBN.
db.run(`CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('share','comment_reply','comment')),
  ebook_isbn TEXT NOT NULL,
  actor_id   INTEGER NOT NULL,
  read_at    DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.run("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at)");

export const stmt = {
  // ebooks
  // owner_email: a lista mostra "partilhado por X" nos ebooks que não são do próprio utilizador.
  listEbooks:           db.prepare(`SELECT e.*, u.email AS owner_email, ${DISPLAY_NAME('u')} AS owner_name FROM ebooks e LEFT JOIN users u ON u.id = e.user_id WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC`),
  listEbooksByUser:     db.prepare(`
    SELECT e.*, u.email AS owner_email, ${DISPLAY_NAME('u')} AS owner_name FROM ebooks e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.deleted_at IS NULL AND (e.user_id = ? OR e.ebook_isbn IN
      (SELECT ebook_isbn FROM ebook_shares WHERE user_id = ?)) ORDER BY e.created_at DESC
  `),
  getEbook:             db.prepare('SELECT * FROM ebooks WHERE ebook_isbn = ?'),
  insertEbook:          db.prepare('INSERT INTO ebooks (ebook_isbn, physical_isbn, title, author, status, user_id) VALUES (?, ?, ?, ?, ?, ?)'),
  updateStatus:         db.prepare('UPDATE ebooks SET status = ? WHERE ebook_isbn = ?'),
  softDeleteEbook:      db.prepare("UPDATE ebooks SET deleted_at = datetime('now') WHERE ebook_isbn = ?"),
  restoreEbook:         db.prepare('UPDATE ebooks SET deleted_at = NULL WHERE ebook_isbn = ?'),
  hardDeleteEbook:      db.prepare('DELETE FROM ebooks WHERE ebook_isbn = ?'),
  listTrash:            db.prepare("SELECT * FROM ebooks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"),
  listTrashByUser:      db.prepare("SELECT * FROM ebooks WHERE deleted_at IS NOT NULL AND user_id = ? ORDER BY deleted_at DESC"),
  grammarGetAll:        db.prepare('SELECT hash, matches FROM grammar_cache WHERE isbn = ?'),
  grammarUpsert:        db.prepare('INSERT OR REPLACE INTO grammar_cache (isbn, hash, matches) VALUES (?, ?, ?)'),
  grammarDeleteIsbn:    db.prepare('DELETE FROM grammar_cache WHERE isbn = ?'),
  grammarSessionGet:    db.prepare('SELECT matches FROM grammar_sessions WHERE isbn = ?'),
  grammarSessionUpsert: db.prepare('INSERT OR REPLACE INTO grammar_sessions (isbn, matches) VALUES (?, ?)'),
  grammarSessionDelete: db.prepare('DELETE FROM grammar_sessions WHERE isbn = ?'),
  updateMetadata:       db.prepare(`
    UPDATE ebooks SET title = ?, author = ?, description = ?, publisher = ?,
    language = ?, subjects = ?, pub_date = ?, physical_isbn = ?, ebook_isbn = ? WHERE ebook_isbn = ?
  `),
  // Rename de ISBN (ebook_isbn é PK, referenciada por ebook_shares/grammar_cache/grammar_sessions
  // por valor, sem FK enforcement ligado — ver renameEbookIsbn em routes/ebooks.js).
  renameEbookShares:    db.prepare('UPDATE ebook_shares SET ebook_isbn = ? WHERE ebook_isbn = ?'),
  renameGrammarCache:   db.prepare('UPDATE grammar_cache SET isbn = ? WHERE isbn = ?'),
  renameGrammarSession: db.prepare('UPDATE grammar_sessions SET isbn = ? WHERE isbn = ?'),
  renameComments:       db.prepare('UPDATE comments SET ebook_isbn = ? WHERE ebook_isbn = ?'),
  // users
  createUser:           db.prepare('INSERT INTO users (email, password, role, first_name, last_name) VALUES (?, ?, ?, ?, ?)'),
  setUserName:          db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?'),
  getDisplayName:       db.prepare(`SELECT ${DISPLAY_NAME('u')} AS name FROM users u WHERE u.id = ?`),
  getUserByEmail:       db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById:          db.prepare(`SELECT u.id, u.email, u.role, u.created_at, u.first_name, u.last_name, ${DISPLAY_NAME('u')} AS name FROM users u WHERE u.id = ?`),
  listUsers:            db.prepare(`SELECT u.id, u.email, u.role, u.created_at, u.first_name, u.last_name, ${DISPLAY_NAME('u')} AS name FROM users u ORDER BY u.created_at`),
  getPasswordHashById:  db.prepare('SELECT password FROM users WHERE id = ?'),
  setPassword:          db.prepare('UPDATE users SET password = ? WHERE id = ?'),
  deleteUser:           db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'"),
  // refresh tokens
  insertRefreshToken:   db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'),
  getRefreshToken:      db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')"),
  deleteRefreshToken:   db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?'),
  deleteUserTokens:     db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?'),
  purgeExpiredTokens:   db.prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"),
  // ebook shares
  shareEbook:           db.prepare('INSERT OR IGNORE INTO ebook_shares (ebook_isbn, user_id) VALUES (?, ?)'),
  unshareEbook:         db.prepare('DELETE FROM ebook_shares WHERE ebook_isbn = ? AND user_id = ?'),
  unshareAllForEbook:   db.prepare('DELETE FROM ebook_shares WHERE ebook_isbn = ?'),
  listSharesForEbook:   db.prepare(`
    SELECT u.id, u.email, ${DISPLAY_NAME('u')} AS name FROM ebook_shares s JOIN users u ON u.id = s.user_id
    WHERE s.ebook_isbn = ? ORDER BY name
  `),
  hasShareAccess:       db.prepare('SELECT 1 FROM ebook_shares WHERE ebook_isbn = ? AND user_id = ?'),
  listBasicUsers:       db.prepare(`SELECT u.id, u.email, ${DISPLAY_NAME('u')} AS name FROM users u ORDER BY name`),
  // backup runs
  startBackupRun:       db.prepare('INSERT INTO backup_runs (source) VALUES (?)'),
  finishBackupRun:      db.prepare("UPDATE backup_runs SET finished_at = datetime('now'), status = ?, summary = ? WHERE id = ?"),
  listBackupRuns:       db.prepare('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 20'),
  // settings
  getSetting:           db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting:           db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
  // activity log
  insertActivityLog:    db.prepare(`
    INSERT INTO activity_log (user_id, user_email, action, target, meta, ip) VALUES (?, ?, ?, ?, ?, ?)
  `),
  // Teto de 1000 = decisão consciente (payload JSON pequeno mesmo assim; equivalente ao
  // LIMIT 20 de listBackupRuns, mas maior porque há muito mais eventos/dia).
  listActivityLog:      db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 1000'),
  // comments
  commentsListByIsbn:   db.prepare(`
    SELECT c.*, u.email AS user_email, ${DISPLAY_NAME('u')} AS user_name FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.ebook_isbn = ? ORDER BY c.created_at ASC
  `),
  insertComment:        db.prepare(`
    INSERT INTO comments (ebook_isbn, anchor_id, parent_id, user_id, text) VALUES (?, ?, ?, ?, ?)
  `),
  getComment:           db.prepare('SELECT * FROM comments WHERE id = ?'),
  resolveComment:       db.prepare('UPDATE comments SET resolved = ? WHERE id = ?'),
  deleteComment:        db.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?'),
  deleteCommentsByIsbn: db.prepare('DELETE FROM comments WHERE ebook_isbn = ?'),
  // notifications
  insertNotification:   db.prepare('INSERT INTO notifications (user_id, type, ebook_isbn, actor_id) VALUES (?, ?, ?, ?)'),
  pruneNotifications:   db.prepare("DELETE FROM notifications WHERE user_id = ? AND created_at < datetime('now', '-90 days')"),
  listNotifications:    db.prepare(`
    SELECT n.id, n.type, n.ebook_isbn, n.read_at, n.created_at, u.email AS actor_email, ${DISPLAY_NAME('u')} AS actor_name, e.title AS ebook_title
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_id
    LEFT JOIN ebooks e ON e.ebook_isbn = n.ebook_isbn
    WHERE n.user_id = ? AND n.read_at IS NULL ORDER BY n.id DESC LIMIT 50
  `),
  countUnreadNotifications: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL'),
  markNotificationRead: db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL"),
  markAllNotificationsRead: db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL"),
  deleteNotificationsByIsbn: db.prepare('DELETE FROM notifications WHERE ebook_isbn = ?'),
  renameNotifications:  db.prepare('UPDATE notifications SET ebook_isbn = ? WHERE ebook_isbn = ?'),
};

export function migrateGrammarToDb() {
  try {
    for (const isbn of readdirSync(DATA_DIR)) {
      const grammarPath = join(DATA_DIR, isbn, 'grammar.json');
      if (!existsSync(grammarPath)) continue;
      try {
        const content = JSON.parse(readFileSync(grammarPath, 'utf8'));
        const cache = content.cache || {};
        db.transaction(() => {
          for (const [hash, matches] of Object.entries(cache)) {
            stmt.grammarUpsert.run(isbn, hash, JSON.stringify(matches));
          }
        })();
        unlinkSync(grammarPath);
        console.log(`Migrated grammar cache for ${isbn}`);
      } catch (e) {
        console.error(`Failed to migrate grammar for ${isbn}:`, e.message);
      }
    }
  } catch {}
}

// `days` configurável (separador Sistema do Painel, ver server/scheduled-cleanup.js) — default
// 30 mantém o comportamento de sempre para quem nunca mexeu na definição.
export function purgeOldTrash(days = 30) {
  const old = db.query("SELECT ebook_isbn FROM ebooks WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)").all(`-${days} days`);
  for (const { ebook_isbn } of old) {
    stmt.hardDeleteEbook.run(ebook_isbn);
    stmt.grammarDeleteIsbn.run(ebook_isbn);
    stmt.grammarSessionDelete.run(ebook_isbn);
    stmt.unshareAllForEbook.run(ebook_isbn);
    stmt.deleteCommentsByIsbn.run(ebook_isbn);
    stmt.deleteNotificationsByIsbn.run(ebook_isbn);
    try { rmSync(join(DATA_DIR, ebook_isbn), { recursive: true, force: true }); } catch {}
  }
  if (old.length > 0) console.log(`Purged ${old.length} ebooks from trash (> ${days} days)`);
  return old.length;
}
