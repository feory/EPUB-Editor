import { expect, test } from 'bun:test';
import { rowReducer, deleteLabels, ebookMenuItems } from './ebookRow';
import type { Ebook } from '../../api/ebooks-api';

const none = { confirming: null, deleting: null };
const ebook = { ebook_isbn: '1' } as Ebook;

test('rowReducer: concluir e eliminar são exclusivos; cancelar limpa tudo', () => {
    const c = rowReducer(none, { type: 'askComplete', isbn: 'a' });
    expect(c).toEqual({ confirming: 'a', deleting: null });
    const d = rowReducer(c, { type: 'askDelete', isbn: 'b' });
    expect(d).toEqual({ confirming: null, deleting: 'b' });
    expect(rowReducer(d, { type: 'cancel' })).toEqual(none);
});

test('deleteLabels: partilhado remove a partilha, meu vai para a Reciclagem', () => {
    expect(deleteLabels(true).ask).toBe('Remover partilha');
    expect(deleteLabels(false).ask).toBe('Eliminar registo');
    expect(deleteLabels(false).confirm).toContain('Reciclagem');
});

test('ebookMenuItems: Partilha só para o dono e só se houver handler', () => {
    const h = { onOpenMetadata: () => {}, onOpenCover: () => {}, onShare: () => {} };
    expect(ebookMenuItems(ebook, false, h).map((i) => i.label)).toEqual(['Edição da Informação', 'Capa', 'Partilha']);
    expect(ebookMenuItems(ebook, true, h).map((i) => i.label)).toEqual(['Edição da Informação', 'Capa']);
    expect(ebookMenuItems(ebook, false, {})).toEqual([]);
});
