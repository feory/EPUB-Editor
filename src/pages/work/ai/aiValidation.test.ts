import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { runAgent, type ChatResponse } from './aiAgent';
import type { ValidationDigest, ValidationKind } from '../../../utils/validation-digest';
import { memoryWorkspace } from './testWorkspace';

const digest = (kind: ValidationKind, count: number): ValidationDigest => ({ source: kind, valid: count === 0, groups: count ? [{ rule: 'r', severity: 'aviso', count, description: 'd', files: [], examples: [] }] : [], omittedGroups: 0 });

/** O modelo chama run_validation com `input` e depois termina; devolve o que a ferramenta respondeu. */
async function call(input: object, validate: (k: ValidationKind) => Promise<ValidationDigest | null>) {
    let toolResult = '';
    let turn = 0;
    const send = async (messages: { content: unknown }[]): Promise<ChatResponse> => {
        if (++turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'run_validation', input }] };
        const last = messages[messages.length - 1].content as { content: string }[];
        toolResult = last[0].content;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
    };
    await runAgent({ messages: [], send: send as never, workspace: memoryWorkspace({}, { validate }) });
    return toolResult;
}

test('all: corre todas por ordem (notas, links, epub, ace) e só detalha as que têm problemas', async () => {
    const order: ValidationKind[] = [];
    const out = JSON.parse(await call({ type: 'all' }, async (k) => { order.push(k); return digest(k, k === 'epub' ? 3 : 0); }));
    expect(order).toEqual(['footnotes', 'links', 'epub', 'accessibility']);
    expect(out.validacoes.map((v: { validacao: string; ok: boolean; problemas: number }) => [v.validacao, v.ok, v.problemas])).toEqual([['footnotes', true, 0], ['links', true, 0], ['epub', false, 3], ['accessibility', true, 0]]);
    expect(out.validacoes[2].detalhe.groups).toHaveLength(1);
    expect(out.validacoes[0].detalhe).toBeUndefined();
});

test('uma validação que falha não impede as outras; sem tipo corre o ACE', async () => {
    const out = JSON.parse(await call({ type: 'all' }, async (k) => (k === 'links' ? null : digest(k, 0))));
    expect(out.validacoes.find((v: { validacao: string }) => v.validacao === 'links').erro).toBeTruthy();
    expect(out.validacoes.filter((v: { ok: boolean }) => v.ok)).toHaveLength(3);
    const kinds: ValidationKind[] = [];
    await call({}, async (k) => { kinds.push(k); return digest(k, 0); });
    expect(kinds).toEqual(['accessibility']);
});

test('se nenhuma correu (modo leitura) devolve erro para o modelo explicar', async () => {
    expect(await call({ type: 'all' }, async () => null)).toContain('Não foi possível correr a validação');
});

test('operação typography: resumo com contagens e exemplo; fixes inválidos recusados', async () => {
    const { runPlan } = await import('./aiPlan');
    const ok = runPlan(['<p>Disse "olá"...</p>'], [], [{ type: 'typography' }]);
    expect(ok.errors).toEqual([]);
    expect(ok.opResults[0]).toMatchObject({ label: 'Tipografia', changed: true });
    expect(ok.opResults[0].summary).toContain('aspas 2');
    expect(ok.opResults[0].summary).toContain('reticências 1');
    expect(ok.html).toBe('<p>Disse «olá»…</p>');
    expect(runPlan(['<p>a</p>'], [], [{ type: 'typography', fixes: ['nada' as never] }]).errors).toHaveLength(1);
    expect(runPlan(['<p>limpo</p>'], [], [{ type: 'typography' }]).opResults[0]).toMatchObject({ changed: false, summary: 'Nada a corrigir' });
});

test('check_publication: junta os factos do livro com as quatro validações por ordem', async () => {
    const order: ValidationKind[] = [];
    let toolResult = '';
    let turn = 0;
    const send = async (messages: { content: unknown }[]): Promise<ChatResponse> => {
        if (++turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'check_publication', input: {} }] };
        toolResult = ((messages[messages.length - 1].content as { content: string }[])[0]).content;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
    };
    const facts = { metadata: { title: 'T', author: '', language: 'pt', ebook_isbn: '1' }, hasCover: false, images: { total: 0, withoutAlt: 0 }, indice: { exists: false, linked: 0, linkable: 0 }, pageMarkers: 0 };
    await runAgent({ messages: [], send: send as never, workspace: memoryWorkspace({}, { publicationFacts: async () => facts, validate: async (k) => { order.push(k); return digest(k, k === 'links' ? 2 : 0); } }) });
    expect(order).toEqual(['footnotes', 'links', 'epub', 'accessibility']);
    const items = JSON.parse(toolResult).itens as { item: string; estado: string }[];
    expect(items.find((i) => i.item === 'Metadados')?.estado).toBe('falta'); // autor em branco
    expect(items.find((i) => i.item === 'Capa')?.estado).toBe('falta');
    expect(items.find((i) => i.item === 'Links')?.estado).toBe('aviso');
    expect(items.find((i) => i.item === 'EPUBCheck')?.estado).toBe('ok');
});
