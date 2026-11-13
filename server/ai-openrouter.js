// Backend OpenRouter para a IA do editor (routes/ai.js). O cliente fala sempre o formato da Anthropic (blocos text /
// tool_use / tool_result); aqui traduz-se de e para o formato "chat completions" da OpenRouter, para o ciclo de
// ferramentas do cliente (pages/work/ai/aiAgent.ts) não saber qual é o fornecedor. Blocos sem equivalente (thinking,
// fallback) deixam-se cair. Erros levam `.status` (o mesmo contrato dos erros do SDK da Anthropic).
const URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 170_000;

const FINISH = { stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', content_filter: 'refusal' };

const textOf = (blocks) => blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');

/** Mensagens da Anthropic → mensagens "chat completions" (system à cabeça). */
export function toOpenAiMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'user' && m.content.some((b) => b.type === 'image')) {
      // texto + imagens (data URI) num só turno do utilizador; tool_result não vem junto de imagens
      out.push({ role: 'user', content: m.content.flatMap((b) => b.type === 'text' ? [{ type: 'text', text: b.text }]
        : b.type === 'image' ? [{ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }] : []) });
      continue;
    }
    if (m.role === 'assistant') {
      const calls = m.content.filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const text = textOf(m.content);
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // cada tool_result é uma mensagem `tool`; o texto solto (se houver) segue como mensagem do utilizador
      for (const b of m.content) if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
      const text = textOf(m.content);
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

const toOpenAiTools = (tools) => tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));

function parseArgs(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; } // JSON inválido → o preview acusa "rules tem de ser uma lista" e o modelo repete
}

/** Resposta "chat completions" → resposta no formato da Anthropic. */
export function fromOpenAiResponse(data) {
  const choice = data?.choices?.[0];
  const msg = choice?.message ?? {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const c of msg.tool_calls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.function?.name, input: parseArgs(c.function?.arguments) });
  const hasTools = content.some((b) => b.type === 'tool_use');
  return {
    content,
    stop_reason: hasTools ? 'tool_use' : (FINISH[choice?.finish_reason] ?? 'end_turn'),
    usage: { input_tokens: data?.usage?.prompt_tokens ?? 0, output_tokens: data?.usage?.completion_tokens ?? 0 },
  };
}

/** `fetchImpl` injetável (testes). */
export function openrouterBackend({ apiKey, model, maxTokens, fetchImpl = fetch }) {
  return {
    async create({ system, tools, messages }) {
      const res = await fetchImpl(URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: toOpenAiMessages(system, messages), ...(tools.length ? { tools: toOpenAiTools(tools) } : {}) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw Object.assign(new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
      return fromOpenAiResponse(await res.json());
    },
  };
}
