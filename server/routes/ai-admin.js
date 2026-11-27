// Painel de administração → separador IA: chave, modelo e opções da OpenRouter, lista de modelos e teste da ligação.
// Só administradores; a chave nunca volta ao browser (ver ai-settings.js).
import { requireAdmin } from '../middleware/auth.js';
import { corsHeaders } from '../response.js';
import { saveAiSettings, publicAiSettings, effectiveOpenRouter, PROVIDER_SORTS } from '../ai-settings.js';
import { usageReport } from '../ai-usage.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const MODELS_TTL_MS = 10 * 60 * 1000;
/** A ordem de fornecedor escolhida → o `sort` da lista de modelos da OpenRouter ('auto' não tem: fica por nome). */
const MODELS_SORT = { price: 'pricing-low-to-high', throughput: 'throughput-high-to-low', latency: 'latency-low-to-high' };
const KEY_RE = /^[A-Za-z0-9._-]{20,200}$/;
const MODEL_RE = /^[A-Za-z0-9._:~/-]{1,120}$/;

const json = (body, status = 200) => Response.json(body, { status, headers: corsHeaders });

const perMillion = (perToken) => Math.round(Number(perToken) * 1e6 * 1e4) / 1e4 || 0; // sem ruído de vírgula flutuante

/** Lista da OpenRouter → só os modelos com ferramentas (o assistente precisa delas), com preço por milhão de tokens. Por nome, salvo `keepOrder` (já vem ordenada). */
export function toModelList(data, keepOrder = false) {
  const list = (data ?? [])
    .filter((m) => m.supported_parameters?.includes('tools'))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      vision: !!m.architecture?.input_modalities?.includes('image'),
      contextLength: m.context_length ?? null,
      promptPerMillion: perMillion(m.pricing?.prompt),
      completionPerMillion: perMillion(m.pricing?.completion),
    }));
  return keepOrder ? list : list.sort((a, b) => a.name.localeCompare(b.name));
}

const modelsCache = new Map(); // por `sort` ('' = por nome)
async function models(fetchImpl, sort = '') {
  const hit = modelsCache.get(sort);
  if (hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.list;
  const res = await fetchImpl(sort ? `${MODELS_URL}?sort=${sort}` : MODELS_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const list = toModelList((await res.json()).data, !!sort);
  if (list.length) modelsCache.set(sort, { at: Date.now(), list });
  return list;
}
export const resetModelsCache = () => modelsCache.clear();

export function getSettings(user) {
  const err = requireAdmin(user);
  return err ?? json(publicAiSettings());
}

export async function putSettings(req, user) {
  const err = requireAdmin(user);
  if (err) return err;
  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const { apiKey, clearKey, model, providerSort, denyData } = body ?? {};
  if (apiKey !== undefined && (typeof apiKey !== 'string' || !KEY_RE.test(apiKey.trim()))) return json({ error: 'Chave inválida.' }, 400);
  if (model !== undefined && model !== '' && (typeof model !== 'string' || !MODEL_RE.test(model))) return json({ error: 'Modelo inválido.' }, 400);
  if (providerSort !== undefined && !PROVIDER_SORTS.includes(providerSort)) return json({ error: 'Opção de fornecedor inválida.' }, 400);
  if (denyData !== undefined && typeof denyData !== 'boolean') return json({ error: 'Opção de privacidade inválida.' }, 400);
  saveAiSettings({ apiKey: apiKey?.trim(), clearKey: clearKey === true, model, providerSort, denyData });
  return json(publicAiSettings());
}

/** GET /api/ai/usage?days=30 — o consumo real registado (ver ai-usage.js). */
export function getUsage(url, user) {
  const err = requireAdmin(user);
  return err ?? json(usageReport(url.searchParams.get('days')));
}

/** GET /api/ai/models?sort=price|throughput|latency|auto */
export async function listModels(url, user, fetchImpl = fetch) {
  const err = requireAdmin(user);
  if (err) return err;
  const sort = MODELS_SORT[url.searchParams.get('sort')]; // valor desconhecido → por nome (nada do cliente vai para o URL)
  try { return json({ models: await models(fetchImpl, sort) }); } catch (e) {
    console.error('[ai-admin] modelos:', e?.message);
    return json({ error: 'Não foi possível obter a lista de modelos da OpenRouter.' }, 502);
  }
}

/** Confirma que a chave em vigor é aceite e que o modelo existe na lista. Não gasta tokens. */
export async function testConnection(user, fetchImpl = fetch) {
  const err = requireAdmin(user);
  if (err) return err;
  const { apiKey, model } = effectiveOpenRouter();
  if (!apiKey) return json({ ok: false, message: 'Não há chave configurada.' });
  try {
    const res = await fetchImpl(KEY_URL, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) return json({ ok: false, message: 'A OpenRouter não aceita esta chave.' });
    if (!res.ok) return json({ ok: false, message: `A OpenRouter respondeu ${res.status}.` });
    if (!model) return json({ ok: false, message: 'A chave é válida, mas falta escolher o modelo.' });
    const list = await models(fetchImpl);
    const found = list.find((m) => m.id === model);
    if (!found) return json({ ok: false, message: `A chave é válida, mas "${model}" não existe na OpenRouter ou não suporta ferramentas.` });
    return json({ ok: true, message: found.vision ? 'Ligação e modelo válidos.' : 'Ligação e modelo válidos, mas este modelo não aceita imagens (o texto alternativo das imagens não vai funcionar).' });
  } catch (e) {
    console.error('[ai-admin] teste:', e?.message);
    return json({ ok: false, message: 'Não foi possível contactar a OpenRouter.' });
  }
}
