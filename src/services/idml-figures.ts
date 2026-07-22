import JSZip from 'jszip';
import { sanitizeImageFilename } from '../utils/format';

/**
 * Reconstrução de figuras no import IDML+PDF: cada imagem da Links/ é colocada no editor como
 * bloco [imagem][legenda], na posição EXATA onde o corpo a referencia (ex. "(gráfico 1)"). As
 * legendas (estilo LEGENDAS) são DROPADAS pelo filtro narrativo — aqui são recuperadas e usadas
 * tanto como conteúdo do bloco como para casar imagem↔rótulo (via spread) e rótulo↔referência.
 * Tabelas (Quadros) não têm raster → ignoradas (backlog). Figuras sem referência no corpo ficam
 * só na galeria.
 */

export type FigureKind = 'gráfico' | 'fig' | 'quadro' | 'tabela' | 'mapa';

export interface Figure {
    imageId?: string;                      // imagem da galeria (sanitizeImageFilename) — figuras raster
    tableHtml?: string;                    // <table> reconstruída — Quadros (sem raster)
    label?: { kind: FigureKind; num: string }; // string: "2.1" não cabe em number sem colidir com "2.10"
    captionLines: string[];                // legenda + fonte + notas (cada uma um <p>); [0] = legenda
    captionSpacing?: string;               // classe p-top/p-bottom para captionLines[0] (DETECT_SPACING)
}

// separadores de linha do InDesign → espaço
const clean = (s: string) => s.replace(/[\u2028\u2029\t]+/g, ' ').replace(/\s+/g, ' ').trim();

// Nº simples ("5") ou decimal capítulo.figura ("11.4"). "figuras?" antes de "fig" — alguns
// livros escrevem a palavra completa ("Figura 2:"), não só a abreviatura.
const LABEL_RE = /^(gr[áa]fico|figuras?|fig|quadro|tabela|mapa)\.?\s*(\d+(?:\.\d+)?)/i;
const NOTE_RE = /^\s*([*†‡]|nota\s*:)/i; // marcador de nota de tabela

// Nomes de estilo de legenda/nota variam por livro (ex. "LEGENDAS" vs "Figura titulo").
const CAPTION_STYLE_RE = /^(legendas|figura\s*t[íi]tulo)$/i;
const NOTE_STYLE_RE = /^txt$/i;

function toLabel(lab: RegExpMatchArray): Figure['label'] {
    const kr = lab[1].toLowerCase();
    const kind: FigureKind = kr.startsWith('gr') ? 'gráfico' : kr.startsWith('fig') ? 'fig' : (kr as FigureKind);
    return { kind, num: lab[2] };
}

// Padrão de correspondência do número: cada parte (maior.menor) tem os zeros à esquerda
// removidos (nomes de ficheiro tipo "001" → 1) e o resultado tolera zeros à esquerda no texto
// procurado; funciona para nº simples ("5"/"005" → "0*5") e decimal ("11.4" → "0*11\.0*4") sem
// colisão entre partes (ex. "2.1" vs "2.10").
const numPattern = (num: string) => num.split('.').map(p => `0*${parseInt(p, 10)}`).join('\\.');

// Normaliza um nº (zeros à esquerda por parte removidos) para comparar valores extraídos de
// sítios diferentes (nome de ficheiro "001" vs texto "1") por igualdade, não por regex.
const normalizeNum = (num: string) => num.split('.').map(p => parseInt(p, 10)).join('.');

// Espaço antes/depois (pt) por estilo de parágrafo (Resources/Styles.xml) — mesmo sinal que
// spacingClasses em idml-importer.ts, mas independente (idml-figures.ts é regex-only, sem
// DOMParser). Chave = nome do estilo SEM o prefixo "ParagraphStyle/".
function scanSpacingStyles(stylesXml: string): Map<string, { before: number; after: number }> {
    const map = new Map<string, { before: number; after: number }>();
    for (const m of stylesXml.matchAll(/<ParagraphStyle\b([^>]*)>/g)) {
        const self = /\bSelf="ParagraphStyle\/([^"]*)"/.exec(m[1])?.[1];
        if (!self) continue;
        const before = parseFloat(/\bSpaceBefore="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        const after = parseFloat(/\bSpaceAfter="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        if (before || after) map.set(self, { before, after });
    }
    return map;
}

// Parágrafos de legenda de uma story: legenda (legenda/fonte) + notas TXT (começadas por *,
// fora das células da tabela). Remove os PI <?ACE?> (auto-número) que partiriam o texto.
// spacingStyles/detectSpacing: mesmo mecanismo do corpo principal (SpaceBefore/SpaceAfter,
// estilo + override do parágrafo) → p-top/p-bottom em spacingCls, só na 1ª linha da legenda.
function captionParasOf(
    storyXml: string,
    spacingStyles: Map<string, { before: number; after: number }>,
    detectSpacing: boolean,
): { text: string; label?: Figure['label']; spacingCls?: string }[] {
    const xml = storyXml.replace(/<\?ACE[^>]*\?>/g, '').replace(/<Table\b[\s\S]*?<\/Table>/g, '');
    const out: { text: string; label?: Figure['label']; spacingCls?: string }[] = [];
    const re = /<ParagraphStyleRange([^>]*)>([\s\S]*?)<\/ParagraphStyleRange>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const attrs = m[1];
        const style = /AppliedParagraphStyle="ParagraphStyle\/([^"]+)"/.exec(attrs)?.[1] || '';
        let spacingCls = '';
        if (detectSpacing) {
            const def = spacingStyles.get(style);
            const before = parseFloat(/\bSpaceBefore="([^"]*)"/.exec(attrs)?.[1] || '') || def?.before || 0;
            const after = parseFloat(/\bSpaceAfter="([^"]*)"/.exec(attrs)?.[1] || '') || def?.after || 0;
            spacingCls = [before > 0 ? 'p-top' : '', after > 0 ? 'p-bottom' : ''].filter(Boolean).join(' ');
        }
        for (const seg of m[2].split(/<Br\s*\/>/)) {
            const t = clean((seg.match(/<Content>([^<]*)<\/Content>/g) || []).map(c => c.replace(/<[^>]+>/g, '')).join(''));
            if (!t) continue;
            const lab = t.match(LABEL_RE);
            // Estilo de legenda reconhecido (LEGENDAS/Figura titulo) OU, independentemente do
            // estilo, texto que começa mesmo por um rótulo de figura ("Figura 2:", "Gráfico 1")
            // — alguns livros centram a legenda num parágrafo TXT normal, sem estilo dedicado.
            if (CAPTION_STYLE_RE.test(style) || lab) out.push({ text: t, label: lab ? toLabel(lab) : undefined, spacingCls });
            else if (NOTE_STYLE_RE.test(style) && NOTE_RE.test(t)) out.push({ text: t }); // nota de tabela
        }
    }
    return out;
}

// IDML <Table> → <table> HTML. Cells endereçadas por Name="col:row"; linha 0 = cabeçalho (<th>).
function parseTables(storyXml: string): string[] {
    const tables: string[] = [];
    const re = /<Table\b([^>]*)>([\s\S]*?)<\/Table>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(storyXml)) !== null) {
        const cols = parseInt(m[1].match(/ColumnCount="(\d+)"/)?.[1] || '0');
        const rows = parseInt(m[1].match(/BodyRowCount="(\d+)"/)?.[1] || '0');
        if (!cols || !rows) continue;
        const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
        for (const c of m[2].matchAll(/<Cell\b[^>]*\bName="(\d+):(\d+)"[^>]*>([\s\S]*?)<\/Cell>/g)) {
            const col = parseInt(c[1]), row = parseInt(c[2]);
            if (row >= rows || col >= cols) continue;
            grid[row][col] = clean((c[3].match(/<Content>([^<]*)<\/Content>/g) || []).map(x => x.replace(/<[^>]+>/g, '')).join(' '));
        }
        const body = grid.map((r, ri) => '<tr>' + r.map((cell, ci) => {
            // linha 0 = cabeçalho de coluna; coluna 0 (linhas seguintes) = cabeçalho de linha
            if (ri === 0) return `<th scope="col">${escapeHtml(cell)}</th>`;
            if (ci === 0) return `<th scope="row">${escapeHtml(cell)}</th>`;
            return `<td>${escapeHtml(cell)}</td>`;
        }).join('') + '</tr>').join('');
        tables.push(`<table>${body}</table>`);
    }
    return tables;
}

const RASTER = /\.(jpe?g|png|gif|tiff?|webp)$/i;
// loadIdmlPackage converte estas para raster antes de as pôr na galeria (PDF→JPEG via
// Ghostscript/pdfToJpeg, EPS/PSD→PNG rasterizado com Ghostscript/ImageMagick) — mesma renomeação
// aqui, para o imageId calculado bater com a chave real da galeria (sanitizeImageFilename não
// reconhece .pdf/.eps/.psd).
const CONVERTIBLE = /\.(pdf|eps|psd)$/i;
export const toRasterName = (n: string) => n.replace(/\.pdf$/i, '.jpg').replace(/\.eps$/i, '.png').replace(/\.psd$/i, '.png');

export async function buildFigures(idmlZip: JSZip, detectSpacing = false): Promise<Figure[]> {
    const storyCache = new Map<string, string>();
    const story = async (id: string) => {
        if (!storyCache.has(id)) storyCache.set(id, await idmlZip.file(`Stories/Story_${id}.xml`)?.async('string') ?? '');
        return storyCache.get(id)!;
    };
    const spacingStyles = detectSpacing
        ? scanSpacingStyles(await idmlZip.file('Resources/Styles.xml')?.async('string') ?? '')
        : new Map<string, { before: number; after: number }>();

    const figures: Figure[] = [];
    const usedImages = new Set<string>();
    const usedTables = new Set<string>();
    for (const f of idmlZip.file(/Spreads\/.*\.xml$/)) {
        const sx = await f.async('string');
        const imgs = [...sx.matchAll(/LinkResourceURI="([^"]*)"/g)]
            .map(mm => decodeURIComponent(mm[1].split('/').pop() || ''))
            .filter(n => RASTER.test(n) || CONVERTIBLE.test(n));
        // legendas (legenda/fonte/notas) das stories nesta spread — para casar com as IMAGENS
        // (imagem e legenda vivem em frames/stories DIFERENTES na mesma spread).
        const storyIds = [...new Set([...sx.matchAll(/ParentStory="([^"]+)"/g)].map(mm => mm[1]))];
        const caps: ReturnType<typeof captionParasOf> = [];
        for (const sid of storyIds) { const stx = await story(sid); caps.push(...captionParasOf(stx, spacingStyles, detectSpacing)); }
        // linhas sem rótulo (fonte/notas) — anexadas à legenda da figura desta spread
        const extras = [...new Set(caps.filter(c => !c.label).map(c => c.text))];

        // figuras RASTER (imagem) → legenda gráfico/fig/mapa (não quadro/tabela)
        const figCaps = caps.filter(c => c.label && c.label.kind !== 'quadro' && c.label.kind !== 'tabela');
        for (const img of imgs) {
            const imageId = sanitizeImageFilename(toRasterName(img)).imageId;
            if (usedImages.has(imageId)) continue;
            usedImages.add(imageId);
            // Nº extraído do NOME do ficheiro ("Figura 2.pdf" → "2") casado com o label.num certo
            // — necessário quando a story partilhada pelas spreads (corpo principal, referenciado
            // por TODAS) tem várias legendas embutidas: sem isto, a 1ª do livro inteiro "ganhava"
            // sempre, em vez da legenda da imagem desta spread especificamente.
            const fileNum = img.match(/(\d+(?:\.\d+)?)/)?.[1];
            const imgCap = (fileNum && figCaps.find(c => normalizeNum(c.label!.num) === normalizeNum(fileNum))) || figCaps[0];
            figures.push({ imageId, label: imgCap?.label, captionLines: imgCap ? [imgCap.text, ...extras] : [], captionSpacing: imgCap?.spacingCls });
        }
        // figuras TABELA (Quadro): tabela e legenda vivem na MESMA story (confirmado na prática —
        // duas tabelas de stories diferentes podem partilhar uma spread, e casar pela spread
        // inteira atribuía a legenda de uma à outra). Casar por STORY, não por spread.
        for (const sid of storyIds) {
            const stx = await story(sid);
            const stTables = parseTables(stx);
            if (stTables.length === 0) continue;
            const stCaps = captionParasOf(stx, spacingStyles, detectSpacing);
            const tblCap = stCaps.find(c => c.label && (c.label.kind === 'quadro' || c.label.kind === 'tabela'));
            const stExtras = [...new Set(stCaps.filter(c => !c.label).map(c => c.text))];
            for (const tbl of stTables) {
                if (usedTables.has(tbl)) continue; // story threaded por vários frames/spreads → mesma tabela repetida
                usedTables.add(tbl);
                figures.push({ tableHtml: tbl, label: tblCap?.label, captionLines: tblCap ? [tblCap.text, ...stExtras] : [], captionSpacing: tblCap?.spacingCls });
            }
        }
    }
    return figures;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Insere o visual (imagem/tabela) junto à legenda no corpo. Duas estratégias, por ordem:
 *  1) a PRÓPRIA legenda já existe como parágrafo no corpo (estilo "Figura titulo": caption
 *     não é dropada do fluxo, ver isFigurasTituloStory em idml-importer.ts) — é o alvo mais
 *     fiável (evita casar com uma menção textual incidental tipo "conforme a Tabela 4.1.");
 *     o visual fica DEPOIS da legenda (convenção destes livros).
 *  2) legenda clássica LEGENDAS (dropada do fluxo): procura a referência textual
 *     "(gráfico N)"/"(fig N)" no corpo e fabrica-se o bloco [imagem][legenda] a seguir,
 *     imagem ANTES da legenda (regra do livro).
 * Figuras sem rótulo ou sem alvo são ignoradas (ficam na galeria). Devolve o nº colocado.
 */
export function insertFigures(html: string, figures: Figure[]): { html: string; placed: number } {
    const withRef = figures.filter(f => f.label);
    if (withRef.length === 0) return { html, placed: 0 };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
        .filter(b => !b.hasAttribute('data-indice')); // exclui entradas de Índice de Figuras/Tabelas
    let placed = 0;
    for (const fig of withRef) {
        const caption = fig.captionLines[0];
        const visual = fig.tableHtml
            ? fig.tableHtml
            : `<img data-image-id="${fig.imageId}" src="placeholder" alt="${escapeHtml(caption || '')}" />`;

        const captionTarget = caption && blocks.find(b => (b.textContent || '').trim() === caption.trim());
        if (captionTarget) {
            captionTarget.classList.add('p-legendas');
            const frag = doc.createElement('div');
            frag.innerHTML = visual;
            let ref: Node = captionTarget;
            while (frag.firstChild) { const node = frag.firstChild; captionTarget.parentNode!.insertBefore(node, ref.nextSibling); ref = node; }
            placed++;
            continue;
        }

        const { kind, num } = fig.label!;
        const k = kind === 'gráfico' ? 'gr[áa]fico' : kind; // fig/quadro/tabela/mapa literais
        const re = new RegExp(`[\\(\\[]?\\s*${k}\\.?\\s*${numPattern(num)}\\b`, 'i');
        const target = blocks.find(b => re.test(b.textContent || ''));
        if (!target) continue;
        const frag = doc.createElement('div');
        frag.innerHTML = visual + fig.captionLines.map((l, i) =>
            `<p class="${['p-legendas', i === 0 ? fig.captionSpacing : ''].filter(Boolean).join(' ')}">${escapeHtml(l)}</p>`
        ).join('');
        // inserir os filhos do frag a seguir ao bloco-alvo, por ordem
        let ref: Node = target;
        while (frag.firstChild) { const node = frag.firstChild; target.parentNode!.insertBefore(node, ref.nextSibling); ref = node; }
        placed++;
    }
    return { html: doc.body.innerHTML, placed };
}

// Legenda já presente no texto (estilo do corpo), ex. "Figura 1: Ábaco" / "Tabela 11.1: …".
const INLINE_CAPTION_RE = /^\s*(figuras?|gr[áa]ficos?|tabelas?|quadros?|fig|imagens?|mapas?)\.?\s*[\d.]+\s*[:.—–-]/i;
const SOURCE_RE = /^\s*fonte\s*:/i;

/**
 * Para livros cujas legendas estão INLINE no corpo (não em stories LEGENDAS separadas):
 * insere cada imagem da galeria DEPOIS do parágrafo-legenda "Figura N:" (+ "Fonte:" seguinte,
 * se houver), marcando-os p-legendas. Casa por NÚMERO extraído da legenda vs do nome do
 * ficheiro (mais fiável); sobras sem nº reconhecível casam por ORDEM. Imagens a mais ficam
 * na galeria.
 */
// Palavras de referência de figura no corpo (PT). \b + nº evita "figurar-se".
const FIG_REF_WORDS = 'figuras?|gr[áa]ficos?|quadros?|tabelas?|imagens?|mapas?';

/**
 * Figuras SEM legenda em texto (a legenda+fonte está desenhada DENTRO da imagem, ex. EPS de
 * Illustrator): coloca cada imagem da galeria no ponto onde o corpo a refere por NÚMERO
 * ("Figura 1 mostra…"). O número vem do nome do ficheiro ("001" → 1). Só coloca imagens
 * ainda não inseridas; sem referência no corpo → fica na galeria.
 */
export function placeNumberedFigures(html: string, imageIds: string[]): { html: string; placed: number } {
    if (imageIds.length === 0) return { html, placed: 0 };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))
        .filter(b => !b.hasAttribute('data-indice')); // exclui entradas de Índice de Figuras/Tabelas
    let placed = 0;
    for (const id of [...imageIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        const num = id.match(/\d+(?:\.\d+)?/)?.[0];
        if (!num) continue;
        const re = new RegExp(`(?:${FIG_REF_WORDS})\\.?\\s*${numPattern(num)}\\b`, 'i');
        const target = blocks.find(b => re.test(b.textContent || ''));
        if (!target) continue;
        const img = doc.createElement('img');
        img.setAttribute('data-image-id', id);
        img.setAttribute('src', 'placeholder');
        img.setAttribute('alt', `Figura ${num.split('.').map(p => parseInt(p, 10)).join('.')}`);
        target.parentNode!.insertBefore(img, target.nextSibling); // imagem a seguir à referência
        placed++;
    }
    return { html: doc.body.innerHTML, placed };
}

export function placeInlineFigures(html: string, imageIds: string[]): { html: string; placed: number } {
    if (imageIds.length === 0) return { html, placed: 0 };
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const captions = Array.from(doc.body.querySelectorAll('p')).filter(p => {
        if (!INLINE_CAPTION_RE.test(p.textContent || '')) return false;
        if (p.hasAttribute('data-indice')) return false; // entrada de Índice de Figuras/Tabelas
        if (p.classList.contains('p-legendas')) return false; // já colocada por insertFigures
        const next = p.nextElementSibling;
        if (next && (next.tagName === 'IMG' || next.tagName === 'TABLE')) return false; // já tem visual
        return true;
    });
    if (captions.length === 0) return { html, placed: 0 };
    const ids = [...imageIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    let placed = 0;
    const used = new Set<string>();
    const place = (cap: Element, id: string) => {
        const img = doc.createElement('img');
        img.setAttribute('data-image-id', id);
        img.setAttribute('src', 'placeholder');
        img.setAttribute('alt', cap.textContent || '');
        cap.classList.add('p-legendas'); // preserva classes já presentes (ex. p-top do corpo)
        // imagem DEPOIS da legenda (+ "Fonte:" seguinte, se existir) — convenção destes livros.
        let insertAfter: Element = cap;
        const next = cap.nextElementSibling;
        if (next && next.tagName === 'P' && SOURCE_RE.test(next.textContent || '')) {
            next.classList.add('p-legendas');
            insertAfter = next;
        }
        insertAfter.parentNode!.insertBefore(img, insertAfter.nextElementSibling);
        used.add(id);
        placed++;
    };

    // 1º: casar por NÚMERO (legenda "Figura 2.3: ..." vs nome do ficheiro) — mais fiável que a
    // ordem, evita desalinhar toda a lista se faltar uma imagem/legenda a meio.
    const unmatched: Element[] = [];
    for (const cap of captions) {
        const cn = (cap.textContent || '').match(/(\d+(?:\.\d+)?)/)?.[1];
        const id = cn && ids.find(i => {
            if (used.has(i)) return false;
            const idn = i.match(/\d+(?:\.\d+)?/)?.[0];
            return !!idn && normalizeNum(idn) === normalizeNum(cn);
        });
        if (id) place(cap, id); else unmatched.push(cap);
    }
    // 2º: sobras — parear por ORDEM (comportamento antigo, para legendas/nomes sem nº claro).
    const remainingIds = ids.filter(id => !used.has(id));
    for (let i = 0; i < unmatched.length && i < remainingIds.length; i++) place(unmatched[i], remainingIds[i]);

    return { html: doc.body.innerHTML, placed };
}
