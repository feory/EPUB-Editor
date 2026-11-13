import { useState, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { ebooksApi } from '../../../api/ebooks-api';
import { scanImages, type BookImage } from '../../../utils/image-alt-scan';
import { needsAlt } from '../../../utils/image-alt';
import type { AiPlanInput } from './aiPlan';

/** Uma imagem do livro com o que está gravado (`alt`, `decorative`) e o rascunho do utilizador (`draft*`). */
export interface AltItem extends BookImage { draftAlt: string; draftDecorative: boolean; error?: string }
type Phase = 'idle' | 'confirm' | 'running' | 'saving';

const BATCH = 10; // o servidor aceita até 10 imagens por pedido
export const TOKENS_PER_IMAGE = 1700; // estimativa: ~1400 da imagem a 1024 px + contexto e instruções

export const isPending = (it: AltItem) => needsAlt(it.alt, it.decorative);
/** Rascunho diferente do gravado E válido (decorativa, ou texto não vazio): só isto se grava. */
export const isDirty = (it: AltItem) =>
    (it.draftDecorative !== it.decorative || it.draftAlt.trim() !== it.alt.trim()) && (it.draftDecorative || it.draftAlt.trim() !== '');

const fromBook = (im: BookImage): AltItem => ({ ...im, draftAlt: im.alt, draftDecorative: im.decorative });

/**
 * Texto alternativo das imagens do livro: lista TODAS as imagens com o alt atual, editável a qualquer altura. A IA só
 * preenche o rascunho das que estão por escrever (depois de confirmar o envio); nada se grava sem "Guardar".
 */
export function useAltReview({ isbn, language, getParts, applyPlan }: {
    isbn: string | undefined;
    language: string;
    getParts: () => string[];
    applyPlan: (plan: AiPlanInput, request: string) => Promise<unknown>;
}) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [items, setItems] = useState<AltItem[]>([]);
    const [done, setDone] = useState(0);
    const [message, setMessage] = useState('');
    const [busyIds, setBusyIds] = useState<string[]>([]); // imagens a gerar uma a uma (botão Gerar de cada imagem)
    const cancelled = useRef(false);

    /** Lê o livro agora (alts podem ter mudado no editor). Descarta rascunhos: chamar ao abrir a vista. */
    const load = useCallback(() => { setItems(scanImages(getParts()).map(fromBook)); setMessage(''); setPhase('idle'); }, [getParts]);

    const toGenerate = items.filter((it) => isPending(it) && !it.draftAlt.trim() && !it.draftDecorative);
    const askGenerate = useCallback(() => setPhase('confirm'), []);
    const cancelConfirm = useCallback(() => setPhase('idle'), []);

    const generate = useCallback(async () => {
        if (!isbn) return;
        cancelled.current = false; setPhase('running'); setDone(0); setMessage('');
        const queue = toGenerate;
        for (let i = 0; i < queue.length && !cancelled.current; i += BATCH) {
            const batch = queue.slice(i, i + BATCH);
            try {
                const { data } = await ebooksApi.aiAlt(isbn, batch.map(({ id, chapter, before, after }) => ({ id, chapter, before, after })), language);
                setItems((cur) => cur.map((it) => {
                    const r = data.results.find((x) => x.id === it.id);
                    if (!r) return it;
                    return 'error' in r ? { ...it, error: r.error } : { ...it, error: undefined, draftAlt: r.alt, draftDecorative: r.decorative };
                }));
            } catch (e) {
                const msg = isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error ?? 'Erro de rede' : 'Erro inesperado';
                setItems((cur) => cur.map((it) => batch.some((b) => b.id === it.id) ? { ...it, error: msg } : it));
            }
            setDone(Math.min(i + BATCH, queue.length));
        }
        setPhase('idle');
    }, [isbn, language, toGenerate]);

    /** Gera (ou volta a gerar) o texto de UMA imagem, p.ex. uma acabada de acrescentar. Só mexe no rascunho. */
    const generateOne = useCallback(async (id: string) => {
        const it = items.find((x) => x.id === id);
        if (!isbn || !it || busyIds.includes(id)) return;
        setBusyIds((cur) => [...cur, id]);
        try {
            const { data } = await ebooksApi.aiAlt(isbn, [{ id, chapter: it.chapter, before: it.before, after: it.after }], language);
            const r = data.results[0];
            setItems((cur) => cur.map((x) => x.id !== id ? x : 'error' in r ? { ...x, error: r.error } : { ...x, error: undefined, draftAlt: r.alt, draftDecorative: r.decorative }));
        } catch (e) {
            const msg = isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error ?? 'Erro de rede' : 'Erro inesperado';
            setItems((cur) => cur.map((x) => (x.id === id ? { ...x, error: msg } : x)));
        }
        setBusyIds((cur) => cur.filter((x) => x !== id));
    }, [isbn, language, items, busyIds]);

    const cancel = useCallback(() => { cancelled.current = true; }, []);
    const patch = useCallback((id: string, p: Partial<Pick<AltItem, 'draftAlt' | 'draftDecorative'>>) =>
        setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...p, error: undefined } : it))), []);
    const discard = useCallback(() => setItems((cur) => cur.map((it) => fromBook(it))), []);

    const dirty = items.filter(isDirty);
    const save = useCallback(async () => {
        setPhase('saving'); setMessage('');
        const decisions = dirty.map(({ id, draftAlt, draftDecorative }) => ({ id, alt: draftDecorative ? '' : draftAlt.trim(), decorative: draftDecorative, overwrite: true }));
        try {
            await applyPlan({ rules: [], ops: [{ type: 'set_image_alts', items: decisions }], styles: [], edits: [] }, 'Texto alternativo das imagens');
            const saved = new Set(decisions.map((d) => d.id));
            setItems((cur) => cur.map((it) => saved.has(it.id) ? { ...it, alt: it.draftDecorative ? '' : it.draftAlt.trim(), decorative: it.draftDecorative, draftAlt: it.draftDecorative ? '' : it.draftAlt.trim(), mixed: false } : it));
            setMessage(`${decisions.length} ${decisions.length === 1 ? 'imagem guardada' : 'imagens guardadas'}.`);
        } catch { setMessage('Não foi possível guardar (gravar a versão anterior falhou).'); }
        setPhase('idle');
    }, [dirty, applyPlan]);

    return { phase, items, busyIds, done, message, dirtyCount: dirty.length, pendingCount: items.filter(isPending).length, generateCount: toGenerate.length, load, askGenerate, cancelConfirm, generate, generateOne, cancel, patch, discard, save };
}
