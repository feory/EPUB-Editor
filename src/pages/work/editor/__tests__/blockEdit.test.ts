/**
 * editBlocks: o contrato é a ORDEM — a mutação corre dentro do passo de undo (transact) e o
 * nodeChanged vem depois dele. Que transact torna a ação reversível com Ctrl+Z é do TinyMCE
 * (verificado no browser); o TinyMCE real não arranca em happy-dom, por isso editor falso.
 */
import { test, expect } from 'bun:test';
import { editBlocks } from '../blockEdit';

function fakeEditor() {
    const log: string[] = [];
    let inTransact = false;
    const editor = {
        undoManager: {
            transact: (fn: () => void) => { log.push('transact:start'); inTransact = true; fn(); inTransact = false; log.push('transact:end'); },
        },
        nodeChanged: () => log.push(inTransact ? 'nodeChanged(DENTRO)' : 'nodeChanged'),
    };
    return { editor, log, mutate: () => log.push(inTransact ? 'mutate' : 'mutate(FORA)') };
}

test('a mutação corre dentro do passo de undo; nodeChanged depois dele', () => {
    const { editor, log, mutate } = fakeEditor();
    editBlocks(editor, mutate);
    expect(log).toEqual(['transact:start', 'mutate', 'transact:end', 'nodeChanged']);
});

test('não emite change à mão — vem do passo de undo (sem alteração real, sem change)', () => {
    const { editor, mutate } = fakeEditor();
    let dispatched = 0;
    (editor as Record<string, unknown>).dispatch = () => { dispatched++; };
    editBlocks(editor, mutate);
    expect(dispatched).toBe(0);
});
