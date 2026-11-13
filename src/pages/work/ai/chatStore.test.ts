import { test, expect } from 'bun:test';
import { compactHistory, chatKey, loadChat, saveChat } from './chatStore';
import type { AgentMessage } from './aiAgent';

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

const convo: AgentMessage[] = [
    { role: 'user', content: 'tira o avanço' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: '1', name: 'survey_book', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: '{"chapters":[...enorme...]}' }] },
    { role: 'assistant', content: [{ type: 'tool_use', id: '2', name: 'preview_rules', input: { rules: [] } }, { type: 'text', text: '114 blocos' }] },
    { role: 'user', content: '[Sistema: o utilizador APLICOU a proposta anterior.]' },
    { role: 'user', content: 'agora reverte' },
];

test('compactar: só texto, sem ferramentas nem mensagens vazias; as seguidas do mesmo autor juntam-se', () => {
    expect(compactHistory(convo)).toEqual([
        { role: 'user', content: 'tira o avanço' },
        { role: 'assistant', content: '114 blocos' },
        { role: 'user', content: '[Sistema: o utilizador APLICOU a proposta anterior.]\n\nagora reverte' },
    ]);
});

test('compactar: corta nas últimas 40 e começa sempre por uma do utilizador; vazio → vazio', () => {
    const many: AgentMessage[] = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const c = compactHistory(many);
    expect(c.length).toBeLessThanOrEqual(40);
    expect(c[0].role).toBe('user');
    expect(c.at(-1)).toEqual({ role: 'assistant', content: 'm99' });
    expect(compactHistory([])).toEqual([]);
});

test('guardar e carregar: ida e volta; a chave é por livro e por utilizador', () => {
    const s = mem();
    const key = chatKey('9789', 7)!;
    expect(key).toBe('ai-chat:9789:7');
    saveChat(key, { lines: [{ role: 'user', text: 'olá' }, { role: 'assistant', text: '**ok**' }], history: convo, pending: true }, s);
    const back = loadChat(key, s)!;
    expect(back.lines).toHaveLength(2);
    expect(back.history).toHaveLength(3); // compactado
    expect(back.pending).toBe(true);
    expect(loadChat(chatKey('9789', 8), s)).toBeNull();
    expect(loadChat(chatKey('1111', 7), s)).toBeNull();
});

test('conversa vazia apaga o que estava guardado (Nova conversa)', () => {
    const s = mem();
    saveChat('k', { lines: [{ role: 'user', text: 'x' }], history: [], pending: false }, s);
    expect(s.m.size).toBe(1);
    saveChat('k', { lines: [], history: [], pending: false }, s);
    expect(s.m.size).toBe(0);
});

test('robustez: dados estragados, versão antiga, sem chave, storage a lançar → nunca lança', () => {
    const s = mem();
    s.m.set('a', '{não é json'); s.m.set('b', JSON.stringify({ v: 0, lines: [], history: [] }));
    expect(loadChat('a', s)).toBeNull();
    expect(loadChat('b', s)).toBeNull();
    expect(loadChat(null, s)).toBeNull();
    expect(chatKey(undefined, 1)).toBeNull();
    expect(() => saveChat('k', { lines: [{ role: 'user', text: 'x' }], history: [], pending: false }, { setItem() { throw new Error('quota'); }, removeItem() {} })).not.toThrow();
    expect(() => saveChat(null, { lines: [], history: [], pending: false }, s)).not.toThrow();
});

test('limite de tamanho: deita fora o mais antigo até caber', () => {
    const s = mem();
    const big = 'x'.repeat(40_000);
    const lines = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `${i}${big}` }));
    saveChat('k', { lines, history: lines.map((l) => ({ role: l.role, content: l.text })), pending: false }, s);
    const back = loadChat('k', s)!;
    expect(JSON.stringify(back).length).toBeLessThanOrEqual(310_000);
    expect(back.lines.at(-1)!.text.startsWith('19')).toBe(true); // o mais recente fica
    expect(back.lines.length).toBeLessThan(20);
});
