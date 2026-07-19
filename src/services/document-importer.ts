import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { extractIdml } from './idml-importer';
import { extractEpub } from './epub-importer';
import type { EpubMetadata } from './epub-importer';

export interface ExtractedDocument {
    html: string;
    images: Map<string, Blob>;
    pageBreaks?: { inserted: number; total: number }; // page-list do PDF (IDML+miolo)
    figuresPlaced?: number; // figuras imagem+legenda colocadas por referência (IDML)
    metadata?: EpubMetadata; // Dublin Core do OPF (só no import de EPUB)
}

// Strip scripts/event handlers/SVG from imported HTML before it reaches the editor.
// Keeps the attributes the EPUB pipeline relies on (data-image-id, class, id, href).
function sanitizeImportedHtml(html: string): string {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// Destino no editor para um estilo de parágrafo do Word.
// 'auto' = não emitir regra, deixar as heurísticas decidirem.
export type DocxStyleTarget =
    | 'auto' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    | 'p' | 'p-indent' | 'p-center' | 'p-small' | 'p-bold' | 'p-italic' | 'p-bold-italic' | 'p-quote' | 'p-legendas' | 'footnote';

export interface DocxStyleInfo {
    styleId: string;   // w:styleId (chave das heurísticas)
    name: string;      // w:name (chave do Mammoth styleMap)
    count: number;     // nº de parágrafos que o usam
    sample: string;    // 1º texto não-vazio (paraText, ≤40 chars)
    suggested: DocxStyleTarget;
    suggestedCentered: boolean; // estilo de título com jc=center na definição
}

// `centered` adiciona a classe p-center ao alvo (título h1-h6 OU parágrafo p/p-indent/…)
export interface DocxStyleMapEntry {
    target: DocxStyleTarget;
    centered?: boolean;
}

// chave = styleId
export type DocxStyleMapping = Record<string, DocxStyleMapEntry>;

export interface ExtractOptions {
    convertListsToDialogue?: boolean;
    styleMapping?: DocxStyleMapping;
}

export async function extractDocument(file: File, options: ExtractOptions = {}): Promise<ExtractedDocument> {
    let extracted: ExtractedDocument;
    if (file.name.endsWith('.docx')) {
        extracted = await extractHtmlFromDocx(file, options);
    } else if (file.name.endsWith('.idml') || file.name.endsWith('.zip')) {
        extracted = await extractIdml(file, { styleMapping: options.styleMapping });
    } else if (file.name.endsWith('.epub')) {
        extracted = await extractEpub(file);
    } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        extracted = await extractHtmlFromHtml(file);
    } else {
        throw new Error('Unsupported file type');
    }
    return { ...extracted, html: sanitizeImportedHtml(extracted.html) };
}

// Primeiro run do parágrafo é elevado (= marcador de nota no início).
// Aceita as duas formas de elevação: w:position (PDF→Word) e w:vertAlign
// superscript (marcador de nota nativo) — sem o segundo, notas cujo número
// é sobrescrito mas não posicionado escapavam e ganhavam estrutura de miolo.
function startsWithRaisedRun(para: string): boolean {
    const i = para.indexOf('<w:r>');
    if (i < 0) return false;
    const j = para.indexOf('</w:r>', i);
    if (j < 0) return false;
    const first = para.slice(i, j);
    return /<w:position w:val="[1-9]\d*"/.test(first) || /<w:vertAlign w:val="superscript"\/>/.test(first);
}

// Primeiro run do parágrafo é um MARCADOR DE NOTA: elevado E o texto é um número
// (ex. "1", "127"). Sinal estrutural da DEFINIÇÃO de nota — mais fiável que adivinhar
// o tamanho de fonte. Usado só para derivar o noteSize das notas confirmadas.
function startsWithNoteMarker(para: string): boolean {
    if (!startsWithRaisedRun(para)) return false;
    const i = para.indexOf('<w:r>');
    const j = para.indexOf('</w:r>', i);
    const t = (para.slice(i, j).match(/<w:t(?: [^>]*)?>([^<]*)/)?.[1] || '').trim();
    return /^\d+$/.test(t);
}

// Tamanho de fonte dominante dos runs de TEXTO (ignora marcadores elevados)
function dominantSz(para: string): string | null {
    const counts: Record<string, number> = {};
    const rprRe = /<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*?)<\/w:rPr>/g;
    let m;
    while ((m = rprRe.exec(para)) !== null) {
        if (/<w:position w:val="[1-9]/.test(m[1])) continue;
        const sz = m[1].match(/<w:sz w:val="(\d+)"/);
        if (sz) counts[sz[1]] = (counts[sz[1]] || 0) + 1;
    }
    let best: string | null = null;
    for (const k of Object.keys(counts)) {
        if (best === null || counts[k] > counts[best]) best = k;
    }
    return best;
}

const PARA_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;

// Recuo esquerdo (twips) acima da margem-base que classifica um parágrafo como
// citação. ~0.14" — folga suficiente para separar o recuo real do ruído de
// margem do Acrobat sem apanhar variações de 1-2 twips.
const QUOTE_LEFT_DELTA_TWIPS = 200;

// Texto inicial do parágrafo (concatenação dos primeiros <w:t>)
function paraText(para: string): string {
    const texts = para.match(/<w:t(?: [^>]*)?>([^<]*)/g) || [];
    return texts.map(t => t.replace(/<w:t(?: [^>]*)?>/, '')).join('').trimStart().slice(0, 40);
}

// pPr do PRÓPRIO parágrafo (antes do 1º run) — parágrafos aninhados em textboxes
// têm pPr próprio que não pode ser confundido com o do exterior
function ownPPr(para: string): string {
    const m = para.match(/^<w:p(?: [^>]*)?>(<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<\/w:pPr>)/);
    return m ? m[1] : '';
}

// Substitui (ou injeta) o pStyle do parágrafo
function setParaStyle(para: string, styleId: string): string {
    if (/<w:pStyle /.test(para)) return para.replace(/<w:pStyle w:val="[^"]*"\/>/, `<w:pStyle w:val="${styleId}"/>`);
    if (/<w:pPr>/.test(para)) return para.replace('<w:pPr>', `<w:pPr><w:pStyle w:val="${styleId}"/>`);
    return para.replace(/^(<w:p(?: [^>]*)?>)/, `$1<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>`);
}

// Estilos de parágrafo definidos em styles.xml: styleId → name, id do default,
// e styleIds cuja definição centra o texto (jc=center).
function parseParagraphStyles(stylesXml: string): { names: Map<string, string>; defaultId: string | null; centered: Set<string> } {
    const names = new Map<string, string>();
    const centered = new Set<string>();
    let defaultId: string | null = null;
    const styleRe = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
    let m: RegExpExecArray | null;
    while ((m = styleRe.exec(stylesXml)) !== null) {
        const attrs = m[1];
        if (!/w:type="paragraph"/.test(attrs)) continue;
        const idMatch = attrs.match(/w:styleId="([^"]+)"/);
        if (!idMatch) continue;
        const id = idMatch[1];
        const name = m[2].match(/<w:name w:val="([^"]+)"\/>/);
        names.set(id, name ? name[1] : id);
        if (/w:default="1"/.test(attrs)) defaultId = id;
        if (/<w:jc w:val="center"\/>/.test(m[2])) centered.add(id);
    }
    return { names, defaultId, centered };
}

// Sugestão de destino a partir do nome do estilo.
function suggestTarget(name: string): DocxStyleTarget {
    const h = name.match(/^(?:heading|t[íi]tulo) ?([1-6])$/i);
    // h4-h6 não existem nas opções de import → limitar a sugestão a h3
    if (h) return `h${Math.min(parseInt(h[1], 10), 3)}` as DocxStyleTarget;
    if (/footnote|nota de rodap[ée]/i.test(name)) return 'footnote';
    return 'auto';
}

/**
 * Enumera os estilos de parágrafo REALMENTE usados no docx, com contagem,
 * texto-exemplo e destino sugerido — alimenta a UI de mapeamento de estilos.
 * Parágrafos sem pStyle contam para o estilo default (normalmente "Normal").
 */
export async function scanDocxStyles(arrayBuffer: ArrayBuffer): Promise<DocxStyleInfo[]> {
    try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docFile = zip.file('word/document.xml');
        if (!docFile) return [];
        const documentXml = await docFile.async('string');

        const stylesFile = zip.file('word/styles.xml');
        const { names, defaultId, centered } = stylesFile
            ? parseParagraphStyles(await stylesFile.async('string'))
            : { names: new Map<string, string>(), defaultId: null, centered: new Set<string>() };

        const used = new Map<string, { count: number; sample: string }>();
        // exec em streaming (não materializar o array de ~todos os parágrafos)
        const paraRe = new RegExp(PARA_RE.source, 'g');
        let pm: RegExpExecArray | null;
        while ((pm = paraRe.exec(documentXml)) !== null) {
            const para = pm[0];
            const ppr = ownPPr(para);
            const st = ppr.match(/<w:pStyle w:val="([^"]+)"\/>/);
            const id = st ? st[1] : defaultId;
            if (!id) continue;
            let entry = used.get(id);
            if (!entry) { entry = { count: 0, sample: '' }; used.set(id, entry); }
            entry.count++;
            if (!entry.sample) entry.sample = paraText(para);
        }

        const styles: DocxStyleInfo[] = [];
        for (const [styleId, { count, sample }] of used) {
            const name = names.get(styleId) ?? styleId;
            styles.push({ styleId, name, count, sample, suggested: suggestTarget(name), suggestedCentered: centered.has(styleId) });
        }
        styles.sort((a, b) => b.count - a.count);
        return styles;
    } catch (err) {
        console.error('scanDocxStyles falhou', err);
        return [];
    }
}

// Numa só passagem pelos parágrafos: moda do tamanho de fonte das notas (runs
// elevados) vs corpo, e a margem-base do corpo (moda do w:left dos não-elevados).
// baselineLeft é a indentação esquerda "normal" da página (ruído uniforme do
// Acrobat); um recuo bem maior que esta = citação em destaque (ver tagBodyStructure).
function computeFontSizes(documentXml: string): { noteSize: string | null; bodySize: string | null; baselineLeft: number | null } {
    const noteSizes: Record<string, number> = {};
    const bodySizes: Record<string, number> = {};
    const leftCounts: Record<string, number> = {};
    const paraRe = new RegExp(PARA_RE.source, 'g');
    let pm: RegExpExecArray | null;
    while ((pm = paraRe.exec(documentXml)) !== null) {
        const para = pm[0];
        const raised = startsWithRaisedRun(para);
        if (!raised) {
            const left = ownPPr(para).match(/<w:ind [^>]*w:left="(\d+)"/);
            if (left) leftCounts[left[1]] = (leftCounts[left[1]] || 0) + 1;
        }
        const dom = dominantSz(para);
        if (!dom) continue;
        // noteSize SÓ das notas confirmadas (1º run = sup + dígito) — não de qualquer
        // run elevado; bodySize só dos não-elevados; o elevado-mas-não-dígito (raro:
        // ordinal sobrescrito) não polui nenhum dos dois.
        if (startsWithNoteMarker(para)) noteSizes[dom] = (noteSizes[dom] || 0) + 1;
        else if (!raised) bodySizes[dom] = (bodySizes[dom] || 0) + 1;
    }
    const mode = (rec: Record<string, number>): string | null =>
        Object.keys(rec).sort((a, b) => rec[b] - rec[a])[0] ?? null;
    const bodySize = mode(bodySizes);
    let noteSize = mode(noteSizes);
    // Nota é, por definição, MENOR que o corpo. Se a heurística de runs elevados
    // mal disparou (docx cujas refs não usam <w:position>) o "noteSize" sai
    // ≥ corpo — valor espúrio que descartaria miolo legítimo; ignora-o.
    if (noteSize !== null && bodySize !== null && parseInt(noteSize) >= parseInt(bodySize)) {
        noteSize = null;
    }
    const baseline = mode(leftCounts);
    return { noteSize, bodySize, baselineLeft: baseline ? parseInt(baseline) : null };
}

/**
 * Marca continuações de notas partidas entre páginas (PDF→Word):
 * parágrafo SEM marcador elevado, com fonte do tamanho das notas (menor que o corpo)
 * → ganha pStyle "NoteCont", que o styleMap converte em <p class="note-cont">
 * para fusão posterior na nota respetiva. Critério por exclusão (rejeita marcadores
 * de nota em texto plano e legendas), não por 1º carácter.
 */
function tagNoteContinuations(documentXml: string, noteSize: string): { xml: string; tagged: number } {
    let tagged = 0;
    const xml = documentXml.replace(PARA_RE, (para) => {
        if (startsWithRaisedRun(para) || dominantSz(para) !== noteSize) return para;
        const inicio = paraText(para);
        if (!inicio) return para;
        // Nota com marcador em texto plano ("7. texto") — não é continuação
        if (/^\d{1,3}[.)]\s/.test(inicio)) return para;
        // Legendas/rótulos com fonte pequena — nunca fundir em notas
        if (/^(figura|tabela|quadro|gr[áa]fico|caixa|box|mapa)\s*\d/i.test(inicio) || /^fonte\s*:/i.test(inicio)) return para;
        tagged++;
        return setParaStyle(para, 'NoteCont');
    });
    return { xml, tagged };
}

/**
 * Marca continuações de MIOLO partidas pela quebra de página (PDF→Word). No docx do
 * Acrobat cada página é uma secção (w:sectPr); um parágrafo cortado pela quebra dá dois
 * <w:p>: o fim no rodapé da página N e o início no topo da N+1. A continuação é o
 * PRIMEIRO parágrafo de uma secção, SEM recolho de 1ª linha (parágrafo novo TEM-no) e
 * que começa em minúscula (continua a frase anterior). pStyle "PageCont" → <p class="page-cont">
 * fundido depois em mergePageContinuations. Substitui o consolidateSplitParagraphs
 * (text-based) no docx: o sinal de secção evita os falsos positivos das frases curtas /
 * rótulos a meio da página.
 */
function tagPageContinuations(documentXml: string, noteSize: string | null): { xml: string; tagged: number } {
    let tagged = 0;
    let pending = false; // o parágrafo anterior fechou uma secção → este é 1º da página
    const xml = documentXml.replace(PARA_RE, (para) => {
        const firstOfPage = pending;
        const txt = paraText(para);
        if (para.includes('<w:sectPr')) pending = true;
        else if (txt) pending = false; // parágrafo com texto consome o sinal
        // (parágrafo vazio sem sectPr: mantém o sinal — empties entre a secção e o 1º texto)
        if (!firstOfPage || !txt) return para;
        if (startsWithRaisedRun(para)) return para; // marcador de nota
        if (/<w:pStyle w:val="(Heading|TableParagraph|NoteCont)/.test(para)) return para;
        if (noteSize !== null && dominantSz(para) === noteSize) return para; // fragmento de nota
        const ppr = ownPPr(para);
        const fl = ppr.match(/<w:ind [^>]*w:firstLine="(\d+)"/);
        if (fl && parseInt(fl[1]) >= 150) return para; // tem recolho → parágrafo novo
        if (!/^[a-zà-öø-ÿ]/.test(txt)) return para; // tem de começar minúscula
        tagged++;
        return setParaStyle(para, 'PageCont');
    });
    return { xml, tagged };
}

/**
 * Replica a estrutura do miolo no editor: lê w:firstLine (indentação 1ª linha),
 * w:jc (center/right) e fonte menor que o corpo, e marca cada combinação com um
 * pStyle sintético "XStructN" que o styleMap converte nas classes do editor
 * (p-indent / p-center / p-small).
 */
function tagBodyStructure(
    documentXml: string,
    noteSize: string | null,
    bodySize: string | null,
    skipIds: Set<string>,
    defaultId: string | null,
    baselineLeft: number | null
): { xml: string; styleClasses: Map<string, string[]> } {
    const styleClasses = new Map<string, string[]>();
    const comboIds = new Map<string, string>();
    const xml = documentXml.replace(PARA_RE, (para) => {
        if (/<w:pStyle w:val="(Heading|TableParagraph|NoteCont|PageCont)/.test(para)) return para;
        // Estilo mapeado explicitamente pelo utilizador — a sua regra vence, sem heurística.
        const st = ownPPr(para).match(/<w:pStyle w:val="([^"]+)"\/>/);
        const sid = st ? st[1] : defaultId;
        if (sid && skipIds.has(sid)) return para;
        if (startsWithRaisedRun(para)) return para;
        const dom = dominantSz(para);
        if (noteSize !== null && dom === noteSize) return para;
        const inicio = paraText(para);
        // vazio ou começado em minúscula (fragmento a consolidar — classes impediriam a fusão)
        if (!inicio || /^[a-zà-ÿ]/.test(inicio)) return para;
        // possível nota em texto plano ("7. texto") — a deteção de notas exige <p> sem classes
        if (/^\d{1,3}[.)]\s/.test(inicio)) return para;

        const classes: string[] = [];
        const ppr = ownPPr(para);
        const fl = ppr.match(/<w:ind [^>]*w:firstLine="(\d+)"/);
        const hasFirstLineIndent = fl !== null && parseInt(fl[1]) >= 150;
        if (hasFirstLineIndent) classes.push('p-indent');
        if (/<w:jc w:val="center"\/>/.test(ppr)) classes.push('p-center');
        if (bodySize !== null && dom !== null && parseInt(dom) < parseInt(bodySize)) classes.push('p-small');
        // Citação em destaque: recuo esquerdo bem maior que a margem-base do corpo
        // E com recolho de 1ª linha — o recolho distingue-a de TOC/índice/listas de
        // legislação (que usam só w:left, sem firstLine) e das notas (já excluídas acima).
        const li = ppr.match(/<w:ind [^>]*w:left="(\d+)"/);
        if (hasFirstLineIndent && li && parseInt(li[1]) >= (baselineLeft ?? 0) + QUOTE_LEFT_DELTA_TWIPS) classes.push('p-quote');
        if (classes.length === 0) return para;

        const combo = classes.join('.');
        let id = comboIds.get(combo);
        if (!id) {
            id = `XStruct${comboIds.size}`;
            comboIds.set(combo, id);
            styleClasses.set(id, classes);
        }
        return setParaStyle(para, id);
    });
    return { xml, styleClasses };
}

/**
 * Marca títulos centrados: jc=center direto no parágrafo, herdado da definição
 * do estilo (ex. Heading 3 centrado em styles.xml) sem jc direto a anular, ou
 * "fake centering" do Acrobat — sem jc mas com indentação esquerda grande
 * (w:ind left ≥ 1000 twips) que empurra o título curto para o centro visual.
 * pStyle sintético "XHCn" → styleMap "h{n}.p-center".
 */
function tagCenteredHeadings(
    documentXml: string,
    headingStyles: Map<string, { level: number; centered: boolean }>,
    skipIds: Set<string>
): { xml: string; levels: Set<number> } {
    const levels = new Set<number>();
    if (headingStyles.size === 0) return { xml: documentXml, levels };
    const xml = documentXml.replace(PARA_RE, (para) => {
        const ppr = ownPPr(para);
        const st = ppr.match(/<w:pStyle w:val="([^"]+)"\/>/);
        if (!st) return para;
        // Estilo mapeado explicitamente — sem fake-centering heurístico.
        if (skipIds.has(st[1])) return para;
        const info = headingStyles.get(st[1]);
        if (!info) return para;
        const jc = ppr.match(/<w:jc w:val="([^"]+)"\/>/);
        const left = ppr.match(/<w:ind [^>]*w:left="(\d+)"/);
        const leftBig = left !== null && parseInt(left[1]) >= 1000;
        // jc=left explícito NÃO impede fake centering: o Acrobat marca jc=left
        // e centra na mesma via indentação (left grande)
        const centered = jc
            ? jc[1] === 'center' || (jc[1] === 'left' && leftBig)
            : info.centered || leftBig;
        if (!centered) return para;
        levels.add(info.level);
        return setParaStyle(para, `XHC${info.level}`);
    });
    return { xml, levels };
}

/**
 * Listas cujo marcador (lvlText) é um travessão são falas de diálogo (ou listas
 * de travessão no impresso) — o Acrobat converte o travessão das falas em bullet.
 * Remove o numPr e prefixa o texto com o próprio marcador: o Mammoth produz
 * <p>– fala…</p> diretamente, sem depender da opção "Converter Listas em Diálogo".
 * Listas com marcador •/numerado ficam intactas (a checkbox decide).
 */
function convertDashListsInXml(documentXml: string, numberingXml: string): string {
    // numId → abstractNumId
    const numMap = new Map<string, string>();
    for (const m of numberingXml.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"\/>/g)) {
        numMap.set(m[1], m[2]);
    }
    // abstractNumId → { ilvl → lvlText }
    const absLvl = new Map<string, Map<string, string>>();
    for (const m of numberingXml.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
        const lvls = new Map<string, string>();
        for (const lm of m[2].matchAll(/<w:lvl w:ilvl="(\d+)"[^>]*>((?:(?!<\/w:lvl>)[\s\S])*?)<\/w:lvl>/g)) {
            const lt = lm[2].match(/<w:lvlText w:val="([^"]*)"\/>/);
            if (lt) lvls.set(lm[1], lt[1]);
        }
        absLvl.set(m[1], lvls);
    }

    return documentXml.replace(PARA_RE, (para) => {
        const ppr = ownPPr(para);
        if (!ppr.includes('<w:numPr>')) return para;
        const nid = ppr.match(/<w:numId w:val="(\d+)"\/>/);
        if (!nid) return para;
        const ilvl = ppr.match(/<w:ilvl w:val="(\d+)"\/>/);
        const marker = absLvl.get(numMap.get(nid[1]) ?? '')?.get(ilvl ? ilvl[1] : '0');
        if (!marker || !/^[–—-]$/.test(marker)) return para;
        const newPPr = ppr.replace(/<w:numPr>(?:(?!<\/w:numPr>)[\s\S])*?<\/w:numPr>/, '');
        const dashRun = `<w:r><w:t xml:space="preserve">${marker} </w:t></w:r>`;
        return para.replace(ppr, newPPr + dashRun);
    });
}

/**
 * Normaliza o XML do docx ANTES do Mammoth.
 * (1) Sobrescritos: o Mammoth só reconhece <w:vertAlign w:val="superscript"> direto;
 * ignora texto elevado via <w:position> (típico de PDF→Word) e formatação definida
 * em estilos de carácter — injetamos vertAlign nesses runs.
 * (2) Notas partidas: marca continuações com pStyle "NoteCont" (ver tagNoteContinuations).
 * (3) Estrutura do miolo: pStyles sintéticos "XStructN" (ver tagBodyStructure).
 * Devolve também as entradas styleMap dinâmicas para os estilos injetados.
 */
async function normalizeDocxSuperscripts(
    arrayBuffer: ArrayBuffer,
    styleMapping: DocxStyleMapping = {}
): Promise<{ buffer: ArrayBuffer; extraStyleMap: string[]; mappedNames: Set<string> }> {
    const empty = { buffer: arrayBuffer, extraStyleMap: [], mappedNames: new Set<string>() };
    try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docFile = zip.file('word/document.xml');
        if (!docFile) return empty;
        let documentXml = await docFile.async('string');

        const numberingFile = zip.file('word/numbering.xml');
        if (numberingFile) {
            documentXml = convertDashListsInXml(documentXml, await numberingFile.async('string'));
        }

        // Estilos de carácter cuja definição inclui sobrescrito ou posição elevada
        const superscriptStyleIds = new Set<string>();
        // Estilos de título (Heading/Título 1-6) e se a sua definição centra o texto
        const headingStyles = new Map<string, { level: number; centered: boolean }>();
        const stylesFile = zip.file('word/styles.xml');
        let stylesXml = stylesFile ? await stylesFile.async('string') : null;
        if (stylesXml) {
            const styleRe = /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
            let m;
            while ((m = styleRe.exec(stylesXml)) !== null) {
                if (/<w:vertAlign w:val="superscript"/.test(m[2]) || /<w:position w:val="[1-9]\d*"/.test(m[2])) {
                    superscriptStyleIds.add(m[1]);
                }
                const name = m[2].match(/<w:name w:val="([^"]+)"\/>/);
                const lv = name?.[1].match(/^(?:heading|t[íi]tulo) ?([1-6])$/i);
                if (lv) {
                    headingStyles.set(m[1], { level: parseInt(lv[1]), centered: /<w:jc w:val="center"\/>/.test(m[2]) });
                }
            }
        }

        documentXml = documentXml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (match, inner) => {
            if (inner.includes('<w:vertAlign')) return match;
            const styleMatch = inner.match(/<w:rStyle w:val="([^"]+)"/);
            const styleIsSup = styleMatch !== null && superscriptStyleIds.has(styleMatch[1]);
            const raised = /<w:position w:val="[1-9]\d*"/.test(inner);
            if (!styleIsSup && !raised) return match;
            return `<w:rPr>${inner}<w:vertAlign w:val="superscript"/></w:rPr>`;
        });

        // Mapeamento explícito do utilizador → entradas styleMap + skip-set para as heurísticas.
        const { names: styleNames, defaultId } = stylesXml
            ? parseParagraphStyles(stylesXml)
            : { names: new Map<string, string>(), defaultId: null };
        const skipIds = new Set<string>();
        const mappedNames = new Set<string>();
        const newStyleIds: string[] = [];
        const extraStyleMap: string[] = [];
        for (const [styleId, entry] of Object.entries(styleMapping)) {
            const target = entry.target;
            if (target === 'auto') continue;
            const name = styleNames.get(styleId) ?? styleId;
            const isHeading = /^h[1-6]$/.test(target);
            let rhs;
            if (isHeading) {
                rhs = entry.centered ? `${target}.p-center:fresh` : `${target}:fresh`;
            } else {
                // parágrafo: combina a classe do alvo com p-center (centrado opcional)
                const classes = [target === 'p' ? '' : target, entry.centered && target !== 'p-center' ? 'p-center' : ''].filter(Boolean);
                rhs = classes.length ? `p.${classes.join('.')}:fresh` : 'p:fresh';
            }
            extraStyleMap.push(`p[style-name='${name}'] => ${rhs}`);
            skipIds.add(styleId);
            mappedNames.add(name);
        }

        const { noteSize, bodySize, baselineLeft } = computeFontSizes(documentXml);

        if (noteSize && bodySize && parseInt(noteSize) < parseInt(bodySize)) {
            const noteRes = tagNoteContinuations(documentXml, noteSize);
            documentXml = noteRes.xml;
            if (noteRes.tagged > 0) {
                newStyleIds.push('NoteCont');
                extraStyleMap.push("p[style-name='NoteCont'] => p.note-cont:fresh");
            }
        }

        const pageRes = tagPageContinuations(documentXml, noteSize);
        documentXml = pageRes.xml;
        if (pageRes.tagged > 0) {
            newStyleIds.push('PageCont');
            extraStyleMap.push("p[style-name='PageCont'] => p.page-cont:fresh");
        }

        const structRes = tagBodyStructure(documentXml, noteSize, bodySize, skipIds, defaultId, baselineLeft);
        documentXml = structRes.xml;
        for (const [id, classes] of structRes.styleClasses) {
            newStyleIds.push(id);
            extraStyleMap.push(`p[style-name='${id}'] => p.${classes.join('.')}:fresh`);
        }

        const headRes = tagCenteredHeadings(documentXml, headingStyles, skipIds);
        documentXml = headRes.xml;
        for (const level of headRes.levels) {
            newStyleIds.push(`XHC${level}`);
            extraStyleMap.push(`p[style-name='XHC${level}'] => h${level}.p-center:fresh`);
        }

        if (newStyleIds.length > 0 && stylesXml) {
            const defs = newStyleIds
                .map(id => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/></w:style>`)
                .join('');
            stylesXml = stylesXml.replace('</w:styles>', defs + '</w:styles>');
            zip.file('word/styles.xml', stylesXml);
        }

        zip.file('word/document.xml', documentXml);
        return { buffer: await zip.generateAsync({ type: 'arraybuffer' }), extraStyleMap, mappedNames };
    } catch (err) {
        console.error('normalizeDocxSuperscripts falhou, a usar docx original', err);
        return empty;
    }
}

async function extractHtmlFromDocx(file: File, extractOptions: ExtractOptions = {}): Promise<ExtractedDocument> {
    const { buffer: arrayBuffer, extraStyleMap, mappedNames } = await normalizeDocxSuperscripts(
        await file.arrayBuffer(),
        extractOptions.styleMapping
    );
    const images = new Map<string, Blob>();

    // Mapeamentos default de título — descartar os que o utilizador redefiniu (evita regra dupla)
    const defaultHeadingMap = [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Título 1'] => h1:fresh",
        "p[style-name='Título 2'] => h2:fresh",
        "p[style-name='Título 3'] => h3:fresh",
    ].filter(entry => {
        const name = entry.match(/style-name='([^']+)'/)?.[1];
        return !name || !mappedNames.has(name);
    });

    const options = {
        // mammoth's runtime has images.inline but its bundled .d.ts only declares imgElement
        convertImage: (mammoth.images as unknown as { inline: (f: (e: { contentType: string; read: (encoding: string) => Promise<string> }) => Promise<Record<string, string>>) => ReturnType<typeof mammoth.images.imgElement> }).inline((element) => {
            return element.read("base64").then((imageBuffer) => {
                const buffer = Uint8Array.from(atob(imageBuffer), c => c.charCodeAt(0));
                const blob = new Blob([buffer], { type: element.contentType });
                const id = `img-${uuidv4()}`;
                images.set(id, blob);

                return {
                    src: "placeholder",
                    "data-image-id": id,
                    alt: "Image from DOCX",
                    loading: "lazy"
                };
            });
        }),
        styleMap: [
            ...defaultHeadingMap,
            // Sobrescrito via estilo de carácter (Mammoth não resolve formatação
            // definida no estilo, só o nome) — comum em Word vindo de PDF
            "r[style-name='Footnote Reference'] => sup",
            "r[style-name='Endnote Reference'] => sup",
            "r[style-name='Refer. de nota de rodapé'] => sup",
            "r[style-name='Refer. de nota de fim'] => sup",
            "r[style-name='Superscript'] => sup",
            "r[style-name='Sobrescrito'] => sup",
            // Estilos sintéticos injetados no pré-processamento (NoteCont, XStructN)
            ...extraStyleMap
        ],
        includeDefaultStyleMap: true,
        includeEmbeddedStyleMap: false
    };

    const result = await mammoth.convertToHtml({ arrayBuffer }, options);

    let html = processDocxHtml(result.value, extractOptions);

    // Runs elevados de PDF→Word incluem o espaço seguinte dentro do <sup>
    // ("<sup>1 </sup>") — mover o espaço para fora para os passes de ligação casarem
    html = html.replace(/<sup>(\d+)\s+<\/sup>/g, '<sup>$1</sup> ');

    const footnoteNumbers = new Set<string>();

    // Converter footnotes reais do Mammoth
    html = html.replace(/<ol>\s*<li id="(footnote|endnote)-(\d+)">(.*?)<\/li>\s*<\/ol>/gis, (_match, _type, num, content) => {
        footnoteNumbers.add(num);
        return `<p class="footnote" id="footnote-${num}">${content}</p>`;
    });

    // Detetar parágrafos que PARECEM notas de rodapé:
    // (a) marcador sobrescrito no início — <p><sup>N</sup> texto</p>
    html = html.replace(/<p><sup>(\d+)<\/sup>\s*(.+?)<\/p>/gi, (match, num, content) => {
        if (parseInt(num) >= 1 && parseInt(num) <= 999 && content.length > 10) {
            footnoteNumbers.add(num);
            return `<p class="footnote" id="footnote-${num}"><sup>${num}</sup> ${content}</p>`;
        }
        return match;
    });
    // (b) número em texto plano com separador — <p>N. texto</p> / <p>N) texto</p>
    html = html.replace(/<p>(\d+)(\.|\))\s*(.+?)<\/p>/gi, (match, num, _sep, content) => {
        if (parseInt(num) >= 1 && parseInt(num) <= 999 && content.length > 10) {
            footnoteNumbers.add(num);
            return `<p class="footnote" id="footnote-${num}"><sup>${num}</sup> ${content}</p>`;
        }
        return match;
    });

    // Fundir continuações de notas partidas entre páginas na respetiva nota
    html = mergeNoteContinuations(html);

    // Fundir continuações de MIOLO partidas pela quebra de página (tags page-cont do XML).
    // Substitui o consolidateSplitParagraphs text-based: o sinal de secção/firstLine do XML
    // é preciso onde o text-based juntava mal frases curtas e rótulos a meio da página.
    html = mergePageContinuations(html);

    // Converter referências de notas no meio do texto
    html = html.replace(/<sup>(\d+)<\/sup>/g, (match, num) => {
        if (footnoteNumbers.has(num)) {
            return `<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
        }
        return match;
    });

    // Marcadores em texto plano: só número COLADO ao carácter anterior (letra/pontuação,
    // sem espaço) vira ref — "riqueza total.10" sim, "os 10 por cento" não.
    // (?<![<\d/]) bloqueia decimais ("3.14") e dígitos de TAGS com atributos ("<h3 class=...").
    html = html.replace(/(?<![<\d/])([a-záàâãéêíóôõúüç).\]»”".,;:!?])(\d{1,3})(?=[\s<.,;:!?)\]»”"])/gi, (match, before, num) => {
        if (footnoteNumbers.has(num)) {
            return `${before}<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
        }
        return match;
    });

    html = html.replace(/<a href="#(footnote|endnote)-(\d+)">(\d+)<\/a>/g, (_match, _type, num, text) => {
        return `<sup><a href="#footnote-${num}" class="footnote-ref">${text}</a></sup>`;
    });

    return { html, images };
}

/**
 * Funde cada <p class="note-cont"> (continuação de nota partida, marcada no XML)
 * na última <p class="footnote"> anterior em ordem de documento — entre a nota
 * e o fragmento há miolo da página seguinte, por isso não são siblings diretos.
 */
function mergeNoteContinuations(html: string): string {
    if (!html.includes('note-cont')) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const all = Array.from(doc.body.querySelectorAll('p'));
    all.forEach((p, idx) => {
        if (!p.classList.contains('note-cont')) return;
        let target: Element | null = null;
        for (let i = idx - 1; i >= 0; i--) {
            if (all[i].classList.contains('footnote')) { target = all[i]; break; }
        }
        // Só fundir se a nota anterior está INACABADA (quebra a meio). Uma nota
        // COMPLETA (termina em pontuação final) seguida de small-text do mesmo
        // tamanho é outro bloco — tipicamente o índice remissivo (sz==noteSize) —
        // e não uma continuação de nota partida.
        const prevText = target ? (target.textContent || '').trimEnd() : '';
        if (target && !/[.!?…»”")\]]$/.test(prevText)) {
            const prevHtml = target.innerHTML.trimEnd();
            const fragHtml = p.innerHTML.trim();
            const glue = prevHtml.endsWith('-') || fragHtml.startsWith('-') ? '' : ' ';
            target.innerHTML = prevHtml + glue + fragHtml;
            p.remove();
        } else {
            p.classList.remove('note-cont');
            if (!p.className) p.removeAttribute('class');
        }
    });
    return doc.body.innerHTML;
}

/**
 * Funde cada <p class="page-cont"> (continuação de miolo partida pela quebra de página,
 * marcada no XML) no parágrafo de CORPO anterior. Entre o fim do parágrafo (rodapé da
 * página) e a continuação (topo da seguinte) pode haver as definições de nota da página,
 * por isso a procura para trás salta footnote/note-cont/page-cont; um título corta a
 * procura (não se cruza). Só funde se o parágrafo anterior estiver INACABADO (não termina
 * em pontuação final) — a quebra é a meio de uma frase.
 */
function mergePageContinuations(html: string): string {
    if (!html.includes('page-cont')) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
    blocks.forEach((el, idx) => {
        if (el.tagName !== 'P' || !el.classList.contains('page-cont')) return;
        let target: Element | null = null;
        for (let i = idx - 1; i >= 0; i--) {
            const c = blocks[i];
            if (/^H[1-6]$/.test(c.tagName)) break; // não cruzar títulos
            if (c.classList.contains('footnote') || c.classList.contains('note-cont') || c.classList.contains('page-cont')) continue;
            target = c; break;
        }
        const prevText = target ? (target.textContent || '').trimEnd() : '';
        if (target && !/[.!?…»”")\]]$/.test(prevText)) {
            const prevHtml = target.innerHTML.trimEnd();
            const fragHtml = el.innerHTML.trim();
            const glue = prevHtml.endsWith('-') || fragHtml.startsWith('-') ? '' : ' ';
            target.innerHTML = prevHtml + glue + fragHtml;
            el.remove();
        } else {
            el.classList.remove('page-cont');
            if (!el.className) el.removeAttribute('class');
        }
    });
    return doc.body.innerHTML;
}

async function extractHtmlFromHtml(file: File): Promise<ExtractedDocument> {
    const text = await file.text();
    const processedHtml = convertBrToParagraphs(text);
    return {
        html: processedHtml,
        images: new Map()
    };
}

// 3-pass DOM transform: (1) [opcional] <ul> bullet lists → <p>— content</p> dialogue,
// (2) <p>Capítulo N</p> before <h1> → merged into h1 with <br>,
// (3) isolated uppercase letter after lowercase-starting paragraph → <span class="drop-cap">.
// Leaves <ol> untouched (Mammoth footnotes).
function processDocxHtml(html: string, extractOptions: ExtractOptions = {}): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Pass 1 (opcional, para romances): <ul> → parágrafos de diálogo com travessão.
    // Desligado por omissão — em livros académicos as listas são estrutura real.
    if (extractOptions.convertListsToDialogue) {
        Array.from(doc.querySelectorAll('ul'))
            .filter(ul => !ul.parentElement?.closest('ul'))
            .forEach(topUl => {
                const parent = topUl.parentNode;
                if (!parent) { topUl.remove(); return; }
                topUl.querySelectorAll('li').forEach(li => {
                    const clone = li.cloneNode(true) as Element;
                    clone.querySelectorAll('ul, ol').forEach(n => n.remove());
                    const trimmed = clone.innerHTML.trim();
                    if (!trimmed) return;
                    const p = doc.createElement('p');
                    p.innerHTML = '— ' + trimmed;
                    parent.insertBefore(p, topUl);
                });
                parent.removeChild(topUl);
            });
    }

    // Pass 1.5: rótulos partidos por tracking do PDF→Word ("C APÍTUL O 3") →
    // "Capítulo 3"; comparação feita com o texto SEM espaços; âncoras preservadas
    Array.from(doc.querySelectorAll('p')).forEach(p => {
        const compact = (p.textContent || '').replace(/\s+/g, '');
        const m = compact.match(/^(cap[ií]tulo|parte)([\divxlcm]+)\.?$/i);
        if (!m) return;
        const label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        const anchors = Array.from(p.querySelectorAll('a[id]'));
        p.textContent = `${label} ${m[2]}`;
        anchors.forEach(a => { a.textContent = ''; p.insertBefore(a, p.firstChild); });
    });

    // Pass 2: <p>Capítulo N</p> before <h1>/<h2> → merge into the heading with <br>
    Array.from(doc.querySelectorAll('p')).forEach(p => {
        const text = p.textContent?.trim() || '';
        if (!/^cap[ií]tulo\s+[\dIVXLCMivxlcm]+\.?$/i.test(text)) return;
        const next = p.nextElementSibling;
        if (!next || (next.tagName !== 'H1' && next.tagName !== 'H2')) return;
        next.innerHTML = p.innerHTML + '<br>' + next.innerHTML;
        p.parentNode?.removeChild(p);
    });

    // Pass 3: isolated uppercase letter paragraph → <span class="drop-cap">
    const paragraphs = Array.from(doc.querySelectorAll('p'));
    for (let i = 1; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const text = p.textContent?.trim() || '';
        if (text.length !== 1 || !/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]$/.test(text)) continue;

        const prev = p.previousElementSibling;
        if (!prev || prev.tagName !== 'P') continue;

        const prevText = prev.textContent?.trim() || '';
        if (!prevText || !/^[a-záàâãéêíóôõúü]/.test(prevText)) continue;

        const span = doc.createElement('span');
        span.className = 'drop-cap';
        span.textContent = text;
        prev.insertBefore(span, prev.firstChild);
        p.parentNode?.removeChild(p);
        i--;
    }

    return doc.body.innerHTML;
}

/**
 * Converts <br> tags to proper paragraph tags
 * Multiple consecutive <br> tags are treated as paragraph breaks
 */
function convertBrToParagraphs(html: string): string {
    // First, normalize all <br> variants to a single format
    let normalized = html
        .replace(/<br\s*\/?>/gi, '<br>')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // Replace multiple consecutive <br> tags (2 or more) with paragraph markers
    // This treats double line breaks as paragraph separators
    normalized = normalized.replace(/(<br>\s*){2,}/gi, '</p><p>');

    // Replace single <br> tags with paragraph breaks
    // This converts single line breaks into paragraph boundaries
    normalized = normalized.replace(/<br>/gi, '</p><p>');

    // Wrap the content in a temporary container for parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${normalized}</div>`, 'text/html');
    const container = doc.querySelector('div');

    if (!container) {
        return html;
    }

    // Convert paragraphs containing red content to <p class="footnote">
    container.querySelectorAll('p').forEach((p) => {
        let redEl: Element | null = null;

        for (const el of Array.from(p.querySelectorAll('font[color]'))) {
            if (el.getAttribute('color')?.toLowerCase() === '#ff0000') { redEl = el; break; }
        }
        if (!redEl) {
            for (const el of Array.from(p.querySelectorAll('span[style]'))) {
                const styleColor = (el as HTMLElement).style.color;
                if (styleColor === 'rgb(255, 0, 0)' || styleColor === 'red' ||
                    el.getAttribute('style')?.toLowerCase().includes('color:#ff0000') ||
                    el.getAttribute('style')?.toLowerCase().includes('color: #ff0000')) {
                    redEl = el;
                    break;
                }
            }
        }

        if (redEl) {
            const allText = p.textContent || '';
            const redText = redEl.textContent || '';
            const hasOnlyRedContent = allText.trim().replace(/\s+/g, ' ') === redText.trim().replace(/\s+/g, ' ');

            let parent = redEl.parentElement;
            let onlySpansInPath = true;
            while (parent && parent !== p) {
                if (parent.tagName !== 'SPAN') {
                    onlySpansInPath = false;
                    break;
                }
                parent = parent.parentElement;
            }

            if (hasOnlyRedContent && onlySpansInPath) {
                p.className = 'footnote';
                p.innerHTML = redEl.innerHTML;
            }
        }
    });

    // Remove gray color wrappers, keep inner content
    Array.from(container.querySelectorAll('font[color]'))
        .filter(el => el.getAttribute('color')?.toLowerCase() === '#231f20')
        .forEach(el => {
            const parent = el.parentNode;
            if (parent) { while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el); }
        });
    Array.from(container.querySelectorAll('span[style]'))
        .filter(el => (el as HTMLElement).style.color === 'rgb(35, 31, 32)')
        .forEach(el => {
            const parent = el.parentNode;
            if (parent) { while (el.firstChild) parent.insertBefore(el.firstChild, el); parent.removeChild(el); }
        });

    const result: string[] = [];
    let currentParagraph = '';

    const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text) {
                currentParagraph += node.textContent;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const blockElements = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE'];

            if (blockElements.includes(element.tagName)) {
                if (currentParagraph.trim()) {
                    result.push(`<p>${currentParagraph.trim()}</p>`);
                    currentParagraph = '';
                }
                result.push(element.outerHTML);
            } else {
                currentParagraph += element.outerHTML;
            }
        }
    };

    container.childNodes.forEach(processNode);

    if (currentParagraph.trim()) {
        result.push(`<p>${currentParagraph.trim()}</p>`);
    }

    let finalHtml = result.join('\n')
        .replace(/<p>\s+/g, '<p>')
        .replace(/\s+<\/p>/g, '</p>')
        .replace(/(<\/p>)\s*(<p>)/g, '$1\n$2');

    finalHtml = finalHtml
        .replace(/<p[^>]*>(?:<span[^>]*>)*<font\s+color=["']?#ff0000["']?[^>]*>([\s\S]*?)<\/font>(?:<\/span>)*<\/p>/gi, '<p class="footnote">$1</p>')
        .replace(/<p[^>]*>(?:<span[^>]*>)*<span[^>]*style="[^"]*color:\s*(?:#ff0000|rgb\(255,\s*0,\s*0\))[^"]*"[^>]*>([\s\S]*?)<\/span>(?:<\/span>)*<\/p>/gi, '<p class="footnote">$1</p>')
        .replace(/<font\s+color=["']?#231f20["']?[^>]*>([\s\S]*?)<\/font>/gi, '$1')
        .replace(/<span\s+style="[^"]*color:\s*(?:#231f20|rgb\(35,\s*31,\s*32\))[^"]*">([\s\S]*?)<\/span>/gi, '$1');

    return finalHtml;
}
