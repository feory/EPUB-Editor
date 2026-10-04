#!/usr/bin/env bun
// Optimiza EPUBs exportados do InDesign para os ESTILOS DO EDITOR: cada parágrafo passa a usar as classes
// do editor (p-indent, p-top, p-center, p-small, p-quote, p-bold…) com os valores do editor (CSS =
// DEFAULT_CSS do StyleContext), escolhidas a partir do CSS original (estilo + overrides); alinhamento à
// direita/esquerda como o editor o grava (style inline). Tira o lixo do InDesign e converte notas/quebras
// de página para o modelo da app.
//   bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>  → mapa sugerido (+ Decisões do livro)
//   bun .claude/skills/epub-indesign/optimize.ts convert <livro.epub>  → <dir>/optimizados/<livro>.epub
//   bun .claude/skills/epub-indesign/optimize.ts verify  <livro.epub>  → texto/estrutura/intenção original × optimizado
// Decisões do livro = data/indesign-maps/<isbn>.json — o MESMO ficheiro que a Importação InDesign da app lê e
// grava (editar à mão: { "classes": { "p.X": { "target": "h3" } } }). Ver SKILL.md.
//
// Este ficheiro é só a CLI (adapter): lê/escreve ficheiros e imprime. A lógica é a da app
// (src/services/indesign/), a mesma da "Importação InDesign" da página inicial.
import '../../../src/services/indesign/happy-dom'; // DOMParser/XMLSerializer no bun (o browser já os tem)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DEFAULT_CSS } from '../../../src/context/StyleContext';
import { analyzeBook, convertBook, verifyBook } from './commands';
import { editorExportCss } from './editor';

const DECISIONS_DIR = join(import.meta.dir, '../../../data/indesign-maps');
const decisionsPath = (isbn: string) => join(DECISIONS_DIR, `${isbn}.json`);
const optimizedPathFor = (epub: string) => join(dirname(epub), 'optimizados', basename(epub));

// mapa = sugestão (casa + heurística) com as Decisões do livro por cima
function analyzeFile(epubPath: string) {
    const basePath = join(import.meta.dir, 'estilos-base.json');
    return analyzeBook(readFileSync(epubPath), {
        baseStyles: existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {},
        fileName: basename(epubPath),
        loadDecisions: async isbn => existsSync(decisionsPath(isbn)) ? JSON.parse(readFileSync(decisionsPath(isbn), 'utf8')) : null,
    });
}

async function analyze(epubPath: string) {
    const { map, isbn, bodySize, alreadyOptimized } = await analyzeFile(epubPath);
    console.log(`Decisões do livro: ${decisionsPath(isbn)}${existsSync(decisionsPath(isbn)) ? '' : ' (ainda não há)'}  (texto base ${bodySize}em)\n`);
    if (alreadyOptimized) console.log('  ℹ EPUB já optimizado (formato da app) — o convert copia-o sem alterações.\n');
    for (const [k, e] of Object.entries(map.classes)) {
        console.log(`${String(e.count).padStart(6)}  ${k.padEnd(36)} → ${(e.target || '∅').padEnd(14)} [${e.origem}] ${e.css}`);
    }
}

async function convert(epubPath: string) {
    const { map } = await analyzeFile(epubPath);
    const { bytes, report } = await convertBook(readFileSync(epubPath), map, editorExportCss(DEFAULT_CSS));
    const outPath = optimizedPathFor(epubPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);

    console.log(`✓ ${outPath}`);
    if (report.alreadyOptimized) { console.log('  ℹ EPUB já optimizado (formato da app) — copiado sem alterações'); return; }
    console.log(`  ${report.documents} documentos, ${report.notes} notas convertidas, corpo do texto ${report.bodySize}em`);
    if (report.missing.length) console.log(`  ⚠ classes fora do mapa (correr analyze): ${report.missing.join(', ')}`);
    console.log('\n  Estilo original → estilo do editor');
    for (const { original, count, editor } of report.styles) {
        console.log(`  ${String(count).padStart(6)}  ${original.padEnd(40)} → ${editor.map(([o, n]) => editor.length > 1 ? `${o} (${n})` : o).join(', ')}`);
    }
}

async function verify(epubPath: string) {
    const r = await verifyBook(readFileSync(epubPath), readFileSync(optimizedPathFor(epubPath)));
    const total = r.diffs.reduce((s, d) => s + d.count, 0);
    console.log(`\n${basename(epubPath)}: ${r.paired} parágrafos comparados, ${r.unpaired} sem par, ${total} diferenças de intenção${total || r.unpaired ? '' : ' ✓'}`);
    for (const d of r.diffs) {
        console.log(`  ${String(d.count).padStart(5)}  ${d.original.padEnd(34)} ${d.prop.padEnd(7)} ${d.want.padStart(7)} → ${d.got.padEnd(7)} (${d.optimized})  «${d.example}»`);
    }
    console.log(r.text.ok
        ? `  texto ✓ (${r.text.length} caracteres)`
        : `  ⚠ TEXTO DIFERENTE na posição ${r.text.at}: «${r.text.original}» → «${r.text.optimized}»`);
    const ok = ([a, b]: [number, number]) => `${a} → ${b}${a === b ? ' ✓' : ' ⚠'}`;
    console.log(`  imagens ${ok(r.images)} · quebras de página ${ok(r.pages)} · notas ${ok(r.notes)}`);
    console.log(r.foreignClasses.length ? `  ⚠ classes fora do editor: ${r.foreignClasses.join(', ')}` : '  classes: só do editor ✓');
}

const [cmd, file] = process.argv.slice(2);
if (!file || !['analyze', 'convert', 'verify'].includes(cmd)) {
    console.error('uso: bun optimize.ts analyze|convert|verify <livro.epub>');
    process.exit(1);
}
await ({ analyze, convert, verify }[cmd as 'analyze'])(file);
