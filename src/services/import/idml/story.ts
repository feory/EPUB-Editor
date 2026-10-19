import type { DocxStyleTarget, DocxStyleMapping } from '../document-importer';
import { resolveFillColor, type IdmlStyles } from './styles';

// Contexto de renderização de histórias: estilos do pacote IDML em curso + opção de espaçamento.
// (Antes: variáveis globais do módulo, repostas por extractIdml a cada idmlZip.)
export interface RenderContext {
    styles: IdmlStyles;
    detectSpacing: boolean; // import: SpaceBefore/SpaceAfter → p-top/p-bottom (só com PDF de impressão como árbitro)
}

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

// Destino escolhido pelo utilizador (DocxStyleTarget) → elemento/classe no editor.
// `top` adiciona p-top (espaço acima) — igual a `centered`, independente do alvo ser título
// (h1-h6, junta-se ao tag) ou parágrafo (junta-se às classes).
function targetToTag(target: DocxStyleTarget, centered?: boolean, top?: boolean): { tag: string; cls?: string } {
    if (/^h[1-6]$/.test(target)) {
        const cls = [centered ? 'p-center' : '', top ? 'p-top' : ''].filter(Boolean).join(' ');
        return cls ? { tag: target, cls } : { tag: target };
    }
    // parágrafo: combina a classe do alvo com p-center/p-top (opcionais do utilizador)
    const classes = [target === 'p' ? '' : target, centered && target !== 'p-center' ? 'p-center' : '', top ? 'p-top' : ''].filter(Boolean);
    return classes.length ? { tag: 'p', cls: classes.join(' ') } : { tag: 'p' };
}

// Resolve o estilo de um parágrafo: a escolha do utilizador (mapping) vence; 'auto' ou
// ausente → default interno (STYLE_MAP), que inclui o 'merge' dos números de capítulo.
function resolveStyle(name: string, mapping: DocxStyleMapping): { tag: string; cls?: string } | 'merge' {
    const entry = mapping[name];
    if (entry && entry.target !== 'auto') return targetToTag(entry.target, entry.centered, entry.top);
    const base = STYLE_MAP[name] ?? { tag: 'p' };
    // 'auto' com "Centrado"/"Topo" marcado: mantém a classificação por omissão, força as classes nela.
    if ((entry?.centered || entry?.top) && base !== 'merge') {
        const cls = [base.cls, entry.centered ? 'p-center' : '', entry.top ? 'p-top' : ''].filter(Boolean).join(' ');
        return { tag: base.tag, cls };
    }
    return base;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Separadores de linha do InDesign (line/paragraph separator) e tabs → espaço. Hífen mole
// (U+00AD, ponto de hifenização invisível, só ativo na quebra de linha impressa) sai sempre —
// nunca serve num ebook reflow.
export const cleanText = (s: string) => s
    .replace(/\u00ad/g, "")
    .replace(/[\u2028\u2029\t]+/g, " ");

// "palavra- -composta": artefacto de hifenação Word→InDesign (hífen de quebra de linha a
// coincidir com o hífen próprio de uma palavra composta, ex. "ginásio- -sede", "destacou- -se")
// → um só hífen, sem espaço. Aplicado ao texto acumulado do PARÁGRAFO inteiro (flush() em
// renderPsr), não a cada <Content> isolado: a palavra fica muitas vezes partida entre dois
// <CharacterStyleRange> (mudança de Tracking/PointSize a meio da palavra, ex. "Saint-<quebra>-"
// + novo run "Aubin-du-Cormier", livro real "Escritos Políticos") — dentro de um único
// <Content> a regex nunca via a letra do lado de lá da fronteira.
const HYPHEN_LINEBREAK_RE = /(\p{L})-\s+-((?:<[^>]+>)*)(\p{L})/gu;
export const collapseHyphenBreaks = (s: string) => s.replace(HYPHEN_LINEBREAK_RE, "$1-$2$3");

export function styleName(attr: string | null): string {
    return (attr || '').split('/').pop() || '';
}

// Story não-threaded cujo estilo de título não bate com STRUCTURAL_STYLES (livros com
// nomenclatura própria, ex. "TÍTULOS CAP" em vez de "CAPÍTULOS_TÍTULOS") mas cujo utilizador
// já mapeou explicitamente esse estilo a um alvo real (h1/h2/…, não 'auto') no import — sinal
// inequívoco de conteúdo narrativo, evita depender só do regex fixo. Sem isto, um capítulo de
// 1 frame só (ex. "Agradecimentos") com esse estilo desaparecia silenciosamente do import.
export function hasUserMappedStyle(xml: string, mapping: DocxStyleMapping): boolean {
    const re = /AppliedParagraphStyle="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
        const entry = mapping[styleName(m[1])];
        if (entry && entry.target !== 'auto') return true;
    }
    return false;
}

export interface NoteCounter { n: number; star: number; defs: string[] }
export interface Segment { text: string; notes: string[]; raw?: string }

// Aplica itálico/negrito (FontStyle do CharacterStyleRange) a um pedaço de texto já escapado.
function withFontStyle(text: string, fs: string): string {
    if (!text.trim()) return text;
    if (/Italic|Oblique/i.test(fs)) text = `<em>${text}</em>`;
    if (/Bold|Semibold|Demi|Black|Heavy/i.test(fs)) text = `<strong>${text}</strong>`;
    return text;
}

// Recuo inline a partir do estilo/override do parágrafo — bloco (LeftIndent) e/ou só 1ª linha
// (FirstLineIndent, ex. estilo base do corpo com recuo tipográfico normal). Override PRÓPRIO do
// parágrafo (ex. FirstLineIndent="0" numa fala/rótulo) vence o default do estilo.
function indentStyle(rc: RenderContext, psr: Element, fullPS: string): string {
    const def = rc.styles.paraIndents.get(fullPS);
    const left = parseFloat(psr.getAttribute('LeftIndent') || '') || def?.left || 0;
    const firstAttr = psr.getAttribute('FirstLineIndent');
    const first = firstAttr !== null ? parseFloat(firstAttr) || 0 : def?.first || 0;
    if (left <= 0 && first <= 0) return ''; // sem recuo algum → não tocar
    const em = (pt: number) => `${(pt / 12).toFixed(2)}em`;
    if (left <= 0) return ` style="text-indent:${em(first)}"`; // só 1ª linha, sem bloco
    let s = `margin-left:${em(left)}`;
    if (first) s += `;text-indent:${em(first)}`; // negativo = hanging (1ª linha sai)
    return ` style="${s}"`;
}

// Traduz SpaceBefore/SpaceAfter (estilo + override do parágrafo, mesmo padrão de indentStyle)
// em p-top/p-bottom — só quando detectSpacing está ligado (opção de importação).
function spacingClasses(rc: RenderContext, psr: Element, fullPS: string): string {
    if (!rc.detectSpacing) return '';
    const def = rc.styles.paraIndents.get(fullPS);
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
export function accumulateSpacing(
    rc: RenderContext,
    story: Element,
    acc: Map<string, SpacingStyleInfo>,
): void {
    const dummyCounter: NoteCounter = { n: 0, star: 0, defs: [] }; // scan só — descartado
    let blankBefore = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue;
        const fullPS = psr.getAttribute('AppliedParagraphStyle') || '';
        const name = styleName(fullPS);
        const def = rc.styles.paraIndents.get(fullPS);
        const before = parseFloat(psr.getAttribute('SpaceBefore') || '') || def?.spaceBefore || 0;
        const after = parseFloat(psr.getAttribute('SpaceAfter') || '') || def?.spaceAfter || 0;
        for (const seg of renderPsr(rc, psr, dummyCounter)) {
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
export function renderPsr(rc: RenderContext, psr: Element, counter: NoteCounter): Segment[] {
    const segs: Segment[] = [];
    let cur = '';
    let curNotes: string[] = [];
    const flush = () => { segs.push({ text: collapseHyphenBreaks(cur.trim()), notes: curNotes }); cur = ''; curNotes = []; };
    // FontStyle do estilo de PARÁGRAFO (fallback de mais baixa prioridade): aplica-se aos runs
    // que não definem FontStyle próprio nem via estilo de carácter (ex. marcador "a)" das alíneas
    // num parágrafo Num2 Bold; o corpo, com FontStyle="Roman" explícito, mantém-se roman).
    const paraFS = rc.styles.paraIndents.get(psr.getAttribute('AppliedParagraphStyle') || '')?.fontStyle || '';
    // Idem para Capitalization definida no ESTILO DE PARÁGRAFO (ex. "CAD AUT_TIT" com
    // Capitalization="SmallCaps" na própria definição, não no run nem no estilo de carácter).
    const paraCap = rc.styles.paraIndents.get(psr.getAttribute('AppliedParagraphStyle') || '')?.cap || '';

    // Processa os filhos de um CharacterStyleRange (ou de um container como HyperlinkTextSource)
    // recursivamente. Os atributos de formatação (fs/cap/pos) vêm do CharacterStyleRange pai.
    const processChildren = (parent: Element, fs: string, cap: string, pos: string, color: string) => {
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
                    // Cor de texto explícita do run (ex. header de tabela com fundo escuro, texto
                    // "Color/Paper" branco) — sem isto ficava sempre preto, ilegível sobre fundos
                    // escuros. Só aplica quando resolveFillColor devolve algo (Swatch/None → '').
                    if (color) piece = `<span style="color:${color}">${piece}</span>`;
                }
                cur += piece;
            } else if (el.tagName === 'Table') {
                // Tabela nativa do InDesign, ancorada inline no run — bloco à parte (não cabe
                // dentro do <p> do parágrafo-âncora). Só fecha o texto acumulado até aqui (se
                // houver algum — o parágrafo-âncora tipicamente está vazio, sem isto deixava um
                // segmento vazio a mais → falso positivo de "linha em branco"); emite a tabela
                // como segmento raw (renderStory insere sem envolver em <tag>).
                if (cur.trim() || curNotes.length) flush(); else { cur = ''; curNotes = []; }
                const table = renderIdmlTable(rc, el, counter);
                if (table) segs.push({ text: '', notes: [], raw: table });
            } else if (el.tagName === 'Br') {
                flush(); // quebra de parágrafo
            } else if (el.tagName === 'Footnote') {
                const innerSegs = Array.from(el.children)
                    .filter(c => c.tagName === 'ParagraphStyleRange')
                    .flatMap(p => renderPsr(rc, p, counter));
                const nonEmptySegs = innerSegs.map(s => s.text).filter(Boolean);
                // Notas mistas (ex.: * nota da revisão <Br/> nota numerada): o InDesign coloca
                // ambas dentro do mesmo <Footnote> separadas por <Br/>. Dividimos para manter
                // a estrutura original — asterisco + número no corpo, duas notas separadas.
                const firstIsStar = nonEmptySegs.length > 0 && /^\s*<sup>\*<\/sup>|^\*/.test(nonEmptySegs[0].trim());
                const hasNumberedTail = firstIsStar && nonEmptySegs.length > 1 && !/^\s*<sup>\*<\/sup>|^\*/.test(nonEmptySegs[1].trim());
                if (hasNumberedTail) {
                    counter.star++;
                    const starNum = counter.star;
                    // Strip "()" residual: número da nota no InDesign é campo auto-numerado
                    // (<?ACE?>, PI ignorado ao processar) entre parênteses literais — sobra
                    // um par vazio onde o dígito devia aparecer; o <sup> que geramos a seguir
                    // (contador próprio) é que faz de número visível, por isso entra dentro
                    // desse par em vez de ficar solto antes dele.
                    const starBody = nonEmptySegs[0].replace(/^\s*<sup>\*<\/sup>\s*/, '').trim().replace(/^\(\)\s*/, '');
                    // Nota mista: no corpo mantém-se só o número; o asterisco é só um marcador
                    // interno da nota de revisão/tradutor.
                    if (cur.endsWith('<sup>*</sup>')) cur = cur.slice(0, -'<sup>*</sup>'.length);
                    curNotes.push(`<p class="footnote" id="footnote-star-${starNum}">(<sup>*</sup>) ${starBody}</p>`);
                    counter.n++;
                    const num = counter.n;
                    const numBody = nonEmptySegs.slice(1).join(' ').trim().replace(/^\(\)\s*/, '');
                    cur += `<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
                    curNotes.push(`<p class="footnote" id="footnote-${num}">(<sup>${num}</sup>) ${numBody}</p>`);
                } else if (firstIsStar) {
                    counter.star++;
                    const starNum = counter.star;
                    const starBody = nonEmptySegs.join(' ').replace(/^\s*<sup>\*<\/sup>\s*/, '').trim().replace(/^\(\)\s*/, '');
                    if (cur.endsWith('<sup>*</sup>')) {
                        cur = cur.slice(0, -'<sup>*</sup>'.length) + `<sup><a href="#footnote-star-${starNum}" class="footnote-ref">*</a></sup>`;
                    } else {
                        cur += `<sup><a href="#footnote-star-${starNum}" class="footnote-ref">*</a></sup>`;
                    }
                    curNotes.push(`<p class="footnote" id="footnote-star-${starNum}">(<sup>*</sup>) ${starBody}</p>`);
                } else {
                    counter.n++;
                    const num = counter.n;
                    const numBody = nonEmptySegs.join(' ').trim().replace(/^\(\)\s*/, '');
                    cur += `<sup><a href="#footnote-${num}" class="footnote-ref">${num}</a></sup>`;
                    curNotes.push(`<p class="footnote" id="footnote-${num}">(<sup>${num}</sup>) ${numBody}</p>`);
                }
            } else if (el.tagName === 'HyperlinkTextSource' || el.tagName === 'CharacterStyleRange') {
                // Índice gerado pelo InDesign: o texto das entradas vive dentro de HyperlinkTextSource,
                // que por sua vez pode envolver CharacterStyleRange. Actualiza os atributos de
                // formatação quando descemos para um CharacterStyleRange interior.
                const childFs = el.getAttribute('FontStyle') || fs;
                const childCap = el.getAttribute('Capitalization') || cap;
                const childPos = el.getAttribute('Position') || pos;
                const childColor = resolveFillColor(rc.styles, el.getAttribute('FillColor'), el.getAttribute('FillTint')) || color;
                processChildren(el, childFs, childCap, childPos, childColor);
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
            // carácter aplicado (CharacterStyle/Bold etc.) — ver IdmlStyles.charStyles (styles.ts).
            const acsDef = rc.styles.charStyles.get(csr.getAttribute('AppliedCharacterStyle') || '');
            const fs = csr.getAttribute('FontStyle') || acsDef?.fontStyle || paraFS || '';
            // Capitalization do InDesign: SmallCaps (numerais romanos "século xx", "capítulo iv")
            // → <span class="small-caps">; AllCaps → maiúsculas. Sem isto sairiam minúsculos.
            const cap = csr.getAttribute('Capitalization') || acsDef?.cap || paraCap || '';
            // Position do InDesign: Superscript (ordinais "6.º"/"n.º", o "o" elevado) → <sup>,
            // Subscript → <sub>. Atributo direto do run (ex. ×5732 em "Direito das Migrações")
            // ou herdado do estilo de carácter. As notas (<Footnote>) têm o seu próprio <sup>.
            const pos = csr.getAttribute('Position') || acsDef?.position || '';
            // Cor de texto do run (ex. cabeçalho de tabela com fundo escuro, texto branco) —
            // "Swatch/None"/preto/cor desconhecida resolvem para '' (resolveFillColor), sem efeito.
            const color = resolveFillColor(rc.styles, csr.getAttribute('FillColor'), csr.getAttribute('FillTint'));
            processChildren(csr, fs, cap, pos, color);
        } else if (child.tagName === 'HyperlinkTextSource') {
            processChildren(child, paraFS, '', '', '');
        }
    }
    // Cada <Br/> já chama flush() a si próprio (linha em branco real = <Br/> duplo, sem nada
    // entre eles). Um <ParagraphStyleRange> comum TERMINA em <Br/> (terminador de parágrafo do
    // IDML) — nesse ponto `cur`/`curNotes` já estão vazios do último flush(), e chamar flush()
    // aqui incondicionalmente empurrava um segmento vazio FANTASMA a seguir a QUALQUER parágrafo
    // normal (não só linhas em branco reais). Isso marcava blankBefore=true para o parágrafo
    // seguinte SEMPRE, em 100% das transições — afogava o sinal real (SpaceBefore/SpaceAfter e
    // linhas em branco genuínas) em falsos positivos universais, e a app parecia nunca aplicar
    // espaçamento nenhum. Só fecha aqui se sobrar conteúdo por gravar (ex. sem <Br/> final).
    if (cur.trim() || curNotes.length) flush();
    return segs; // inclui segmentos vazios (linha em branco = <Br/> duplo); o caller decide
}

// Tabela nativa do InDesign (elemento <Table>, ancorada inline num CharacterStyleRange) → <table>
// HTML. `Cell/@Name` = "coluna:linha" (0-based) — agrupa por linha, ordena por coluna dentro da
// linha; `HeaderRowCount` linhas iniciais viram <th>. Células fundidas (RowSpan/ColumnSpan > 1) →
// rowspan/colspan: o InDesign só lista a célula de origem, as cobertas não existem no XML.
function renderIdmlTable(rc: RenderContext, tableEl: Element, counter: NoteCounter): string {
    const headerRows = parseInt(tableEl.getAttribute('HeaderRowCount') || '0') || 0;
    const grid = new Map<number, Map<number, { html: string; bg: string; attrs: string; align: string }>>(); // linha → coluna → célula
    let maxRow = -1;
    for (const cell of Array.from(tableEl.children)) {
        if (cell.tagName !== 'Cell') continue;
        const [colStr, rowStr] = (cell.getAttribute('Name') || '0:0').split(':');
        const col = parseInt(colStr) || 0;
        const row = parseInt(rowStr) || 0;
        maxRow = Math.max(maxRow, row);
        const lines: string[] = [];
        let allCentered = true; // texto centrado só se TODOS os parágrafos com texto o estiverem
        for (const psr of Array.from(cell.children)) {
            if (psr.tagName !== 'ParagraphStyleRange') continue;
            const text = renderPsr(rc, psr, counter).map(s => s.text).filter(Boolean).join('<br>');
            if (!text) continue;
            lines.push(text);
            if (psr.getAttribute('Justification') !== 'CenterAlign') allCentered = false;
        }
        const span = (name: string, attr: string) => { const n = parseInt(cell.getAttribute(name) || '1'); return n > 1 ? ` ${attr}="${n}"` : ''; };
        const bg = resolveFillColor(rc.styles, cell.getAttribute('FillColor'), cell.getAttribute('FillTint'));
        let rowMap = grid.get(row);
        if (!rowMap) { rowMap = new Map(); grid.set(row, rowMap); }
        const align = [
            lines.length && allCentered ? 'text-align:center' : '',
            cell.getAttribute('VerticalJustification') === 'CenterAlign' ? 'vertical-align:middle' : '',
        ].filter(Boolean);
        rowMap.set(col, { html: lines.join('<br>'), bg, attrs: span('RowSpan', 'rowspan') + span('ColumnSpan', 'colspan'), align: align.join(';') });
    }
    // Tabela só com gráficos (ex. figura ancorada numa célula): a imagem entra à parte (figures.ts) — a tabela ficava vazia.
    const empty = [...grid.values()].every(row => [...row.values()].every(c => !c.html));
    if (empty && tableEl.getElementsByTagName('Rectangle').length > 0) return '';
    const out: string[] = ['<table>'];
    for (let r = 0; r <= maxRow; r++) {
        const rowMap = grid.get(r);
        if (!rowMap) continue;
        const tag = r < headerRows ? 'th' : 'td';
        const cols = [...rowMap.keys()].sort((a, b) => a - b);
        out.push(`<tr>${cols.map(c => {
            const cell = rowMap.get(c);
            const decls = [cell?.bg ? `background-color:${cell.bg}` : '', cell?.align].filter(Boolean).join(';');
            return `<${tag}${cell?.attrs ?? ''}${decls ? ` style="${decls}"` : ''}>${cell?.html || ''}</${tag}>`;
        }).join('')}</tr>`);
    }
    out.push('</table>');
    return out.join('');
}

// Título "disfarçado" de corpo: alguns títulos (ex. "Índice", "Índice remissivo") usam o
// estilo de parágrafo do corpo (TEXTO) e só se distinguem visualmente — CENTRADOS, texto
// CURTO (uma linha de título, não um parágrafo) e num run maior/mais forte (≥13pt Medium/Bold).
// SpanColumns aparece em alguns (índice remissivo) mas não noutros (índice) → não é exigido.
export function isHeuristicTitle(psr: Element): boolean {
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

const INDEX_TITLE_RE = /^índice(\s+remissivo)?$/i;

export function renderStory(rc: RenderContext, xml: string, counter: NoteCounter, mapping: DocxStyleMapping): string {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    // Atenção: o root é <idPkg:Story> (localName também "Story"); querySelector('Story')
    // casa por localName e apanharia o root. getElementsByTagName casa o qualified name
    // → devolve o <Story> interno (sem prefixo), que é o que contém os parágrafos.
    const story = doc.getElementsByTagName('Story')[0];
    if (!story) return '';
    const out: string[] = [];
    let pendingLabel = ''; // nº de capítulo/parte à espera do título seguinte
    let pendingLabelTag: string = 'h1'; // tag do próprio rótulo (h1/h2/…) — usado se ficar sem título
    let pendingLabelClass = ''; // classes do próprio rótulo (p-center/p-top/…) — idem
    // Dentro de um capítulo "Índice"/"Índice remissivo": abre por título heurístico (abaixo) OU,
    // aqui, quando o 1º parágrafo não-vazio da story É literalmente "índice"/"índice remissivo" —
    // cobre o caso (este livro) em que esse título não tem Justification/PointSize inline
    // (herda tudo da DEFINIÇÃO do estilo de parágrafo) e por isso não passa em isHeuristicTitle.
    const firstText = (Array.from(story.children).find(c =>
        c.tagName === 'ParagraphStyleRange' && (c.textContent || '').replace(/\s+/g, ' ').trim()
    )?.textContent || '').replace(/\s+/g, ' ').trim();
    let inIndexChapter = INDEX_TITLE_RE.test(firstText);
    // Estilo do último heading emitido, para fundir headings CONSECUTIVOS do mesmo estilo
    // (nº de capítulo + subtítulo(s) em parágrafos próprios, todos com o mesmo estilo de
    // título) num só <hN> — o InDesign separa-os, mas visualmente formam um título único.
    // null sempre que corpo normal é emitido a seguir (a sequência quebra-se).
    let lastHeadingStyle: string | null = null;
    // Linha em branco manual (segmento vazio) antes de um <p> → também conta como espaçamento
    // (muitos livros usam isto em vez de SpaceBefore/SpaceAfter); só com detectSpacing ligado.
    let blankBefore = false;
    for (const psr of Array.from(story.children)) {
        if (psr.tagName !== 'ParagraphStyleRange') continue; // ignora ranges aninhados (notas)
        const fullPS = psr.getAttribute('AppliedParagraphStyle') || '';
        const sn = styleName(fullPS);
        const rawMap = resolveStyle(sn, mapping);
        const segs = renderPsr(rc, psr, counter);

        if (rawMap === 'merge') {
            const text = segs.map(s => s.text).join(' ').trim();
            if (text) { pendingLabel = text; pendingLabelTag = 'h1'; pendingLabelClass = ''; }
            continue;
        }

        // Título disfarçado de corpo (centrado, ≤60 car, ≥13pt Medium) → h1.
        // Vence a classe de corpo: mesmo que o estilo (ex. TEXTO) tenha sido mapeado para um
        // estilo de parágrafo com classe (p-center, p-indent…), este parágrafo específico é
        // visualmente um título → h1. Só NÃO se aplica se já for heading (h1-6 mapeado à mão).
        const heurTitle = !inIndexChapter && rawMap.tag === 'p' && isHeuristicTitle(psr);

        // Entradas do índice reaproveitam muitas vezes o MESMO estilo nomeado do título real
        // (nome do capítulo colado no índice, ex. estilo "1." usado tanto no capítulo como na
        // sua entrada na lista) — mapeado pelo utilizador para h1-6, isso promovia cada entrada
        // a capítulo próprio. Dentro do índice, só a abertura de capítulo real (drop-cap) escapa.
        const suppressHeading = inIndexChapter && /^h[1-6]$/.test(rawMap.tag) && rawMap.cls !== 'drop-cap';

        // Fronteira do capítulo "Índice": abre no título heurístico, mas só quando o texto é
        // mesmo "Índice"/"Índice remissivo" — heurTitle sozinho apanha QUALQUER título
        // disfarçado (ex. "Nota do Editor", título de capítulo sem estilo h1 mapeado); sem este
        // filtro, um livro sem CAPITULAR (nunca fecha a suspensão) perdia a classe mapeada do
        // corpo INTEIRO a partir do 1º título heurístico de cada story. Fecha só na abertura de
        // capítulo real (drop-cap) — headings genéricos dentro do índice já são suprimidos
        // acima, não fecham (senão a 1ª entrada da lista reabria a suspensão para as seguintes).
        const heurText = (psr.textContent || '').replace(/\s+/g, ' ').trim();
        if (heurTitle && INDEX_TITLE_RE.test(heurText)) inIndexChapter = true;
        else if (rawMap.cls === 'drop-cap') inIndexChapter = false;
        // Sem CAPITULAR (livro sem letra capitular) a suspensão nunca fechava — ver aviso
        // acima. Fecha também ao encontrar um parágrafo de corpo claramente longo (prosa real
        // de capítulo, não uma linha/bloco de listagem do índice): 120 car. é bem acima de
        // qualquer entrada de índice (títulos ≤60 car., ver isHeuristicTitle) e bem abaixo de
        // qualquer parágrafo de corpo real.
        else if (inIndexChapter && rawMap.tag === 'p' && heurText.length > 120) inIndexChapter = false;

        // Corpo DENTRO do índice não herda o estilo de import mapeado → auto (corpo simples + LeftIndent).
        const indexBody = inIndexChapter && !heurTitle && rawMap.tag === 'p';
        const map = (indexBody || suppressHeading) ? { tag: 'p' as const } : rawMap;
        // Honrar o LeftIndent do IDML só em <p> PLANO e NÃO mapeado (estilo escolhido vence; índice = auto).
        const mapped = !indexBody && !suppressHeading && !!(mapping[sn] && mapping[sn].target !== 'auto');
        const { tag, cls } = heurTitle ? { tag: 'h1' as const, cls: '' } : map;
        const spacing = tag === 'p' ? spacingClasses(rc, psr, fullPS) : '';
        // Alinhamento centrado é um OVERRIDE inline do parágrafo (desvio do default do estilo,
        // ex. nomes de personagem em peças de teatro, mesmo estilo "TXT" do corpo) — sinal
        // fiável independente do estilo nomeado/mapeamento do utilizador.
        const inlineCenter = tag === 'p' && !(cls || '').includes('p-center') && psr.getAttribute('Justification') === 'CenterAlign';
        const baseClasses = [cls, spacing, inlineCenter ? 'p-center' : ''].filter(Boolean);
        const styleAttr = (!cls && tag === 'p' && !mapped) ? indentStyle(rc, psr, fullPS) : '';

        if (/^h[1-6]$/.test(tag)) {
            // TÍTULO: o <Br/> é quebra de LINHA (número + título), não de parágrafo → UM só heading.
            // Juntar os segmentos com <br> (o split de capítulos troca <br> por espaço no TOC).
            let body = segs.map(s => s.text).filter(Boolean).join('<br>');
            if (!body && segs.every(s => s.notes.length === 0)) continue;
            // Nº de capítulo/parte SOZINHO (ex. "1", "23", "Capítulo 1.", "Parte 2") mapeado pelo
            // utilizador para heading — estilo próprio do livro (ex. "CAP_#", ou grupo IDML tipo
            // "CAPÍTULOS/NÚMEROS"), não coberto pelo 'merge' hardcoded do STYLE_MAP (esse só
            // conhece os nomes fixos "CAPÍTULOS_#"/"PARTES_#"). Funciona como rótulo à espera do
            // título seguinte, tal como o 'merge' — nunca funde por TAG (isso fundiria também
            // duas heading NÃO relacionadas, ex. divisória de Parte + 1º capítulo).
            if (/^(cap[íi]tulo|parte)?\s*\d{1,3}\.?$/i.test(body) && segs.every(s => s.notes.length === 0)) {
                pendingLabel = body;
                pendingLabelTag = tag; // preserva o alvo escolhido pelo utilizador (h1/h2/…) para quando ficar sem título a seguir
                pendingLabelClass = baseClasses.join(' '); // idem para as classes (p-center/p-top/…)
                continue;
            }
            if (pendingLabel) { body = `${pendingLabel}<br>${body}`; pendingLabel = ''; }
            // Heading CONSECUTIVO do mesmo ESTILO do anterior (ver lastHeadingStyle) → funde no
            // <hN> já emitido (linha extra, <br>) em vez de abrir um novo.
            if (sn && sn === lastHeadingStyle && out.length > 0 && out[out.length - 1].endsWith(`</${tag}>`)) {
                const last = out[out.length - 1];
                out[out.length - 1] = last.slice(0, -(`</${tag}>`.length)) + '<br>' + body + `</${tag}>`;
                for (const seg of segs) for (const def of seg.notes) out.push(def);
                blankBefore = false;
                continue;
            }
            const attr = baseClasses.length ? ` class="${baseClasses.join(' ')}"` : '';
            out.push(`<${tag}${attr}>${body}</${tag}>`);
            for (const seg of segs) for (const def of seg.notes) out.push(def);
            blankBefore = false; // título consome a linha em branco anterior
            lastHeadingStyle = sn || null;
            continue;
        }

        // Corpo normal a seguir → quebra a sequência de headings, EXCETO se for só uma linha em
        // branco (espaçamento visual entre nº e título, ex. "Capítulo 1." <linha vazia> "Título"
        // — layout comum, não é conteúdo real); a sequência mantém-se para ainda fundir o título.
        const isBlankOnly = segs.every(s => !s.text && !s.raw && s.notes.length === 0);
        if (!isBlankOnly) {
            lastHeadingStyle = null;
            // Rótulo pendente (nº de capítulo/parte sem título próprio a seguir — ex. livros onde
            // o capítulo É só o número, corpo vem logo a seguir) nunca aparece: sem isto ficava à
            // espera indefinidamente do PRÓXIMO heading (por vezes muitos parágrafos de corpo
            // depois), fundindo-se com o título de uma secção totalmente não relacionada (ex.
            // interlúdio "Caderno da Autora") e apagando o capítulo numerado do import.
            if (pendingLabel) {
                const attr = pendingLabelClass ? ` class="${pendingLabelClass}"` : '';
                out.push(`<${pendingLabelTag}${attr}>${pendingLabel}</${pendingLabelTag}>`);
                pendingLabel = '';
            }
        }
        for (const seg of segs) {
            if (seg.raw) { out.push(seg.raw); continue; } // tabela — já é HTML de bloco, não envolver em <tag>
            if (!seg.text && seg.notes.length === 0) {
                // Parágrafo vazio com "Regra abaixo" (RuleBelow) do InDesign = divisória visual
                // (barra fina), não espaço em branco — vira <hr> (pequena; RuleBelowLeftIndent/
                // RightIndent recolhidos já indicam divisória estreita, não full-width).
                if (psr.getAttribute('RuleBelow') === 'true') { out.push('<hr>'); blankBefore = false; continue; }
                blankBefore = true; continue; // linha em branco
            }
            // Linha em branco antes deste parágrafo é um sinal FRACO de espaçamento (ao contrário
            // de SpaceBefore/SpaceAfter, que é um atributo real do IDML): muitos livros têm linhas
            // em branco no manuscrito que não correspondem a nenhum espaço visível no miolo
            // impresso (hábito de escrita, não intenção tipográfica). Por isso não aplica p-top
            // diretamente aqui — marca como CANDIDATO (data-blank-top) para confirmVerifyBlankSpacing
            // decidir depois, com o PDF de impressão como árbitro (gap real vs. entrelinha normal
            // da página); sem PDF, o candidato fica sem p-top (mais seguro que assumir).
            const blankCandidate = rc.detectSpacing && blankBefore && tag === 'p';
            blankBefore = false;
            // Separador de cena: uma LINHA (não o parágrafo todo — o InDesign junta-a a outras
            // linhas via <Br/> dentro do mesmo psr, ex. epígrafe + "*" + poema seguinte) cujo
            // texto é só "*", "* *" ou "* * *" (com ou sem espaços) → classe dedicada (centrado,
            // itálico), independente do resto do parágrafo/estilo mapeado.
            const isAsterisk = tag === 'p' && /^\*{1,3}$/.test(seg.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ''));
            const classes = isAsterisk ? ['p-asterisk'] : baseClasses;
            const attr = (classes.length ? ` class="${classes.join(' ')}"` : '')
                + (isAsterisk ? '' : styleAttr) + (blankCandidate ? ' data-blank-top="1"' : '');
            out.push(`<${tag}${attr}>${tag === 'p' ? stripRedundantEmphasis(seg.text, classes) : seg.text}</${tag}>`);
            // definições de nota logo a seguir ao parágrafo que as referencia (mesmo capítulo)
            for (const def of seg.notes) out.push(def);
        }
    }
    if (pendingLabel) {
        const attr = pendingLabelClass ? ` class="${pendingLabelClass}"` : '';
        out.push(`<${pendingLabelTag}${attr}>${pendingLabel}</${pendingLabelTag}>`);
    }
    return out.join('\n');
}

// Parágrafo com p-bold/p-italic/p-bold-italic: o estilo já dá o negrito/itálico, por isso o
// <strong>/<b>/<em>/<i> que o IDML emitiu (estilo de carácter/fonte) é redundante e sobrepunha-se
// ao estilo (ex. tirar o p-bold no editor deixava o texto a negrito).
export function stripRedundantEmphasis(html: string, classes: (string | undefined)[]): string {
    const has = (c: string) => classes.some(x => x?.split(/\s+/).includes(c));
    const bold = has('p-bold') || has('p-bold-italic');
    const italic = has('p-italic') || has('p-bold-italic');
    if (bold) html = html.replace(/<\/?(?:strong|b)\b[^>]*>/gi, '');
    if (italic) html = html.replace(/<\/?(?:em|i)\b[^>]*>/gi, '');
    return html;
}

// A Ficha Técnica (colofão) é uma story sem estilo nomeado (NormalParagraphStyle), por isso
