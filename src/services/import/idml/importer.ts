import JSZip from 'jszip';
import { sanitizeImageFilename } from '../../../utils/format';
import { extractPdfPageAnchors, insertPageBreaks, pdfToJpeg, extractChapterAnchors, insertChapterHeadings, verifyBlankSpacing, getPdfPageCount } from '../../page-list/page-list';
import { buildFigures, insertFigures, placeInlineFigures, placeNumberedFigures, placeFiguresByPosition, toRasterName } from './figures';
import type { ExtractedDocument, DocxStyleInfo, DocxStyleTarget, DocxStyleMapping } from '../document-importer';
import { readIdmlStyles } from './styles';
import { unboxWhite, BOXED_H1_OPEN } from './boxed';
import {
    renderPsr, renderStory, adoptTableNoteRefs, isHeuristicTitle, accumulateSpacing, hasUserMappedStyle, styleName,
    type RenderContext, type NoteCounter, type SpacingStyleInfo,
} from './story';

const RASTER_RE = /\.(jpe?g|png|gif|tiff?|webp)$/i;
const CONVERTIBLE_RE = /\.(pdf|eps|psd)$/i;
const MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp',
};

/**
 * Carrega o pacote IDML. O ficheiro pode ser:
 *  - um `.idml` (que JÁ é um zip com designmap.xml à raiz) → sem imagens;
 *  - um `.zip` da pasta do InDesign (Folder/Os Retornados.idml + Folder/Links/*.jpg|png) →
 *    devolve o idml interno + os bytes das imagens da Links/ (para a galeria).
 * `.pdf`/`.eps`/`.psd` são convertidos (JPEG/PNG); `__MACOSX`/`._*` (lixo macOS), `.indd` e
 * fontes são ignorados.
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
        } else if (/\.psd$/i.test(base)) {
            // figura em PSD (Photoshop) → enviar CRU; o servidor rasteriza com ImageMagick
            // (mesmo padrão do EPS/Ghostscript). Nome normalizado p/ .png; o tipo assinala ao
            // upload para mandar como .psd.
            links.push({ name: base.replace(/\.psd$/i, '.png'), blob: await entry.async('blob').then(b => b.slice(0, b.size, 'image/vnd.adobe.photoshop')) });
        }
    }

    // PDF de impressão (miolo) — fora de Links/; preferir o que tem "miolo" no nome.
    const pdfEntries = Object.values(outer.files).filter(f =>
        !f.dir && /\.pdf$/i.test(f.name) && !/\/Links\//.test(f.name) && !f.name.includes('__MACOSX'));
    let pdfEntry = pdfEntries.find(f => /miolo/i.test(f.name)) ?? pdfEntries[0];
    // Alguns pacotes trazem o miolo DENTRO de Links/ (sem "miolo" no nome, ao lado das figuras
    // reais) — sem isto ficava sem PDF nenhum e page-list/espaçamento/âncoras de capítulo nunca
    // aplicavam. Só nº de páginas distingue o miolo (~centenas) de uma figura em PDF (1-2
    // páginas); >5 é margem de segurança para não apanhar uma figura multi-página à toa.
    if (!pdfEntry) {
        const linksPdfs = Object.values(outer.files).filter(f =>
            !f.dir && /\.pdf$/i.test(f.name) && /\/Links\//.test(f.name) && !f.name.includes('__MACOSX'));
        let bestPages = 5;
        for (const f of linksPdfs) {
            const pages = await getPdfPageCount(await f.async('arraybuffer')).catch(() => 0);
            if (pages > bestPages) { bestPages = pages; pdfEntry = f; }
        }
    }
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

// Estilos que marcam um fluxo NARRATIVO (não célula de tabela / rótulo de gráfico).
// Uma story com algum destes é incluída mesmo que caiba num só frame.
// Case-insensitive: os estilos no IDML podem vir como "Notas", "Notas manuais", etc.
const STRUCTURAL_STYLES = /ParagraphStyle\/(CAPÍTULOS|PARTES|SUBTÍTULOS|NOTAS|RECOLHIDOS)/i;

// Estilo de legenda de figura usado por alguns livros ("Figura titulo"), com caption+imagem
// na MESMA story de frame único — ver uso em extractIdml.
const FIGURA_TITULO_RE = /ParagraphStyle\/Figura\s*t[íi]tulo/i;

// o filtro narrativo dropa-a. Deteta-se pelo boilerplate de copyright da Almedina/ISBN —
// frases que só aparecem no colofão. Falso positivo real: em livros onde o corpo INTEIRO é
// uma única story threaded (comum em InDesign), uma citação bibliográfica na REFERÊNCIAS
// ("...o título original é...") casa a frase a meio de 900KB de texto — a story inteira
// (Índice+capítulos) era então descartada como "ficha duplicada" (fichaDone já true).
// !STRUCTURAL_STYLES exclui isso: o colofão nunca usa estilos de título/nota — se a story
// tem qualquer CAPÍTULOS/PARTES/SUBTÍTULOS/NOTAS/RECOLHIDOS, não é o colofão.
function isFichaTecnica(xml: string): boolean {
    return !STRUCTURAL_STYLES.test(xml) && /Direitos reservados|Dep[óo]sito Legal|T[íi]tulo original/i.test(xml);
}

// Índice de Figuras/Tabelas: página real do miolo que repete o texto de cada legenda
// (nº + título) como lista simples. Sem isto, as suas entradas (mesmo texto "Figura N.")
// roubam a correspondência a insertFigures/placeInlineFigures/placeNumberedFigures, por
// aparecerem primeiro no documento. Deteta-se pela 1ª linha não-vazia da story.
const INDICE_FIG_TAB_RE = /^(índice|lista)\s+de\s+(figuras|tabelas|quadros|gr[áa]ficos)/i;
function isIndiceFigurasTabelas(rc: RenderContext, xml: string): boolean {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return false;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(rc, psr, throwaway)) {
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
function renderFicha(rc: RenderContext, xml: string, counter: NoteCounter): string {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return '';
    const out = ['<h2 class="chapter-break">Ficha Técnica</h2>'];
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        let blankBefore = false;
        for (const seg of renderPsr(rc, psr, counter)) {
            if (!seg.text) { blankBefore = true; continue; } // linha em branco → espaçamento de grupo
            const cls = `p-small p-non-indent${blankBefore ? ' p-top' : ''}`;
            out.push(`<p class="${cls}">${seg.text}</p>`);
            blankBefore = false;
        }
    }
    return out.join('\n');
}

// Frontespício: capa/rosto solto nas primeiras páginas, antes da Ficha Técnica — imagens sem
// TextFrame (readingOrder recolhe-as) + texto solto heurístico (ver ramo !fichaDone no loop
// principal). Bloco próprio (chapter-break), sem heading real (não é capítulo de conteúdo).
function renderFrontMatter(imageIds: string[], texts: string[]): string {
    if (imageIds.length === 0 && texts.length === 0) return '';
    const out = ['<p class="chapter-break" data-title="Frontespício"></p>'];
    // O mesmo rosto/capa aparece muitas vezes em mais do que 1 spread do InDesign (ex. duas
    // páginas de layout espelhado) — readingOrder devolve um id por spread, sem deduplicar;
    // sem isto, a mesma imagem entrava 2x no frontespício.
    for (const id of new Set(imageIds)) out.push(`<p class="p-center"><img data-image-id="${id}" src="placeholder" alt="" /></p>`);
    out.push(...texts);
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

// Numeral romano ("II", "XIII") → inteiro; usado por livros que numeram capítulos assim
// (ex. "A Arte da Guerra") em vez de nº arábico.
function romanToInt(s: string): number | null {
    const VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const v = VALUES[s[i]];
        if (!v) return null;
        const next = VALUES[s[i + 1]];
        total += next && v < next ? -v : v;
    }
    return total || null;
}

// A 1ª linha não-vazia é só um número (arábico ou romano)? (linha = segmento; um PSR pode
// agrupar número/título/autores separados por <Br/> — daí usar renderPsr, não psr.textContent.)
function titleBlockNum(rc: RenderContext, xml: string): number | null {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return null;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(rc, psr, throwaway)) {
            const t = seg.text.replace(/<[^>]+>/g, '').trim();
            if (!t) continue;
            if (/^\d+$/.test(t)) return parseInt(t); // 1ª linha com texto decide
            if (/^[IVXLCDM]+$/i.test(t)) return romanToInt(t.toUpperCase());
            return null;
        }
    }
    return null;
}

// nº (linha 1) + título (linha 2) juntos — chave de pesquisa no PDF (livros sem CAPITULAR,
// ver extractChapterAnchors): o título sozinho pode ser uma frase comum que ocorre à-toa no
// corpo (ex. "A guerra" num livro sobre guerra); "II A guerra" junto só ocorre na página de
// abertura (e no Índice, filtrado à parte por conter também os OUTROS títulos).
const PART_TITLE_RE = /^parte\s+([ivxlcdm]+|\d+)\b/i;

function titleBlockSearchKey(rc: RenderContext, xml: string): string {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return '';
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    const lines: string[] = [];
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(rc, psr, throwaway)) {
            const t = seg.text.replace(/<[^>]+>/g, '').trim();
            if (t) lines.push(t);
        }
    }
    return lines.slice(0, 2).join(' ');
}

// Renderiza o bloco de título: nº + título → <h1> simples (modelo 0.9.3.4+: o marcador
// chapter-break-h1 é inserido ANTES pelo insertChapterMarkers e o heading fica intacto;
// um <h1 class="chapter-break"> seria tratado como quebra SEM título e o texto sumiria).
// Parágrafos restantes (autores) → <p class="p-small p-non-indent">.
function renderTitleBlock(rc: RenderContext, xml: string, counter: NoteCounter, boxed = false): string {
    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
    if (!story) return '';
    const lines: string[] = [];
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(rc, psr, counter)) if (seg.text) lines.push(seg.text);
    }
    if (lines.length === 0) return '';
    // Dentro da caixa preta do InDesign (boxed): o h1 todo leva o fundo preto e o texto branco herda dele. Senão o texto
    // a branco (sobre o Rectangle, que não vem na story) ficaria invisível: sai com a cor do corpo (ver boxed.ts).
    const heading = lines.slice(0, 2).map(l => unboxWhite(l, boxed)).join('<br>'); // [0]=nº, [1]=título
    const rest = lines.slice(2).map(l => `<p class="p-small p-non-indent">${l}</p>`);
    const h1 = boxed ? BOXED_H1_OPEN : '<h1>';
    return [`${h1}${heading}</h1>`, ...rest].join('\n');
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
function isTocPageNumberColumn(rc: RenderContext, xml: string): boolean {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const story = doc.getElementsByTagName('Story')[0];
    if (!story) return false;
    const throwaway: NoteCounter = { n: 0, star: 0, defs: [] };
    let hasText = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        for (const seg of renderPsr(rc, psr, throwaway)) {
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
 *
 * `frontImageNames`: nomes de imagem (LinkResourceURI) das spreads ANTES da 1ª com
 * qualquer TextFrame — capa/rosto soltos (Rectangle sem texto, ex. PDF de página inteira),
 * hoje invisíveis ao corpo. Janela fecha assim que aparece o 1º TextFrame do livro.
 */
// Limites de cada frame/rectângulo de uma spread (ItemTransform + 1.º e 3.º ponto do caminho). Sem rotação: chega
// para caixas direitas.
function shapeBounds(xml: string, tag: 'TextFrame' | 'Rectangle'): { attrs: string; box: string }[] {
    const out: { attrs: string; box: string }[] = [];
    for (const m of xml.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
        const t = /\bItemTransform="([^"]*)"/.exec(m[1])?.[1].split(' ').map(Number) ?? [1, 0, 0, 1, 0, 0];
        const pts = [...xml.slice(m.index! + m[0].length, m.index! + m[0].length + 1500).matchAll(/Anchor="([-\d.e]+) ([-\d.e]+)"/g)].slice(0, 4);
        if (pts.length < 3) continue;
        const xs = pts.map(p => +p[1] + t[4]), ys = pts.map(p => +p[2] + t[5]);
        out.push({ attrs: m[1], box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round).join(',') });
    }
    return out;
}

// Stories dentro de uma caixa preta: um Rectangle preenchido a preto com exatamente os limites do TextFrame (o texto
// a branco por cima — o preto não vem na story).
function blackBoxedStories(xml: string): string[] {
    const black = new Set(shapeBounds(xml, 'Rectangle').filter(r => /\bFillColor="Color\/Black"/.test(r.attrs)).map(r => r.box));
    if (black.size === 0) return [];
    return shapeBounds(xml, 'TextFrame').filter(f => black.has(f.box)).flatMap(f => /\bParentStory="([^"]+)"/.exec(f.attrs)?.[1] ?? []);
}

async function readingOrder(zip: JSZip): Promise<{ ordered: string[]; frameCount: Map<string, number>; frontImageNames: string[]; boxed: Set<string> }> {
    const designmap = await zip.file('designmap.xml')?.async('string') ?? '';
    const spreadFiles = [...designmap.matchAll(/<idPkg:Spread src="([^"]+)"/g)].map(m => m[1]);
    const ordered: string[] = [];
    const seen = new Set<string>();
    const frameCount = new Map<string, number>();
    const frontImageNames: string[] = [];
    const boxed = new Set<string>();
    let contentStarted = false;
    for (const sf of spreadFiles) {
        const xml = await zip.file(sf)?.async('string');
        if (!xml) continue;
        const frames = [...xml.matchAll(/<TextFrame\b[^>]*ParentStory="([^"]+)"/g)];
        if (!contentStarted && frames.length === 0) {
            for (const m of xml.matchAll(/LinkResourceURI="([^"]*)"/g)) {
                const name = decodeURIComponent(m[1].split('/').pop() || '');
                if (RASTER_RE.test(name) || CONVERTIBLE_RE.test(name)) frontImageNames.push(name);
            }
            continue;
        }
        contentStarted = true;
        for (const id of blackBoxedStories(xml)) boxed.add(id);
        for (const m of frames) {
            const id = m[1];
            frameCount.set(id, (frameCount.get(id) || 0) + 1);
            if (!seen.has(id)) { seen.add(id); ordered.push(id); }
        }
    }
    return { ordered, frameCount, frontImageNames, boxed };
}

export async function extractIdml(file: File, options: { styleMapping?: DocxStyleMapping; pdf?: ArrayBuffer; detectParagraphSpacing?: boolean } = {}): Promise<ExtractedDocument> {
    const { idmlZips, links, pdf: zipPdf } = await loadIdmlPackage(file);
    const pdf = options.pdf ?? zipPdf;
    const mapping = options.styleMapping ?? {};
    const detectSpacing = options.detectParagraphSpacing ?? false;
    const counter: NoteCounter = { n: 0, star: 0, defs: [] }; // numeração de notas contínua entre IDMLs
    const parts: string[] = [];
    const titleBlocks: { num: number; html: string; searchKey: string }[] = []; // títulos de artigo (coletânea)
    const frontImageIds: string[] = []; // frontespício: imagens (capa/rosto) antes da Ficha Técnica
    const frontTexts: string[] = []; // frontespício: texto solto heurístico (título vivo, caso raro)
    const partBlocks: { html: string; searchKey: string }[] = []; // divisórias "PARTE N" a repor por âncora do PDF
    let fichaDone = false;

    // Livros divididos em vários docs InDesign → processar cada .idml por ordem e concatenar.
    for (const idmlZip of idmlZips) {
        // estilos deste pacote (negrito/itálico/versaletes, recuos, cores de células) + opção de espaçamento
        const rc: RenderContext = { styles: await readIdmlStyles(idmlZip), detectSpacing };
        const { ordered, frameCount, frontImageNames, boxed } = await readingOrder(idmlZip);
        // só interessa antes da 1ª Ficha Técnica encontrada (normalmente tudo no 1º .idml).
        if (!fichaDone) frontImageIds.push(...frontImageNames.map(name => sanitizeImageFilename(toRasterName(name)).imageId));
        for (const storyId of ordered) {
            const xml = await idmlZip.file(`Stories/Story_${storyId}.xml`)?.async('string');
            if (!xml) continue;
            // Ficha Técnica (colofão): capítulo próprio, uma só vez (pode repetir-se entre IDMLs).
            // Frontespício (capa/rosto/logo) vai logo antes, no 1º momento em que a Ficha surge.
            if (isFichaTecnica(xml)) {
                if (!fichaDone) {
                    const front = renderFrontMatter(frontImageIds, frontTexts);
                    if (front) parts.push(front);
                    parts.push(renderFicha(rc, xml, counter));
                    fichaDone = true;
                }
                continue;
            }
            // Incluir só fluxos narrativos: threaded (vários frames) OU com estilo estrutural.
            const threaded = (frameCount.get(storyId) || 0) > 1;
            // Índice: o InDesign separa a coluna de números de página numa story própria.
            if (threaded && isTocPageNumberColumn(rc, xml)) continue;
            if (isIndiceFigurasTabelas(rc, xml)) {
                const html = renderStory(rc, xml, counter, mapping);
                if (html) parts.push(markIndiceBlocks(html));
                continue;
            }
            // Legenda de figura (estilo "Figura titulo"): story de frame único ancorada junto à
            // imagem. Ao contrário de LEGENDAS (outros livros, casada por referência textual —
            // "regra do livro" em insertFigures), aqui a posição natural no fluxo É a posição
            // certa; dropá-la faz a legenda desaparecer do corpo (só sobrevive no Índice).
            if (FIGURA_TITULO_RE.test(xml)) {
                const html = renderStory(rc, xml, counter, mapping);
                if (html) parts.push(html);
                continue;
            }
            if (!threaded && !STRUCTURAL_STYLES.test(xml) && !hasUserMappedStyle(xml, mapping)) {
                // Epígrafe/citação de abertura (story 1 frame com recuo de bloco).
                if (isBlockQuoteStory(xml)) {
                    const html = renderStory(rc, xml, counter, mapping);
                    if (html) parts.push(html);
                    continue;
                }
                // Bloco de título de coletânea (story 1-frame, 1º parágrafo = nº)? Recupera-o.
                const num = titleBlockNum(rc, xml);
                if (num !== null) { const h = renderTitleBlock(rc, xml, counter, boxed.has(storyId)); if (h) titleBlocks.push({ num, html: h, searchKey: titleBlockSearchKey(rc, xml) }); }
                else if (!fichaDone) {
                    // Frontespício: texto solto ANTES da Ficha Técnica (título/subtítulo vivo,
                    // caso raro — normalmente já vem embutido nas imagens de rosto). Mesma
                    // heurística de isHeuristicTitle (centrado/curto/fonte grande).
                    const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
                    for (const psr of Array.from(story?.children ?? [])) {
                        if (psr.tagName !== 'ParagraphStyleRange' || !isHeuristicTitle(psr)) continue;
                        for (const seg of renderPsr(rc, psr, counter)) if (seg.text) frontTexts.push(`<p class="p-center">${seg.text}</p>`);
                    }
                }
                continue;
            }
            const html = renderStory(rc, xml, counter, mapping);
            if (!html) continue;
            // Divisória "PARTE N" (story de 1 frame): o corpo é uma só story encadeada, emitida na
            // 1.ª página dela — esta ficaria depois de todos os capítulos. Com PDF, é reposta no sítio
            // pela página de abertura (ver partBlocks abaixo).
            const partKey = !threaded && pdf ? titleBlockSearchKey(rc, xml) : '';
            if (PART_TITLE_RE.test(partKey)) { partBlocks.push({ html, searchKey: partKey }); continue; }
            parts.push(html);
        }
    }

    // Imagens da Links/ → só galeria (nome original preservado); não referenciadas no HTML.
    const images = new Map<string, Blob>();
    for (const { name, blob } of links) images.set(sanitizeImageFilename(name).imageId, blob);

    let html = parts.join('\n');
    // Bullets literais "•" → lista <ul><li> real.
    html = convertBulletParagraphs(html);
    html = adoptTableNoteRefs(html);
    // Coletânea: inserir cada título de artigo antes da sua abertura (p.drop-cap), por ordem.
    const titleBlockRes = insertTitleBlocks(html, titleBlocks);
    html = titleBlockRes.html;
    // Sem CAPITULAR no livro (não é coletânea — titleBlockRes.placed === 0, não há p.drop-cap
    // para casar): a única forma de saber onde cada capítulo começa no corpo corrido é localizar
    // o título no PDF de impressão (página de abertura dedicada) e usar a página seguinte como
    // âncora — requer PDF (upload opcional); sem PDF os títulos ficam por inserir (não há outra
    // fronteira recuperável do IDML).
    if (titleBlockRes.placed === 0 && titleBlocks.length > 0 && pdf) {
        // pdfjs neutraliza o ArrayBuffer que lhe é passado (getDocument) — cópia própria, o
        // extractPdfPageAnchors mais abaixo também precisa do `pdf` original intacto.
        const chapterAnchors = await extractChapterAnchors(pdf.slice(0), titleBlocks.map(t => t.searchKey));
        const withHtml = chapterAnchors
            .map(a => ({ anchor: a.anchor, headingHtml: titleBlocks.find(t => t.searchKey === a.title)?.html }))
            .filter((a): a is { anchor: string; headingHtml: string } => !!a.headingHtml);
        html = insertChapterHeadings(html, withHtml).html;
    }
    // Divisórias de Parte: inseridas antes do 1.º bloco da página que se segue à sua abertura no PDF;
    // as que não encontrarem âncora vão para o fim (como antes) em vez de se perderem.
    if (partBlocks.length > 0 && pdf) {
        const anchors = await extractChapterAnchors(pdf.slice(0), partBlocks.map(b => b.searchKey));
        const tagged = partBlocks.map((b, i) => ({ ...b, html: b.html.replace(/^<(h[1-6])/, `<$1 data-part-block="${i}"`) }));
        html = insertChapterHeadings(html, anchors.flatMap(a => {
            const b = tagged.find(t => t.searchKey === a.title);
            return b ? [{ anchor: a.anchor, headingHtml: b.html }] : [];
        })).html;
        const missing = tagged.filter((_, i) => !html.includes(`data-part-block="${i}"`));
        if (missing.length) html += '\n' + missing.map(m => m.html).join('\n');
        html = html.replace(/ data-part-block="\d+"/g, '');
    } else if (partBlocks.length > 0) html += '\n' + partBlocks.map(b => b.html).join('\n');
    // Linhas em branco manuais (candidatas a p-top, ver renderStory/data-blank-top) só confirmam
    // espaçamento real com o PDF de impressão como árbitro (gap vs. entrelinha normal da página)
    // — sem PDF ficam sem p-top (mais seguro que assumir; muitos livros têm linhas em branco no
    // manuscrito sem correspondência nenhuma no miolo impresso).
    if (detectSpacing) html = await verifyBlankSpacing(html, pdf?.slice(0));
    let pageBreaks: { inserted: number; total: number } | undefined;
    // Page-list: alinhar as páginas do PDF de impressão ao texto e inserir marcadores.
    if (pdf) {
        const anchors = await extractPdfPageAnchors(pdf.slice(0)); // pdfjs neutraliza o ArrayBuffer — pdf original tem de sobreviver p/ printPdf
        const res = insertPageBreaks(html, anchors);
        html = res.html;
        pageBreaks = { inserted: res.inserted, total: res.total };
    }
    // Figuras: imagem/tabela + legenda no ponto da referência no corpo (todos os IDMLs).
    const figs: Awaited<ReturnType<typeof buildFigures>> = [];
    for (const idmlZip of idmlZips) figs.push(...await buildFigures(idmlZip, detectSpacing));
    const figRes = insertFigures(html, figs);
    html = figRes.html;

    // Livros com legenda INLINE no corpo ("Figura N:") — imagem antes da legenda, por ordem.
    const inlineRes = placeInlineFigures(html, [...images.keys()]);
    html = inlineRes.html;

    // Figuras com legenda DENTRO da imagem (EPS) — colocar pela referência "Figura N" no corpo.
    const usedIds = new Set([...html.matchAll(/data-image-id="([^"]+)"/g)].map(m => m[1]));
    const numberedRes = placeNumberedFigures(html, [...images.keys()].filter(id => !usedIds.has(id)));
    html = numberedRes.html;

    // Última tentativa: vinhetas puramente decorativas, sem legenda nem nº (ex. "Scribble3.eps"
    // em "Cai neve no Diabo") — posição pela maior quebra vertical entre linhas na página impressa
    // (folio do spread, ver pageHint em buildFigures); requer PDF de impressão.
    let positionRes: { html: string; placed: number } = { html, placed: 0 };
    if (pdf) {
        const usedIds2 = new Set([...html.matchAll(/data-image-id="([^"]+)"/g)].map(m => m[1]));
        const unplaced = figs.filter(f => f.imageId && !f.label && f.pageHint?.length && !usedIds2.has(f.imageId));
        if (unplaced.length > 0) {
            positionRes = await placeFiguresByPosition(html, unplaced, pdf.slice(0));
            html = positionRes.html;
        }
    }

    return { html, images, pageBreaks, figuresPlaced: figRes.placed + inlineRes.placed + numberedRes.placed + positionRes.placed, printPdf: pdf };
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
            const rc: RenderContext = { styles: await readIdmlStyles(idmlZip), detectSpacing: false };
            for (const storyId of ordered) {
                const xml = await idmlZip.file(`Stories/Story_${storyId}.xml`)?.async('string');
                if (!xml) continue;
                const threaded = (frameCount.get(storyId) || 0) > 1;
                if (!threaded && !STRUCTURAL_STYLES.test(xml)) continue;
                const story = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Story')[0];
                if (!story) continue;
                accumulateSpacing(rc, story, spacingAcc);
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
