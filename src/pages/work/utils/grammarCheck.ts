import { getContentBlocks, clearGrammarErrorsInBody, hashString, processBatch, type BatchMapEntry } from './editorDom';

export async function runGrammarCheck(
    body: HTMLElement,
    grammarCache: Record<string, any> | undefined,
    onGrammarCheck: ((matches: any[], cache?: Record<string, any>) => void) | undefined,
    setProgress: (on: boolean) => void
) {
    clearGrammarErrorsInBody(body);

    const paragraphs = getContentBlocks(body);
    if (paragraphs.length === 0) return;

    setProgress(true);

    try {
        const baseUrl = import.meta.env.VITE_LANGUAGETOOL_URL ?? 'https://api.languagetool.org/v2/check';
        const currentCache = { ...(grammarCache || {}) };
        const allMatches: any[] = [];
        const newCache: Record<string, any> = {};
        const paragraphsToCheck: { index: number; text: string; offset: number }[] = [];

        paragraphs.forEach((p, idx) => {
            const text = p.textContent || '';
            const hash = hashString(text);
            if (text.trim().length > 0 && currentCache[hash]) {
                allMatches.push(...currentCache[hash].map((m: any) => ({ ...m, paragraphIndex: idx })));
                newCache[hash] = currentCache[hash];
            } else if (text.trim().length > 0) {
                paragraphsToCheck.push({ index: idx, text, offset: 0 });
            }
        });

        if (paragraphsToCheck.length > 0) {
            const batches: { text: string; map: BatchMapEntry[] }[] = [];
            let batchText = '';
            let batchMap: BatchMapEntry[] = [];

            for (const p of paragraphsToCheck) {
                if (batchText.length > 0 && batchText.length + p.text.length > 8000) {
                    batches.push({ text: batchText, map: batchMap });
                    batchText = '';
                    batchMap = [];
                }
                const needsPeriod = !/[.!?;:]$/.test(p.text.trim());
                const separator = (needsPeriod ? '.' : '') + '\n\n';
                batchMap.push({ ...p, separatorLength: separator.length });
                batchText += p.text + separator;
            }
            if (batchText) batches.push({ text: batchText, map: batchMap });

            const CONCURRENCY = 3;
            for (let i = 0; i < batches.length; i += CONCURRENCY) {
                const chunk = batches.slice(i, i + CONCURRENCY);
                await Promise.all(
                    chunk.map(b => processBatch(b.text, b.map, baseUrl, allMatches, newCache))
                );
                onGrammarCheck?.([...allMatches]);
            }
            const addedCache = Object.fromEntries(
                Object.entries(newCache).filter(([h]) => !currentCache[h])
            );
            onGrammarCheck?.([...allMatches], addedCache);
        } else {
            onGrammarCheck?.(allMatches);
        }
    } catch (err) {
        console.error('LanguageTool Cache Error:', err);
        alert('Erro na verificação inteligente.');
    } finally {
        setProgress(false);
    }
}
