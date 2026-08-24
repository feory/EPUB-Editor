import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

export const PORT = parseInt(Bun.env.PORT ?? '3999');
export const DATA_DIR = join(ROOT, 'data');
export const TEMP_DIR = join(ROOT, 'temp');
export const EPUBCHECK_JAR = join(ROOT, 'tools', 'epubcheck', 'epubcheck.jar');

export const JWT_SECRET = Bun.env.JWT_SECRET
  ?? (() => { throw new Error('JWT_SECRET env var is required'); })();
export const ALLOWED_ORIGIN = Bun.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';
export const ADMIN_EMAIL    = Bun.env.ADMIN_EMAIL;
export const ADMIN_PASSWORD = Bun.env.ADMIN_PASSWORD;

// Backup para o Backblaze B2 — opcional (sem isto, o botão/cron do Painel só avisa "não
// configurado", nunca rebenta o arranque do servidor).
export const B2_KEY_ID          = Bun.env.B2_KEY_ID;
export const B2_APPLICATION_KEY = Bun.env.B2_APPLICATION_KEY;
export const B2_BUCKET_NAME     = Bun.env.B2_BUCKET_NAME;
