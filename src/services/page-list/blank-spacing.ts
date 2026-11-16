// Confirma com o PDF de impressão as linhas em branco manuais do IDML (candidatas a p-top). Puro: recebe as páginas já lidas
// (pdf-pages.ts), por isso o importador lê o PDF uma só vez e isto testa-se com páginas sintéticas.
import type { PdfPageText } from './pdf-pages';
import { normalize, buildPdfLines } from './pdf-text';

function median(nums: number[]): number {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Confirma cada candidato a p-top por linha em branco manual (marcado `data-blank-top` por
 * renderStory/idml-importer) contra o PDF de impressão: uma linha em branco no manuscrito nem
 * sempre corresponde a espaço visível no miolo (hábito de escrita, não intenção tipográfica) —
 * só se o gap vertical antes do parágrafo, no PDF, for CLARAMENTE maior que a entrelinha normal
 * da página (>1.4×) é que fica p-top; caso contrário, ou sem PDF, fica sem p-top (mais seguro
 * que assumir).
 */
export function verifyBlankSpacing(html: string, pages?: PdfPageText[]): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = Array.from(doc.querySelectorAll('[data-blank-top]'));
    if (candidates.length === 0) return html;
    if (!pages) {
        for (const el of candidates) el.removeAttribute('data-blank-top');
        return doc.body.innerHTML;
    }

    const pdfLines = buildPdfLines(pages);

    for (const el of candidates) {
        el.removeAttribute('data-blank-top');
        const key = normalize(el.textContent || '').slice(0, 40);
        if (!key) continue;
        // Curto (< 15, ex. nome de personagem "Hamlet") — startsWith seria ambíguo demais;
        // linha isolada de nome ocupa a linha TODA no PDF, exact match é fiável mesmo curto.
        const short = key.length < 15;
        for (const lines of pdfLines) {
            const idx = lines.findIndex(l => short ? l.text === key : l.text.startsWith(key));
            // idx 0 (não encontrado/1ª linha, sem anterior p/ comparar) OU 1 (1ª linha de CORPO
            // da página — a linha 0 é o cabeçalho corrente, mesma convenção de
            // extractPdfPageAnchors) → gap mediria cabeçalho→corpo (margem de topo, sempre maior
            // que a entrelinha normal), não espaçamento real; sem confirmação possível aqui.
            if (idx <= 1) continue;
            const gap = lines[idx - 1].y - lines[idx].y;
            const gaps: number[] = [];
            for (let k = 1; k < lines.length; k++) gaps.push(lines[k - 1].y - lines[k].y);
            const normalGap = median(gaps.filter(g => g > 0 && g < 40)); // exclui outliers (colunas/quebras de página)
            if (normalGap > 0 && gap > normalGap * 1.4) el.classList.add('p-top');
            break;
        }
    }
    return doc.body.innerHTML;
}
