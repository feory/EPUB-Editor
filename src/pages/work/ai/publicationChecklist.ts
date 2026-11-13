// "O livro está pronto?": junta o que falta antes de exportar numa lista de itens (ok / falta / aviso / info), cada um com a
// ferramenta que o resolve. Puro: recebe os factos já recolhidos do livro e os resumos das validações; o assistente só os lê.
import type { Ebook } from '../../../api/ebooks-api';
import { scanImages } from '../../../utils/image-alt-scan';
import { needsAlt } from '../../../utils/image-alt';
import { linkIndiceEntries } from '../../../utils/indice-links';
import type { ValidationDigest, ValidationKind } from '../../../utils/validation-digest';

export interface PublicationFacts {
    metadata: Pick<Ebook, 'title' | 'author' | 'language' | 'description' | 'publisher' | 'pub_date' | 'subjects' | 'ebook_isbn'>;
    hasCover: boolean;
    images: { total: number; withoutAlt: number };
    /** `exists`: há um capítulo Índice; `linked`: entradas já ligadas; `linkable`: quantas se ligariam agora. */
    indice: { exists: boolean; linked: number; linkable: number };
    pageMarkers: number;
}

export type ChecklistState = 'ok' | 'falta' | 'aviso' | 'info';
export interface ChecklistItem { item: string; estado: ChecklistState; detalhe?: string; resolver?: string }

const REQUIRED: [keyof PublicationFacts['metadata'], string][] = [['title', 'título'], ['author', 'autor'], ['language', 'língua']];
const RECOMMENDED: [keyof PublicationFacts['metadata'], string][] = [['description', 'descrição'], ['publisher', 'editora'], ['pub_date', 'data de publicação'], ['subjects', 'assuntos'], ['ebook_isbn', 'ISBN do ebook']];
const blank = (v: string | undefined) => !v || !v.trim();

export function collectFacts(input: { ebook: Partial<Ebook> | undefined; hasCover: boolean; parts: string[]; indiceTitles: string[] }): PublicationFacts {
    const { ebook, parts } = input;
    const html = parts.join('');
    const images = scanImages(parts);
    const exists = input.indiceTitles.length > 0;
    return {
        metadata: { title: ebook?.title ?? '', author: ebook?.author ?? '', language: ebook?.language, description: ebook?.description, publisher: ebook?.publisher, pub_date: ebook?.pub_date, subjects: ebook?.subjects, ebook_isbn: ebook?.ebook_isbn ?? '' },
        hasCover: input.hasCover,
        images: { total: images.length, withoutAlt: images.filter((im) => needsAlt(im.alt, im.decorative)).length },
        indice: { exists, linked: (html.match(/\bidx-link\b/g) ?? []).length, linkable: exists ? linkIndiceEntries(parts).linked : 0 },
        pageMarkers: (html.match(/class="[^"]*\bpagebreak\b/g) ?? []).length,
    };
}

const NAMES: Record<ValidationKind, string> = { footnotes: 'Notas de rodapé', links: 'Links', epub: 'EPUBCheck', accessibility: 'Acessibilidade (ACE)' };
const FIX: Record<ValidationKind, string> = { footnotes: 'Validações → Validação de Notas', links: 'Validações → Validação de Links (ou pedir ao assistente)', epub: 'Validações → Validação Ebook', accessibility: 'Validações → Validação Ace (ou pedir ao assistente)' };

/** `validations`: o resumo de cada validação por ordem, ou null se não foi possível corrê-la. */
export function buildChecklist(facts: PublicationFacts, validations: { kind: ValidationKind; digest: ValidationDigest | null }[]): ChecklistItem[] {
    const items: ChecklistItem[] = [];
    const missingReq = REQUIRED.filter(([k]) => blank(facts.metadata[k])).map(([, n]) => n);
    const missingRec = RECOMMENDED.filter(([k]) => blank(facts.metadata[k])).map(([, n]) => n);
    items.push(missingReq.length
        ? { item: 'Metadados', estado: 'falta', detalhe: `em falta: ${missingReq.join(', ')}`, resolver: 'Home → Editar Metadados' }
        : missingRec.length ? { item: 'Metadados', estado: 'aviso', detalhe: `recomendados em falta: ${missingRec.join(', ')}`, resolver: 'Home → Editar Metadados' } : { item: 'Metadados', estado: 'ok' });
    items.push(facts.hasCover ? { item: 'Capa', estado: 'ok' } : { item: 'Capa', estado: 'falta', resolver: 'Home → Editar Metadados (capa)' });
    items.push(facts.images.total === 0 ? { item: 'Texto alternativo das imagens', estado: 'info', detalhe: 'o livro não tem imagens' }
        : facts.images.withoutAlt ? { item: 'Texto alternativo das imagens', estado: 'falta', detalhe: `${facts.images.withoutAlt} de ${facts.images.total} imagens sem texto`, resolver: 'painel da IA → ícone da galeria (texto alternativo)' } : { item: 'Texto alternativo das imagens', estado: 'ok', detalhe: `${facts.images.total} imagens` });
    const unlinked = Math.max(0, facts.indice.linkable - facts.indice.linked);
    items.push(!facts.indice.exists ? { item: 'Índice', estado: 'info', detalhe: 'o livro não tem um capítulo Índice' }
        : unlinked ? { item: 'Índice', estado: 'falta', detalhe: `${unlinked} de ${facts.indice.linkable} entradas por ligar`, resolver: 'Ferramentas → Ligar Índice (ou pedir ao assistente)' } : { item: 'Índice', estado: 'ok' });
    items.push(facts.pageMarkers ? { item: 'Lista de páginas', estado: 'ok', detalhe: `${facts.pageMarkers} marcadores` } : { item: 'Lista de páginas', estado: 'info', detalhe: 'sem marcadores de página (só é preciso se houver edição impressa)' });
    for (const { kind, digest } of validations) {
        if (!digest) { items.push({ item: NAMES[kind], estado: 'aviso', detalhe: 'não foi possível correr', resolver: FIX[kind] }); continue; }
        const n = digest.groups.reduce((s, g) => s + g.count, 0);
        items.push(n ? { item: NAMES[kind], estado: digest.groups.some((g) => g.severity === 'erro') ? 'falta' : 'aviso', detalhe: `${n} ${n === 1 ? 'problema' : 'problemas'}: ${digest.groups.slice(0, 3).map((g) => `${g.rule} (${g.count})`).join(', ')}${digest.groups.length > 3 ? '…' : ''}`, resolver: FIX[kind] } : { item: NAMES[kind], estado: 'ok' });
    }
    return items;
}
