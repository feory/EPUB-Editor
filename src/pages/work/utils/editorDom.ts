import apiClient from '../../../api/client';

export function hashString(str: string): string {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash | 0;
    }
    return hash.toString();
}

export function getContentBlocks(container: Element): Element[] {
    return Array.from(container.querySelectorAll('p, h1, h2, h3'));
}

export function unwrapNode(node: ChildNode) {
    const parent = node.parentNode!;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
}

export function clearMarkers(body: HTMLElement, cls: string) {
    body.querySelectorAll(`.${cls}`).forEach(marker => {
        if (marker.parentNode) unwrapNode(marker);
    });
    body.normalize();
}

export function clearGrammarErrorsInBody(body: HTMLElement) {
    clearMarkers(body, 'grammar-error-highlight');
}

export type BatchMapEntry = { index: number; text: string; offset: number; separatorLength: number };

export async function processBatch(
    fullBatchText: string,
    map: BatchMapEntry[],
    url: string,
    results: any[],
    cache: Record<string, any>
) {
    const params = new URLSearchParams();
    params.append('text', fullBatchText);
    params.append('language', 'pt-PT');

    // Backend proxy (`/api/...`) requires auth — usar o apiClient para herdar o
    // Bearer token (interceptor) + refresh automático em 401; URL externa
    // (api.languagetool.org público) continua por fetch directo, sem auth.
    let data: any;
    if (url.startsWith('/api/')) {
        const resp = await apiClient.post(url.replace(/^\/api/, ''), params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        data = resp.data;
    } else {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params,
        });
        if (!resp.ok) throw new Error(`API Error: ${resp.status}`);
        data = await resp.json();
    }
    const matches: any[] = data.matches || [];

    let currentInBatchOffset = 0;
    map.forEach(p => {
        const pStart = currentInBatchOffset;
        const pEnd = pStart + p.text.length;

        const pMatches = matches
            .filter((m: any) => {
                if (m.offset < pStart || m.offset >= pEnd) return false;
                const matched = (m.context?.text ?? '').substring(
                    m.context?.offset ?? 0,
                    (m.context?.offset ?? 0) + (m.context?.length ?? 0)
                );
                if (matched.length >= 2 && /^[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ0-9/]+$/.test(matched)) return false;
                return true;
            })
            .map((m: any) => ({ ...m, offset: m.offset - pStart }));

        const slimMatches = pMatches.map((m: any) => ({
            offset: m.offset,
            length: m.length,
            message: m.message,
            shortMessage: m.shortMessage,
            replacements: m.replacements,
            context: m.context,
            rule: { id: m.rule?.id, issueType: m.rule?.issueType },
        }));
        const hash = hashString(p.text);
        cache[hash] = slimMatches;
        results.push(...slimMatches.map((m: any) => ({ ...m, paragraphIndex: p.index })));
        currentInBatchOffset += p.text.length + p.separatorLength;
    });
}
