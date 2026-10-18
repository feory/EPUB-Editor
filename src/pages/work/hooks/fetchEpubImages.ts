// Imagens referenciadas pelo HTML do livro (data-image-id e src /api/.../images/<id>), sem repetidas, por ordem.
export function collectImageIds(html: string): string[] {
    const ids = new Set<string>();
    for (const m of html.matchAll(/data-image-id="([^"]+)"/g)) ids.add(m[1]);
    for (const m of html.matchAll(/src=["']\/api\/ebooks\/[^/]+\/images\/([^"'?]+)/g)) ids.add(m[1]);
    return [...ids];
}

// Descarrega com concorrência limitada (um pedido de cada vez demorava segundos em livros com centenas de
// imagens). Falhas (imagem não está no servidor) saltam-se; o Map mantém a ordem de `ids`.
export async function fetchImages(ids: string[], get: (id: string) => Promise<Blob>, concurrency = 6): Promise<Map<string, Blob>> {
    const results = new Array<Blob | undefined>(ids.length);
    let next = 0;
    const worker = async () => {
        while (next < ids.length) {
            const i = next++;
            try { results[i] = await get(ids[i]); } catch { /* image not on server */ }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
    const map = new Map<string, Blob>();
    ids.forEach((id, i) => { const blob = results[i]; if (blob) map.set(id, blob); });
    return map;
}
