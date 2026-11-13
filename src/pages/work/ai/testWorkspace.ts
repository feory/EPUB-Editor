// O adapter em memória do AiWorkspace, só para testes: um livro em variáveis, as chamadas registadas e cada capacidade
// substituível. O que não se passa tem um valor neutro (sem validações, modo escrita).
import type { AiWorkspace } from './aiWorkspace';

export type MemoryWorkspace = AiWorkspace & { calls: string[]; book: { parts: string[]; css: string } };

export function memoryWorkspace({ parts = [], css = '' }: { parts?: string[]; css?: string } = {}, over: Partial<AiWorkspace> = {}): MemoryWorkspace {
    const book = { parts, css };
    const calls: string[] = [];
    const ws: MemoryWorkspace = {
        calls,
        book,
        parts: () => book.parts,
        css: () => book.css,
        language: () => 'pt',
        readOnly: () => false,
        apply: async (_plan, request) => { calls.push(`apply:${request}`); },
        revert: async (change) => { calls.push(`revert:${change.id}`); return true; },
        restore: async (change) => { calls.push(`restore:${change.id}`); return true; },
        validate: async () => null,
        publicationFacts: async () => null,
        locate: () => null,
        ...over,
    };
    return ws;
}
