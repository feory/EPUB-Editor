// Definições da IA que o administrador muda no Painel: a chave e o modelo da OpenRouter. SÓ há esta via (sem variáveis de
// ambiente). Ficam na tabela `settings`; a chave CIFRADA (AES-256-GCM, chave derivada do JWT_SECRET) e nunca sai do
// servidor — o Painel só vê se existe e os últimos 4 caracteres.
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'crypto';
import { db, stmt } from './database.js';
import { JWT_SECRET } from './config.js';

const KEY_SETTING = 'ai_openrouter_key';
const MODEL_SETTING = 'ai_openrouter_model';
const secret = Buffer.from(hkdfSync('sha256', JWT_SECRET, '', 'epub-ai-settings', 32));

/** iv | tag | texto cifrado, em base64. */
export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

/** null se o valor foi adulterado ou cifrado com outro JWT_SECRET. */
export function decrypt(blob) {
  try {
    const raw = Buffer.from(blob, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', secret, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return null; }
}

const setting = (key) => stmt.getSetting.get(key)?.value;

/** A chave e o modelo guardados no Painel (ou null). SÓ para uso interno do servidor. */
export function effectiveOpenRouter() {
  return {
    apiKey: setting(KEY_SETTING) ? decrypt(setting(KEY_SETTING)) : null,
    model: setting(MODEL_SETTING) || null,
  };
}

/** `apiKey` guarda (cifrada); `clearKey` apaga a chave; `model` guarda ('' apaga). */
export function saveAiSettings({ apiKey, clearKey, model }) {
  if (clearKey) db.prepare('DELETE FROM settings WHERE key = ?').run(KEY_SETTING);
  else if (apiKey) stmt.setSetting.run(KEY_SETTING, encrypt(apiKey));
  if (model === '') db.prepare('DELETE FROM settings WHERE key = ?').run(MODEL_SETTING);
  else if (model) stmt.setSetting.run(MODEL_SETTING, model);
}

/** O que o Painel pode ver: nunca a chave inteira. */
export function publicAiSettings() {
  const e = effectiveOpenRouter();
  return {
    configured: !!(e.apiKey && e.model),
    keyConfigured: !!e.apiKey,
    keyHint: e.apiKey ? e.apiKey.slice(-4) : null,
    model: e.model,
  };
}
