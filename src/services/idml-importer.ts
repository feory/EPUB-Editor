import JSZip from 'jszip';
import { sanitizeImageFilename } from '../utils/format';
import { extractPdfPageAnchors, insertPageBreaks, pdfToJpeg } from './page-list';
import { buildFigures, insertFigures, placeInlineFigures, placeNumberedFigures } from './idml-figures';
import type { ExtractedDocument, DocxStyleInfo, DocxStyleTarget, DocxStyleMapping } from './document-importer';

const RASTER_RE = /\.(jpe?g|png|gif|tiff?|webp)$/i;
const MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp',
};

/**
 * Carrega o pacote IDML. O ficheiro pode ser:
 *  - um `.idml` (que JÁ é um zip com designmap.xml à raiz) → sem imagens;
 *  - um `.zip` da pasta do InDesign (Folder/Os Retornados.idml + Folder/Links/*.jpg|png) →
 *    devolve o idml interno + os bytes das imagens da Links/ (para a galeria).
 * `__MACOSX`/`._*` (lixo macOS) e não-rasters (.pdf/.indd/fonts) são ignorados.
 */
async function loadIdmlPackage(file: File): Promise<{ idmlZips: JSZip[]; links: { name: string; blob: Blob }[]; pdf?: ArrayBuffer }> {
    const outer = await JSZip.loadAsync(await file.arrayBuffer());
    if (outer.file('designmap.xml')) return { idmlZips: [outer], links: [] }; // o ficheiro é o próprio .idml

    // TODOS os .idml (livros divididos em vários docs InDesign: "1-…idml", "2-…idml"), por ordem de nome.
    const idmlEntries = Object.values(outer.files)
        .filter(f => /\.idml$/i.test(f.name) && !f.name.includes('__MACOSX'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (idmlEntries.length === 0) throw new Error('Nenhum .idml encontrado no zip');
    const idmlZips = await Promise.all(idmlEntries.map(e => e.async('arraybuffer').then(b => JSZip.loadAsync(b))));

    const links: { name: string; blob: Blob }[] = [];
    for (const entry of Object.values(outer.files)) {
        if (entry.dir || entry.name.includes('__MACOSX') || entry.name.split('/').pop()!.startsWith('._')) continue;
        if (!/\/Links\//.test(entry.name)) continue;
        const base = entry.name.split('/').pop()!;
        if (RASTER_RE.test(base)) {
            const ext = base.split('.').pop()!.toLowerCase();
            links.push({ name: base, blob: await entry.async('blob').then(b => b.slice(0, b.size, MIME[ext] || '')) });
        } else if (/\.pdf$/i.test(base)) {
            // figura em PDF (vetorial) → renderizar para JPEG (1ª página) e carregar na galeria
            try {
                const blob = await pdfToJpeg(await entry.async('arraybuffer'));
                links.push({ name: base.replace(/\.pdf$/i, '.jpg'), blob });
            } catch (err) { console.error('Falha a converter figura PDF', base, err); }
        } else if (/\.eps$/i.test(base)) {
            // figura em EPS (Illustrator vetorial) → enviar CRU; o servidor rasteriza com
            // Ghostscript (cor, alta-res). Nome normalizado p/ .png → id da galeria limpo ("001");
            // o tipo postscript sinaliza ao upload para o mandar como .eps.
            links.push({ name: base.replace(/\.eps$/i, '.png'), blob: await entry.async('blob').then(b => b.slice(0, b.size, 'application/postscript')) });
        }
    }

    // PDF de impressão (miolo) — fora de Links/; preferir o que tem "miolo" no nome.
    const pdfEntries = Object.values(outer.files).filter(f =>
        !f.dir && /\.pdf$/i.test(f.name) && !/\/Links\//.test(f.name) && !f.name.includes('__MACOSX'));
    const pdfEntry = pdfEntries.find(f => /miolo/i.test(f.name)) ?? pdfEntries[0];
    const pdf = pdfEntry ? await pdfEntry.async('arraybuffer') : undefined;

    return { idmlZips, links, pdf };
}

/**
 * Importador IDML (InDesign Markup Language) — fonte original do paginador.
 *
 * Vantagem sobre PDF→Word: estilos de parágrafo NOMEADOS (sem adivinhar tamanhos),
 * notas como elementos <Footnote> ancorados no ponto exato da referência, e parágrafos
 * inteiros (o texto flui numa Story, não é partido por mudança de página). Não há, por
 * isso, nenhuma das heurísticas do caminho docx (noteSize/page-cont/consolidação).
 *
 * Âmbito desta fase (decisão do utilizador): só texto/estrutura/notas.
 *   - Imagens IGNORADAS (o IDML só tem links externos ao disco do paginador, sem bytes).
 *   - Tabelas/gráficos IGNORADOS (o InDesign decompõe-nos em grelhas de frames isolados;
 *     reconstrução em <table> é trabalho à parte — ver backlog "Reconstrução tabelas").
 *   - Sem page-list (o IDML tem os números de página mas não onde quebram no texto).
 */

// Estilo de parágrafo IDML (nome após "ParagraphStyle/") → elemento no editor.
// 'merge' = número de capítulo/parte, fundido no título seguinte.
const STYLE_MAP: Record<string, { tag: string; cls?: string } | 'merge'> = {
    'TXT': { tag: 'p' },
    'CAPITULAR': { tag: 'p', cls: 'drop-cap' }, // abertura de artigo (drop cap) — marca o início do corpo
    'NOTAS': { tag: 'p', cls: 'footnote' },
    'Notas': { tag: 'p', cls: 'footnote' },
    'Notas manuais': { tag: 'p', cls: 'footnote' },
    'RECOLHIDOS': { tag: 'p', cls: 'p-quote' },
    'LEGENDAS': { tag: 'p', cls: 'p-legendas' },
    'CAPÍTULOS_TÍTULOS': { tag: 'h1' },
    'PARTES_TIT': { tag: 'h1' },
    'CAPÍTULOS_TIT 2': { tag: 'h2' },
    'SUBTÍTULOS 1': { tag: 'h2' },
    'SUBTÍTULOS 2': { tag: 'h3' },
    'CAPÍTULOS_#': 'merge',
    'PARTES_#': 'merge',
};

// Estilos que marcam um fluxo NARRATIVO (não célula de tabela / rótulo de gráfico).
// Uma story com algum destes é incluída mesmo que caiba num só frame.
// Case-insensitive: os estilos no IDML podem vir como "Notas", "Notas manuais", etc.
const STRUCTURAL_STYLES = /ParagraphStyle\/(CAPÍTULOS|PARTES|SUBTÍTULOS|NOTAS|RECOLHIDOS)/i;

// Estilo de legenda de figura usado por alguns livros ("Figura titulo"), com caption+imagem
// na MESMA story de frame único — ver uso em extractIdml.
const FIGURA_TITULO_RE = /ParagraphStyle\/Figura\s*t[íi]tulo/i;

// Destino escolhido pelo utilizador (DocxStyleTarget) → elemento/classe no editor.
function targetToTag(target: DocxStyleTarget, centered?: boolean): { tag: string; cls?: string } {
    if (/^h[1-6]$/.test(target)) return centered ? { tag: target, cls: 'p-center' } : { tag: target };
    // parágrafo: combina a classe do alvo com p-center (centrado opcional do utilizador)
    const classes = [target === 'p' ? '' : target, centered && target !== 'p-center' ? 'p-center' : ''].filter(Boolean);
    return classes.length ? { tag: 'p', cls: classes.join(' ') } : { tag: 'p' };
}

// Resolve o estilo de um parágrafo: a escolha do utilizador (mapping) vence; 'auto' ou
// ausente → default interno (STYLE_MAP), que inclui o 'merge' dos números de capítulo.
function resolveStyle(name: string, mapping: DocxStyleMapping): { tag: string; cls?: string } | 'merge' {
    const entry = mapping[name];
    if (entry && entry.target !== 'auto') return targetToTag(entry.target, entry.centered);
    return STYLE_MAP[name] ?? { tag: 'p' };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Separadores de linha do InDesign (line/paragraph separator) e tabs → espaço.
const cleanText = (s: string) => s.replace(/[\u2028\u2029\t]+/g, " ");

function styleName(attr: string | null): string {
    return (attr || '').split('/').pop() || '';
}

interface NoteCounter { n: number; star: number; defs: string[] }
interface Segment { text: string; notes: string[] }

// Aplica itálico/negrito (FontStyle do CharacterStyleRange) a um pedaço de texto já escapado.
function withFontStyle(text: string, fs: string): string {
    if (!text.trim()) return text;
    if (/Italic|Oblique/i.test(fs)) text = `<em>${text}</em>`;
    if (/Bold|Semibold|Demi|Black|Heavy/i.test(fs)) text = `<strong>${text}</strong>`;
    return text;
}

// FontStyle/Capitalization definidos no ESTILO DE CARÁCER (Resources/Styles.xml), aplicados
// via AppliedCharacterStyle sem atributo no run (ex. CharacterStyle/Bold -> FontStyle="Bold",
// versaletes -> Capitalization="SmallCaps"). Sem isto, negrito/itálico/versaletes perdiam-se.
// ponytail: estado por idmlZip (extractIdml é sequencial e repõe-no antes de renderizar cada um).
let CHAR_STYLES = new Map<string, { fontStyle?: string; cap?: string; position?: string }>();

async function scanCharStyles(zip: JSZip): Promise<Map<string, { fontStyle?: string; cap?: string; position?: string }>> {
    const xml = await zip.file('Resources/Styles.xml')?.async('string') ?? '';
    const map = new Map<string, { fontStyle?: string; cap?: string; position?: string }>();
    for (const m of xml.matchAll(/<CharacterStyle\b([^>]*)>/g)) {
        const self = /\bSelf="([^"]*)"/.exec(m[1])?.[1];
        if (!self) continue;
        const fontStyle = /\bFontStyle="([^"]*)"/.exec(m[1])?.[1];
        const cap = /\bCapitalization="([^"]*)"/.exec(m[1])?.[1];
        const position = /\bPosition="([^"]*)"/.exec(m[1])?.[1];
        if (fontStyle || cap || position) map.set(self, { fontStyle, cap, position });
    }
    return map;
}

// Recuo de parágrafo (LeftIndent/FirstLineIndent, em PONTOS) definido no estilo de parágrafo
// (Resources/Styles.xml). Honrado como margin-left + text-indent (hanging quando First<0).
// ponytail: pt→em com divisor fixo 12 (corpo não tem PointSize fiável nos runs); afinar se preciso.
let PARA_INDENTS = new Map<string, { left: number; first: number; fontStyle?: string; spaceBefore: number; spaceAfter: number }>();

// Ativado via opções de importação (checkbox só aparece se scanIdmlStyles detetar espaçamento
// no ficheiro) — a maioria dos livros não precisa, cada estilo já define o seu via CSS.
let DETECT_SPACING = false;

async function scanParaIndents(zip: JSZip): Promise<Map<string, { left: number; first: number; fontStyle?: string; spaceBefore: number; spaceAfter: number }>> {
    const xml = await zip.file('Resources/Styles.xml')?.async('string') ?? '';
    const map = new Map<string, { left: number; first: number; fontStyle?: string; spaceBefore: number; spaceAfter: number }>();
    for (const m of xml.matchAll(/<ParagraphStyle\b([^>]*)>/g)) {
        const self = /\bSelf="([^"]*)"/.exec(m[1])?.[1];
        if (!self) continue;
        const left = parseFloat(/\bLeftIndent="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        const first = parseFloat(/\bFirstLineIndent="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        // FontStyle no estilo de PARÁGRAFO (ex. Num2 Bold) → herdado pelos runs sem override
        // próprio (o marcador "a)"/"i)" das alíneas; o corpo tem FontStyle="Roman" explícito).
        const fontStyle = /\bFontStyle="([^"]*)"/.exec(m[1])?.[1];
        // Espaço antes/depois do parágrafo, em pontos (SpaceBefore/SpaceAfter do InDesign).
        const spaceBefore = parseFloat(/\bSpaceBefore="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        const spaceAfter = parseFloat(/\bSpaceAfter="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        if (left || first || fontStyle || spaceBefore || spaceAfter) map.set(self, { left, first, fontStyle, spaceBefore, spaceAfter });
    }
    return map;
}

// Recuo inline a partir do estilo/override do parágrafo (só quando há LeftIndent de bloco).
function indentStyle(psr: Element, fullPS: string): string {
    const def = PARA_INDENTS.get(fullPS);
    const left = parseFloat(psr.getAttribute('LeftIndent') || '') || def?.left || 0;
    if (left <= 0) return ''; // sem recuo de bloco → não tocar (corpo com só 1ª linha fica intacto)
    const firstAttr = psr.getAttribute('FirstLineIndent');
    const first = firstAttr !== null ? parseFloat(firstAttr) || 0 : def?.first || 0;
    const em = (pt: number) => `${(pt / 12).toFixed(2)}em`;
    let s = `margin-left:${em(left)}`;
    if (first) s += `;text-indent:${em(first)}`; // negativo = hanging (1ª linha sai)
    return ` style="${s}"`;
}

// Traduz SpaceBefore/SpaceAfter (estilo + override do parágrafo, mesmo padrão de indentStyle)
// em p-top/p-bottom — só quando DETECT_SPACING está ligado (opção de importação).
function spacingClasses(psr: Element, fullPS: string): string {
    if (!DETECT_SPACING) return '';
    const def = PARA_INDENTS.get(fullPS);
    const beforeAttr = psr.getAttribute('SpaceBefore');
    const before = beforeAttr !== null ? parseFloat(beforeAttr) || 0 : def?.spaceBefore || 0;
    const afterAttr = psr.getAttribute('SpaceAfter');
    const after = afterAttr !== null ? parseFloat(afterAttr) || 0 : def?.spaceAfter || 0;
    const classes: string[] = [];
    if (before > 0) classes.push('p-top');
    if (after > 0) classes.push('p-bottom');
    return classes.join(' ');
}

export interface SpacingStyleInfo {
    name: string;   // estilo IDML (ex. "RECOLHIDOS", "TXT")
    count: number;  // nº de parágrafos deste estilo com espaçamento
    before: number; // pt (amostra — 1º valor visto; instâncias podem variar ligeiramente)
    after: number;  // pt
}

// Acumula, por estilo, quantos parágrafos têm espaçamento — SpaceBefore/SpaceAfter (estilo/
// override) OU linha em branco manual antes do parágrafo (mesmo sinal que spacingClasses/o
// loop principal de renderStory honram) — sem aplicar nada. Conta como "linha em branco" com
// before=after=0 quando é só esse o sinal (a UI mostra sem valor em pt).
function accumulateSpacing(
    story: Element,
    indents: Map<string, { spaceBefore: number; spaceAfter: number }>,
    acc: Map<string, SpacingStyleInfo>,
): void {
    const dummyCounter: NoteCounter = { n: 0, star: 0, defs: [] }; // scan só — descartado
    let blankBefore = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        const fullPS = psr.getAttribute('AppliedParagraphStyle') || '';
        const name = styleName(fullPS);
        const def = indents.get(fullPS);
        const before = parseFloat(psr.getAttribute('SpaceBefore') || '') || def?.spaceBefore || 0;
        const after = parseFloat(psr.getAttribute('SpaceAfter') || '') || def?.spaceAfter || 0;
        for (const seg of renderPsr(psr, dummyCounter)) {
            if (!seg.text && seg.notes.length === 0) { blankBefore = true; continue; }
            const hasSpacing = before > 0 || after > 0 || blankBefore;
            blankBefore = false;
            if (!hasSpacing || !name) continue;
            let e = acc.get(name);
            if (!e) { e = { name, count: 0, before, after }; acc.set(name, e); }
            e.count++;
        }
    }
}

/**
 * Um <ParagraphStyleRange> agrupa VÁRIOS parágrafos do mesmo estilo, separados por <Br/>
 * (que no IDML é a quebra de parágrafo, não de linha). Devolve um segmento por parágrafo
 * — cada <Br/> fecha o segmento atual. As notas (<Footnote>) ficam no segmento onde a
 * referência aparece. Os marcadores <?ACE?> (auto-número) são nós PI (nodeType≠1) e são
 * naturalmente ignorados.
 */
function renderPsr(psr: Element, counter: NoteCounter): Segment[] {
    const segs: Segment[] = [];
    let cur = '';
    let curNotes: string[] = [];
    const flush = () => { segs.push({ text: cur.trim(), notes: curNotes }); cur = ''; curNotes = []; };
    // FontStyle do estilo de PARÁGRAFO (fallback de mais baixa prioridade): aplica-se aos runs
    // que não definem FontStyle próprio nem via estilo de carácter (ex. marcador "a)" das alíneas
    // num parágrafo Num2 Bold; o corpo, com FontStyle="Roman" explícito, mantém-se roman).
    const paraFS = PARA_INDENTS.get(psr.getAttribute('AppliedParagraphStyle') || '')?.fontStyle || '';

    // Processa os filhos de um CharacterStyleRange (ou de um container como HyperlinkTextSource)
    // recursivamente. Os atributos de formatação (fs/cap/pos) vêm do CharacterStyleRange pai.
    const processChildren = (parent: Element, fs: string, cap: string, pos: string) => {
        for (const child of Array.from(parent.childNodes)) {
            if (child.nodeType !== 1) continue;
            const el = child as Element;
            if (el.tagName === 'Content') {
                let raw = cleanText(el.textContent || '');
                if (cap === 'AllCaps') raw = raw.toUpperCase();
                let t = esc(raw);
                if (cap === 'SmallCaps' && t.trim()) t = `<span class="small-caps">${t}</span>`;
                let piece = withFontStyle(t, fs);
                if (piece.trim()) {
                    if (/Superscript/i.test(pos)) piece = `<sup>${piece}</sup>`;
                    else if (/Subscript/i.test(pos)) piece = `<sub>${piece}</sub>`;
                }
                cur += piece;
            } else if (el.tagName === 'Br') {
                flush(); // quebra de parágrafo
            } else if (el.tagName === 'Footnote') {
                const innerSegs = Array.from(el.children)
                    .filter(c => c.tagName === 'ParagraphStyleRange')
                    .flatMap(p => renderPsr(p, counter));
                const nonEmptySegs = innerSegs.map(s => s.text).filter(Boolean);
                // Notas mistas (ex.: * nota da revisão <Br/> nota numerada): o InDesign coloca
                // ambas dentro do mesmo <Footnote> separadas por <Br/>. Dividimos para manter
                // a estrutura original — asterisco + número no corpo, duas notas separadas.
                const firstIsStar = nonEmptySegs.length > 0 && /^\s*<sup>\*<\/sup>|^\*/.test(nonEmptySegs[0].trim());
                const hasNumberedTail = firstIsStar && nonEmptySegs.length > 1 && !/^\s*<sup>\*<\/sup>|^\*/.test(nonEmptySegs[1].trim());
                if (hasNumberedTail) {
                    counter.star++;
                    const starNum = counter.star;
                    const starBody = nonEmptySegs[0].replace(/^\s*<sup>\*<\/sup>\s*/, '').trim();
                    // Nota mista: no corpo mantém-se só o número; o asterisco é só um marcador
                    // interno da nota de revisão/tradutor.
                    if (cur.endsWith('<sup>*</sup>')) cur = cur.slice(0, -'<sup>*</sup>'.length);
                    curNotes.push(`<p class="footnote" id="footnote-star-${starNum}"><sup>*</sup> ${starBody}</p>`);
                    counter.n++;
                    const num = counter.n;
                    const numBody = nonEmptySegs.slice(1).join(' ').trim();
                    cur += `<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
                    curNotes.push(`<p class="footnote" id="footnote-${num}"><sup>${num}</sup> ${numBody}</p>`);
                } else if (firstIsStar) {
                    counter.star++;
                    const starNum = counter.star;
                    const starBody = nonEmptySegs.join(' ').replace(/^\s*<sup>\*<\/sup>\s*/, '').trim();
                    if (cur.endsWith('<sup>*</sup>')) {
                        cur = cur.slice(0, -'<sup>*</sup>'.length) + `<sup><a href="#footnote-star-${starNum}" class="footnote-ref">*</a></sup>`;
                    } else {
                        cur += `<sup><a href="#footnote-star-${starNum}" class="footnote-ref">*</a></sup>`;
                    }
                    curNotes.push(`<p class="footnote" id="footnote-star-${starNum}"><sup>*</sup> ${starBody}</p>`);
                } else {
                    counter.n++;
                    const num = counter.n;
                    const numBody = nonEmptySegs.join(' ').trim();
                    cur += `<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
                    curNotes.push(`<p class="footnote" id="footnote-${num}"><sup>${num}</sup> ${numBody}</p>`);
                }
            } else if (el.tagName === 'HyperlinkTextSource' || el.tagName === 'CharacterStyleRange') {
                // Índice gerado pelo InDesign: o texto das entradas vive dentro de HyperlinkTextSource,
                // que por sua vez pode envolver CharacterStyleRange. Actualiza os atributos de
                // formatação quando descemos para um CharacterStyleRange interior.
                const childFs = el.getAttribute('FontStyle') || fs;
                const childCap = el.getAttribute('Capitalization') || cap;
                const childPos = el.getAttribute('Position') || pos;
                processChildren(el, childFs, childCap, childPos);
            }
        }
    };

    // Percorre todos os filhos do parágrafo (Properties, CharacterStyleRange,
    // HyperlinkTextSource, etc.). Os CharacterStyleRange interiores fornecem/override
    // a formatação; containers como HyperlinkTextSource apenas reencaminham os filhos.
    for (const child of Array.from(psr.children)) {
        if (child.tagName === 'CharacterStyleRange') {
            const csr = child;
            // FontStyle/Capitalization: atributo do próprio run VENCE; senão herda do estilo de
            // carácter aplicado (CharacterStyle/Bold etc.) — ver CHAR_STYLES/scanCharStyles.
            const acsDef = CHAR_STYLES.get(csr.getAttribute('AppliedCharacterStyle') || '');
            const fs = csr.getAttribute('FontStyle') || acsDef?.fontStyle || paraFS || '';
            // Capitalization do InDesign: SmallCaps (numerais romanos "século xx", "capítulo iv")
            // → <span class="small-caps">; AllCaps → maiúsculas. Sem isto sairiam minúsculos.
            const cap = csr.getAttribute('Capitalization') || acsDef?.cap || '';
            // Position do InDesign: Superscript (ordinais "6.º"/"n.º", o "o" elevado) → <sup>,
            // Subscript → <sub>. Atributo direto do run (ex. ×5732 em "Direito das Migrações")
            // ou herdado do estilo de carácter. As notas (<Footnote>) têm o seu próprio <sup>.
            const pos = csr.getAttribute('Position') || acsDef?.position || '';
            processChildren(csr, fs, cap, pos);
        } else if (child.tagName === 'HyperlinkTextSource') {
            processChildren(child, paraFS, '', '');
        }
    }
    flush();
    return segs; // inclui segmentos vazios (linha em branco = <Br/> duplo); o caller decide
}

// Título "disfarçado" de corpo: alguns títulos (ex. "Índice", "Índice remissivo") usam o
// estilo de parágrafo do corpo (TEXTO) e só se distinguem visualmente — CENTRADOS, texto
// CURTO (uma linha de título, não um parágrafo) e num run maior/mais forte (≥13pt Medium/Bold).
// SpanColumns aparece em alguns (índice remissivo) mas não noutros (índice) → não é exigido.
function isHeuristicTitle(psr: Element): boolean {
    if (psr.getAttribute('Justification') !== 'CenterAlign') return false;
    const txt = (psr.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length > 60) return false; // título é curto; evita parágrafo centrado
    for (const csr of Array.from(psr.getElementsByTagName('CharacterStyleRange'))) {
        const pt = parseFloat(csr.getAttribute('PointSize') || '0');
        const fs = csr.getAttribute('FontStyle') || '';
        if (pt >= 13 && /Medium|Bold|Semibold|Black|Heavy/i.test(fs)) return true;
    }
    return false;
}

function renderStory(xml: string, counter: NoteCounter, mapping: DocxStyleMapping): string {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // Atenção: o root é <idPkg:Story> (localName também "Story"); querySelector('Story')
    // casa por localName e apanharia o root. getElementsByTagName casa o qualified name
    // → devolve o <Story> interno (sem prefixo), que é o que contém os parágrafos.
    const story = doc.getElementsByTagName('Story')[0];
    if (!story) return '';
    const out: string[] = [];
    let pendingLabel = ''; // nº de capítulo/parte à espera do título seguinte
    let inIndexChapter = false; // dentro de um capítulo "Índice"/"Índice remissivo" (título heurístico)
    // Linha em branco manual (segmento vazio) antes de um <p> → também conta como espaçamento
    // (muitos livros usam isto em vez de SpaceBefore/SpaceAfter); só com DETECT_SPACING ligado.
    let blankBefore = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue; // ignora ranges aninhados (notas)
        const fullPS = psr.getAttribute('AppliedParagraphStyle') || '';
        const sn = styleName(fullPS);
        const rawMap = resolveStyle(sn, mapping);
        const segs = renderPsr(psr, counter);

        if (rawMap === 'merge') {
            const text = segs.map(s => s.text).join(' ').trim();
            if (text) pendingLabel = text;
            continue;
        }

        // Título disfarçado de corpo (centrado, ≤60 car, ≥13pt Medium) → h1.
        // Vence a classe de corpo: mesmo que o estilo (ex. TEXTO) tenha sido mapeado para um
        // estilo de parágrafo com classe (p-center, p-indent…), este parágrafo específico é
        // visualmente um título → h1. Só NÃO se aplica se já for heading (h1-6 mapeado à mão).
        const heurTitle = rawMap.tag === 'p' && isHeuristicTitle(psr);

        // Fronteira do capítulo "Índice": abre no título heurístico; fecha em qualquer heading OU
        // numa abertura de capítulo (drop-cap) — senão o flag da TOC "Índice" no início do livro
        // sangrava para o corpo seguinte e despia a classe drop-cap (partindo o insertTitleBlocks).
        if (heurTitle) inIndexChapter = true;
        else if (/^h[1-6]$/.test(rawMap.tag) || rawMap.cls === 'drop-cap') inIndexChapter = false;

        // Corpo DENTRO do índice não herda o estilo de import mapeado → auto (corpo simples + LeftIndent).
        const indexBody = inIndexChapter && !heurTitle && rawMap.tag === 'p';
        const map = indexBody ? { tag: 'p' as const } : rawMap;
        // Honrar o LeftIndent do IDML só em <p> PLANO e NÃO mapeado (estilo escolhido vence; índice = auto).
        const mapped = !indexBody && !!(mapping[sn] && mapping[sn].target !== 'auto');
        const { tag, cls } = heurTitle ? { tag: 'h1' as const, cls: '' } : map;
        const spacing = tag === 'p' ? spacingClasses(psr, fullPS) : '';
        const baseClasses = [cls, spacing].filter(Boolean);
        const styleAttr = (!cls && tag === 'p' && !mapped) ? indentStyle(psr, fullPS) : '';

        if (/^h[1-6]$/.test(tag)) {
            // TÍTULO: o <Br/> é quebra de LINHA (número + título), não de parágrafo → UM só heading.
            // Juntar os segmentos com <br> (o split de capítulos troca <br> por espaço no TOC).
            let body = segs.map(s => s.text).filter(Boolean).join('<br>');
            if (!body && segs.every(s => s.notes.length === 0)) continue;
            if (pendingLabel) { body = `${pendingLabel}<br>${body}`; pendingLabel = ''; }
            const attr = baseClasses.length ? ` class="${baseClasses.join(' ')}"` : '';
            out.push(`<${tag}${attr}>${body}</${tag}>`);
            for (const seg of segs) for (const def of seg.notes) out.push(def);
            blankBefore = false; // título consome a linha em branco anterior
            continue;
        }

        for (const seg of segs) {
            if (!seg.text && seg.notes.length === 0) { blankBefore = true; continue; } // linha em branco
            // Linha em branco antes deste parágrafo → também conta como espaçamento (p-top),
            // tal como SpaceBefore/SpaceAfter (spacingClasses) — mesmo gate DETECT_SPACING.
            const blankTop = (DETECT_SPACING && blankBefore && tag === 'p') ? 'p-top' : '';
            blankBefore = false;
            const classes = blankTop ? [...baseClasses, blankTop] : baseClasses;
            const attr = (classes.length ? ` class="${classes.join(' ')}"` : '') + styleAttr;
            out.push(`<${tag}${attr}>${seg.text}</${tag}>`);
            // definições de nota logo a seguir ao parágrafo que as referencia (mesmo capítulo)
            for (const def of seg.notes) out.push(def);
        }
    }
    if (pendingLabel) out.push(`<h1>${pendingLabel}</h1>`);
    return out.join('\n');
}

// A Ficha Técnica (colofão) é uma story sem estilo nomeado (NormalParagraphStyle), por isso
// o filtro narrativo dropa-a. Deteta-se pelo boilerplate de copyright da Almedina/ISBN —
// frases que só aparecem no colofão (baixo risco de falso positivo).
function isFichaTecnica(xml: string): boolean {
    return /Direitos reservados|Dep[óo]sito Legal|T[íi]tulo original/i.test(xml);
}

// Índice de Figuras/Tabelas: página real do miolo que repete o texto de cada legenda
// (nº + título) como lista simples. Sem isto, as suas entradas (mesmo texto "Figura N.")
// roubam a correspondência a insertFigures/placeInlineFigures/placeNumberedFigures, por
// aparecerem primeiro no documento. Deteta-se pela 1ª linha não-vazia da story.
const INDICE_FIG_TAB_RE = /^(índice|lista)\s+de\s+(figuras|tabelas|quadros|gr[áa]ficos)/i;
function isIndiceFigurasTabelas(xml: string): boolean {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return false;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(psr, throwaway)) {
            const t = seg.text.replace(/<[^>]+>/g, '').trim();
            if (!t) continue;
            return INDICE_FIG_TAB_RE.test(t);
        }
    }
    return false;
}

// Renderiza a Ficha Técnica como capítulo próprio no topo, preservando a ESTRUTURA do IDML:
// uma linha = um parágrafo (p-small, sem indentação), alinhado à esquerda; as linhas em branco
// entre grupos (separação dos blocos Título/Tradução/ISBN/Editora) vêm como <Br/> duplo
// (segmento vazio) → reproduzidas com p-top (margem superior) no 1º parágrafo do grupo seguinte,
// em vez de <p> vazios. Itálico do título original preservado pelo renderPsr.
function renderFicha(xml: string, counter: NoteCounter): string {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return '';
    const out = ['<h2 class="chapter-break">Ficha Técnica</h2>'];
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        let blankBefore = false;
        for (const seg of renderPsr(psr, counter)) {
            if (!seg.text) { blankBefore = true; continue; } // linha em branco → espaçamento de grupo
            const cls = `p-small p-non-indent${blankBefore ? ' p-top' : ''}`;
            out.push(`<p class="${cls}">${seg.text}</p>`);
            blankBefore = false;
        }
    }
    return out.join('\n');
}

// Bullet literal "•" no início de parágrafos TEXTO (o IDML não tem auto-numbering) → lista.
// O marcador REAL vem com espaco a seguir (bullet + em-space + texto); o bullet colado a
// ("•, tais como") é ruído a meio de frase → o \s+ exclui-o.
const BULLET_RE = /^\s*[•●▪◦‣·]\s+/;
// Strip do marcador do 1º text node: o espaço a seguir ao "•" pode estar no elemento
// seguinte (ex.: "•<em> Fórmulas"), deixando este text node só com "•" → espaço opcional.
const BULLET_STRIP_RE = /^\s*[•●▪◦‣·]\s*/;

// Agrupa <p> consecutivos começados por "• " num <ul><li> real (TinyMCE suporta nativamente).
// Bullet detetado VENCE: converte-se sempre para lista, descartando classe/estilo do <p>
// (li.innerHTML = só o conteúdo) — "se é bullet, mantém-se bullet, sem estilo aplicado".
const isPlainBullet = (el: Element) =>
    el.tagName === 'P' && BULLET_RE.test(el.textContent || '');

function convertBulletParagraphs(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let node = doc.body.firstElementChild;
    while (node) {
        if (isPlainBullet(node)) {
            const ul = doc.createElement('ul');
            node.parentNode!.insertBefore(ul, node);
            let cur: Element | null = node;
            while (cur && isPlainBullet(cur)) {
                const next: Element | null = cur.nextElementSibling;
                // tirar o marcador do 1º text node (o "• " precede o <em>/<strong> do rótulo)
                const walker = doc.createTreeWalker(cur, NodeFilter.SHOW_TEXT);
                const tn = walker.nextNode();
                if (tn) tn.textContent = (tn.textContent || '').replace(BULLET_STRIP_RE, '');
                const li = doc.createElement('li');
                li.innerHTML = cur.innerHTML; // preserva itálico/negrito/notas do item
                ul.appendChild(li);
                cur.remove();
                cur = next;
            }
            node = ul.nextElementSibling;
        } else {
            node = node.nextElementSibling;
        }
    }
    return doc.body.innerHTML;
}

// ponytail: coletânea heurística (HBR e afins) — numa coletânea cada artigo tem o
// TÍTULO numa story SEPARADA de um só frame, estilo do corpo (TEXTO), com 3 parágrafos:
// número / título / autores. O filtro narrativo dropa-as. Detetam-se por: single-frame +
// 1º parágrafo não-vazio = nº inteiro. As aberturas de corpo são parágrafos CAPITULAR.
// Casa-se o N-ésimo título (por nº) com a N-ésima abertura, por ordem (1:1).
// Ceiling: assume 1 CAPITULAR por artigo e títulos numerados sequenciais.

// A 1ª linha não-vazia é só um número inteiro? (linha = segmento; um PSR pode agrupar
// número/título/autores separados por <Br/> — daí usar renderPsr, não psr.textContent.)
function titleBlockNum(xml: string): number | null {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return null;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(psr, throwaway)) {
            const t = seg.text.replace(/<[^>]+>/g, '').trim();
            if (!t) continue;
            return /^\d+$/.test(t) ? parseInt(t) : null; // 1ª linha com texto decide
        }
    }
    return null;
}

// Renderiza o bloco de título: nº + título → <h1> simples (modelo 0.9.3.4+: o marcador
// chapter-break-h1 é inserido ANTES pelo insertChapterMarkers e o heading fica intacto;
// um <h1 class="chapter-break"> seria tratado como quebra SEM título e o texto sumiria).
// Parágrafos restantes (autores) → <p class="p-small p-non-indent">.
function renderTitleBlock(xml: string, counter: NoteCounter): string {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return '';
    const lines: string[] = [];
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(psr, counter)) if (seg.text) lines.push(seg.text);
    }
    if (lines.length === 0) return '';
    const heading = lines.slice(0, 2).join('<br>'); // [0]=nº, [1]=título
    const rest = lines.slice(2).map(l => `<p class="p-small p-non-indent">${l}</p>`);
    return [`<h1>${heading}</h1>`, ...rest].join('\n');
}

// Marca cada bloco de topo de uma story Índice de Figuras/Tabelas (renderStory produz
// sempre blocos planos, sem nesting) para insertFigures/placeInlineFigures/placeNumberedFigures
// os poderem excluir dos alvos de correspondência.
function markIndiceBlocks(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of Array.from(doc.body.children)) el.setAttribute('data-indice', '1');
    return doc.body.innerHTML;
}

// Insere cada bloco de título (ordenado por nº) ANTES da N-ésima abertura de artigo
// (p.drop-cap), por ordem de documento. min(títulos, aberturas); extras ficam de fora.
function insertTitleBlocks(html: string, blocks: { num: number; html: string }[]): { html: string; placed: number } {
    if (blocks.length === 0) return { html, placed: 0 };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const starts = Array.from(doc.body.querySelectorAll('p.drop-cap'));
    if (starts.length === 0) return { html, placed: 0 };
    const ordered = [...blocks].sort((a, b) => a.num - b.num);
    let placed = 0;
    for (let i = 0; i < ordered.length && i < starts.length; i++) {
        const start = starts[i];
        const frag = doc.createElement('div');
        frag.innerHTML = ordered[i].html;
        while (frag.firstChild) start.parentNode!.insertBefore(frag.firstChild, start);
        placed++;
    }
    return { html: doc.body.innerHTML, placed };
}

// O InDesign gera o TOC dividido em duas stories: uma com os textos (HyperlinkTextSource)
// e outra com os números de página. Esta última é uma coluna de números inteiros —
// descarta-la, senão o índice fica ainda pior (números soltos sem respetivos títulos).
function isTocPageNumberColumn(xml: string): boolean {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const story = doc.getElementsByTagName('Story')[0];
    if (!story) return false;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    let hasText = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(psr, throwaway)) {
            const t = seg.text.replace(/<[^>]+>/g, '').trim();
            if (!t) continue;
            hasText = true;
            if (!/^\d+$/.test(t)) return false;
        }
    }
    return hasText;
}

// Epígrafes/citações de abertura: story de 1 frame, sem estilo estrutural, mas com
// recuo de bloco (LeftIndent) no primeiro parágrafo. Ex.: citação de Keynes no início.
function isBlockQuoteStory(xml: string): boolean {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const story = doc.getElementsByTagName('Story')[0];
    if (!story) return false;
    const firstPsr = Array.from(story.children).find(c => c.tagName === 'ParagraphStyleRange');
    if (!firstPsr) return false;
    const left = parseFloat(firstPsr.getAttribute('LeftIndent') || '') || 0;
    return left > 30;
}

/**
 * Ordem de leitura: designmap lista os Spreads por ordem do livro; cada Spread tem
 * TextFrames com ParentStory na ordem do documento. Recolhemos as stories pela 1ª
 * aparição (dedupe) e contamos os frames por story.
 */
async function readingOrder(zip: JSZip): Promise<{ ordered: string[]; frameCount: Map<string, number> }> {
    const designmap = await zip.file('designmap.xml')?.async('string') ?? '';
    const spreadFiles = [...designmap.matchAll(/<idPkg:Spread src="([^"]+)"/g)].map(m => m[1]);
    const ordered: string[] = [];
    const seen = new Set<string>();
    const frameCount = new Map<string, number>();
    for (const sf of spreadFiles) {
        const xml = await zip.file(sf)?.async('string');
        if (!xml) continue;
        for (const m of xml.matchAll(/<TextFrame\b[^>]*ParentStory="([^"]+)"/g)) {
            const id = m[1];
            frameCount.set(id, (frameCount.get(id) || 0) + 1);
            if (!seen.has(id)) { seen.add(id); ordered.push(id); }
        }
    }
    return { ordered, frameCount };
}

export async function extractIdml(file: File, options: { styleMapping?: DocxStyleMapping; pdf?: ArrayBuffer; detectParagraphSpacing?: boolean } = {}): Promise<ExtractedDocument> {
    const { idmlZips, links, pdf: zipPdf } = await loadIdmlPackage(file);
    const pdf = options.pdf ?? zipPdf;
    const mapping = options.styleMapping ?? {};
    DETECT_SPACING = options.detectParagraphSpacing ?? false;
    const counter: NoteCounter = { n: 0, star: 0, defs: [] }; // numeração de notas contínua entre IDMLs
    const parts: string[] = [];
    const titleBlocks: { num: number; html: string }[] = []; // títulos de artigo (coletânea)
    let fichaDone = false;

    // Livros divididos em vários docs InDesign → processar cada .idml por ordem e concatenar.
    for (const idmlZip of idmlZips) {
        CHAR_STYLES = await scanCharStyles(idmlZip); // negrito/itálico/versaletes por estilo de carácter
        PARA_INDENTS = await scanParaIndents(idmlZip); // recuo de bloco (LeftIndent) por estilo de parágrafo
        const { ordered, frameCount } = await readingOrder(idmlZip);
        for (const storyId of ordered) {
            const xml = await idmlZip.file(`Stories/Story_${storyId}.xml`)?.async('string');
            if (!xml) continue;
            // Ficha Técnica (colofão): capítulo próprio, uma só vez (pode repetir-se entre IDMLs).
            if (isFichaTecnica(xml)) { if (!fichaDone) { parts.push(renderFicha(xml, counter)); fichaDone = true; } continue; }
            // Incluir só fluxos narrativos: threaded (vários frames) OU com estilo estrutural.
            const threaded = (frameCount.get(storyId) || 0) > 1;
            // Índice: o InDesign separa a coluna de números de página numa story própria.
            if (threaded && isTocPageNumberColumn(xml)) continue;
            if (isIndiceFigurasTabelas(xml)) {
                const html = renderStory(xml, counter, mapping);
                if (html) parts.push(markIndiceBlocks(html));
                continue;
            }
            // Legenda de figura (estilo "Figura titulo"): story de frame único ancorada junto à
            // imagem. Ao contrário de LEGENDAS (outros livros, casada por referência textual —
            // "regra do livro" em insertFigures), aqui a posição natural no fluxo É a posição
            // certa; dropá-la faz a legenda desaparecer do corpo (só sobrevive no Índice).
            if (FIGURA_TITULO_RE.test(xml)) {
                const html = renderStory(xml, counter, mapping);
                if (html) parts.push(html);
                continue;
            }
            if (!threaded && !STRUCTURAL_STYLES.test(xml)) {
                // Epígrafe/citação de abertura (story 1 frame com recuo de bloco).
                if (isBlockQuoteStory(xml)) {
                    const html = renderStory(xml, counter, mapping);
                    if (html) parts.push(html);
                    continue;
                }
                // Bloco de título de coletânea (story 1-frame, 1º parágrafo = nº)? Recupera-o.
                const num = titleBlockNum(xml);
                if (num !== null) { const h = renderTitleBlock(xml, counter); if (h) titleBlocks.push({ num, html: h }); }
                continue;
            }
            const html = renderStory(xml, counter, mapping);
            if (html) parts.push(html);
        }
    }

    // Imagens da Links/ → só galeria (nome original preservado); não referenciadas no HTML.
    const images = new Map<string, Blob>();
    for (const { name, blob } of links) images.set(sanitizeImageFilename(name).imageId, blob);

    let html = parts.join('\n');
    // Bullets literais "•" → lista <ul><li> real.
    html = convertBulletParagraphs(html);
    // Coletânea: inserir cada título de artigo antes da sua abertura (p.drop-cap), por ordem.
    html = insertTitleBlocks(html, titleBlocks).html;
    let pageBreaks: { inserted: number; total: number } | undefined;
    // Page-list: alinhar as páginas do PDF de impressão ao texto e inserir marcadores.
    if (pdf) {
        const anchors = await extractPdfPageAnchors(pdf);
        const res = insertPageBreaks(html, anchors);
        html = res.html;
        pageBreaks = { inserted: res.inserted, total: res.total };
    }
    // Figuras: imagem/tabela + legenda no ponto da referência no corpo (todos os IDMLs).
    const figs: Awaited<ReturnType<typeof buildFigures>> = [];
    for (const idmlZip of idmlZips) figs.push(...await buildFigures(idmlZip));
    const figRes = insertFigures(html, figs);
    html = figRes.html;

    // Livros com legenda INLINE no corpo ("Figura N:") — imagem antes da legenda, por ordem.
    const inlineRes = placeInlineFigures(html, [...images.keys()]);
    html = inlineRes.html;

    // Figuras com legenda DENTRO da imagem (EPS) — colocar pela referência "Figura N" no corpo.
    const usedIds = new Set([...html.matchAll(/data-image-id="([^"]+)"/g)].map(m => m[1]));
    const numberedRes = placeNumberedFigures(html, [...images.keys()].filter(id => !usedIds.has(id)));
    html = numberedRes.html;

    return { html, images, pageBreaks, figuresPlaced: figRes.placed + inlineRes.placed + numberedRes.placed };
}

// Sugestão de destino por nome de estilo IDML (espelha o STYLE_MAP); 'auto' = usar o
// default interno (inclui o 'merge' dos números de capítulo/parte e a classe legenda).
const IDML_SUGGEST: Record<string, DocxStyleTarget> = {
    'TXT': 'p',
    'RECOLHIDOS': 'p-quote',
    'CAPÍTULOS_TÍTULOS': 'h1',
    'PARTES_TIT': 'h1',
    'CAPÍTULOS_TIT 2': 'h2',
    'SUBTÍTULOS 1': 'h2',
    'SUBTÍTULOS 2': 'h3',
    'LEGENDAS': 'p-legendas',
};

/**
 * Enumera os estilos de parágrafo de TOPO usados no IDML (exclui NOTAS, que vivem só
 * dentro de <Footnote> inline) — com contagem, exemplo e destino sugerido. Alimenta a
 * modal de mapeamento de estilos para o utilizador escolher o alvo no editor.
 */
export interface IdmlScanResult {
    styles: DocxStyleInfo[];
    spacing: SpacingStyleInfo[]; // breakdown por estilo (vazio = nada detetado)
}

export async function scanIdmlStyles(file: File): Promise<IdmlScanResult> {
    try {
        const { idmlZips } = await loadIdmlPackage(file);
        const used = new Map<string, { count: number; sample: string }>();
        const spacingAcc = new Map<string, SpacingStyleInfo>();
        for (const idmlZip of idmlZips) {
            const { ordered, frameCount } = await readingOrder(idmlZip);
            const indents = await scanParaIndents(idmlZip);
            for (const storyId of ordered) {
                const xml = await idmlZip.file(`Stories/Story_${storyId}.xml`)?.async('string');
                if (!xml) continue;
                const threaded = (frameCount.get(storyId) || 0) > 1;
                if (!threaded && !STRUCTURAL_STYLES.test(xml)) continue;
                const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
                if (!story) continue;
                accumulateSpacing(story, indents, spacingAcc);
                for (const psr of Array.from(story.children)) {
                    if (psr.tagName !== 'ParagraphStyleRange') continue;
                    const name = styleName(psr.getAttribute('AppliedParagraphStyle'));
                    if (!name) continue;
                    let e = used.get(name);
                    if (!e) { e = { count: 0, sample: '' }; used.set(name, e); }
                    e.count++;
                    if (!e.sample) e.sample = (psr.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
                }
            }
        }
        const styles = [...used].map(([name, { count, sample }]) => ({
            styleId: name, name, count, sample,
            suggested: IDML_SUGGEST[name] ?? 'auto', suggestedCentered: false,
        })).sort((a, b) => b.count - a.count);
        const spacing = [...spacingAcc.values()].sort((a, b) => b.count - a.count);
        return { styles, spacing };
    } catch (err) {
        console.error('scanIdmlStyles falhou', err);
        return { styles: [], spacing: [] };
    }
}
