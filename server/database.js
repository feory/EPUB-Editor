import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'fs';
import { DATA_DIR } from './config.js';

const dbPath = join(import.meta.dir, '..', 'ebooks.db');
export const db = new Database(dbPath);

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

export const stmt = {
  // ebooks
  listEbooks:           db.prepare('SELECT * FROM ebooks WHERE deleted_at IS NULL ORDER BY created_at DESC'),
  listEbooksByUser:     db.prepare(`
    SELECT * FROM ebooks WHERE deleted_at IS NULL AND (user_id = ? OR ebook_isbn IN
      (SELECT ebook_isbn FROM ebook_shares WHERE user_id = ?)) ORDER BY created_at DESC
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
    language = ?, subjects = ?, pub_date = ?, physical_isbn = ? WHERE ebook_isbn = ?
  `),
  // users
  createUser:           db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)'),
  getUserByEmail:       db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById:          db.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?'),
  listUsers:            db.prepare('SELECT id, email, role, created_at FROM users ORDER BY created_at'),
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
    SELECT u.id, u.email FROM ebook_shares s JOIN users u ON u.id = s.user_id
    WHERE s.ebook_isbn = ? ORDER BY u.email
  `),
  hasShareAccess:       db.prepare('SELECT 1 FROM ebook_shares WHERE ebook_isbn = ? AND user_id = ?'),
  listBasicUsers:       db.prepare('SELECT id, email FROM users ORDER BY email'),
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

export function purgeOldTrash() {
  const old = db.query("SELECT ebook_isbn FROM ebooks WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')").all();
  for (const { ebook_isbn } of old) {
    stmt.hardDeleteEbook.run(ebook_isbn);
    stmt.grammarDeleteIsbn.run(ebook_isbn);
    stmt.grammarSessionDelete.run(ebook_isbn);
    stmt.unshareAllForEbook.run(ebook_isbn);
    try { rmSync(join(DATA_DIR, ebook_isbn), { recursive: true, force: true }); } catch {}
  }
  if (old.length > 0) console.log(`Purged ${old.length} ebooks from trash (> 30 days)`);
}
