// Acesso ao Backblaze B2 via `rclone` (mirror/sync — ver server/routes/maintenance.js). Só
// guarda aqui o que é comum: saber se está configurado, e a connection string do remote (sem
// precisar de ~/.config/rclone/rclone.conf — as credenciais vêm sempre destas env vars).
import { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME } from './config.js';

export function b2Configured() {
  return !!(B2_KEY_ID && B2_APPLICATION_KEY && B2_BUCKET_NAME);
}

// "Connection string" remote do rclone (sintaxe :type,param=val,...:bucket/caminho) — evita
// gerir ficheiro de config à parte, as 3 env vars já existentes bastam.
export function b2RcloneRemote(subpath = '') {
  return `:b2,account=${B2_KEY_ID},key=${B2_APPLICATION_KEY}:${B2_BUCKET_NAME}/${subpath}`;
}
