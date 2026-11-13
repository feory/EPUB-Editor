// Consumo real da IA: grava as contagens que o fornecedor devolve (sem texto) e agrega-as para o Painel.
import { db } from './database.js';

const insert = db.prepare(`INSERT INTO ai_usage (user_id, ebook_isbn, kind, provider, model, calls, input_tokens, output_tokens, cached_tokens, cost_usd)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

/**
 * `usage` no formato da Anthropic ({ input_tokens, output_tokens, cache_read_input_tokens?, cost_usd? }); `backend.meta` diz
 * o fornecedor e o modelo. Nunca lança: contar o consumo não pode estragar o pedido do utilizador.
 */
export function recordAiUsage({ userId, isbn, kind, backend, usage, calls = 1 }) {
  try {
    insert.run(
      userId == null ? null : Number(userId), isbn ?? null, kind, backend?.meta?.provider ?? null, backend?.meta?.model ?? null, calls,
      usage?.input_tokens ?? 0, usage?.output_tokens ?? 0, usage?.cache_read_input_tokens ?? 0, typeof usage?.cost_usd === 'number' ? usage.cost_usd : null,
    );
  } catch (err) { console.error('[ai-usage] não foi possível registar:', err?.message); }
}

const TOTALS = `COUNT(*) AS rows, SUM(calls) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(cached_tokens) AS cached,
  SUM(cost_usd) AS cost, SUM(CASE WHEN cost_usd IS NULL THEN 0 ELSE calls END) AS costCalls`;
const since = (days) => `created_at >= datetime('now', '-${Math.floor(days)} days')`;
const round = (n) => (n == null ? null : Math.round(n * 1e6) / 1e6);
const shape = (r) => ({ ...r, calls: r.calls ?? 0, input: r.input ?? 0, output: r.output ?? 0, cached: r.cached ?? 0, cost: round(r.cost), costCalls: r.costCalls ?? 0 });

/** Os últimos `days` dias (1–365): totais e por dia, utilizador, tipo e modelo. `cost` soma só as chamadas com custo conhecido. */
export function usageReport(days) {
  const d = Math.min(365, Math.max(1, Math.floor(Number(days) || 30)));
  const where = since(d);
  const group = (select, groupBy, order) => db.prepare(`SELECT ${select}, ${TOTALS} FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id WHERE a.${where} GROUP BY ${groupBy} ORDER BY ${order}`).all().map(shape);
  return {
    days: d,
    totals: shape(db.prepare(`SELECT ${TOTALS} FROM ai_usage WHERE ${where}`).get()),
    byDay: group("date(a.created_at) AS day", 'day', 'day'),
    byUser: group("COALESCE(u.email, 'removido') AS user", 'a.user_id', 'input DESC'),
    byKind: group('a.kind AS kind', 'a.kind', 'input DESC'),
    byModel: group("COALESCE(a.model, '—') AS model", 'a.model', 'input DESC'),
  };
}
