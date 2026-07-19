import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { TEMP_DIR } from './config.js';

export async function cleanupTempDir() {
  const maxAge = 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;
  try {
    for (const file of await readdir(TEMP_DIR)) {
      const filePath = join(TEMP_DIR, file);
      if (now - (await stat(filePath)).mtimeMs > maxAge) {
        await unlink(filePath);
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`Cleaned ${cleaned} orphaned temp files`);
  } catch {}
}
