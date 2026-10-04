#!/usr/bin/env bun
// Optimiza EPUBs exportados do InDesign para os ESTILOS DO EDITOR: cada parágrafo passa a usar as classes
// do editor (p-indent, p-top, p-center, p-small, p-quote, p-bold…) com os valores do editor (CSS =
// DEFAULT_CSS do StyleContext), escolhidas a partir do CSS original (estilo + overrides); alinhamento à
// direita/esquerda como o editor o grava (style inline). Tira o lixo do InDesign e converte notas/quebras
// de página para o modelo da app.
//   bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>  → mapa sugerido (regras da casa + heurística)
//   bun .claude/skills/epub-indesign/optimize.ts convert <livro.epub> [--juntar-br]  → <dir>/optimizados/<livro>.epub + verificação
//     --juntar-br: junta as quebras de linha do paginador — SÓ depois de o utilizador aceitar (ver analyze)
// Decisões por livro fazem-se no modal da Importação InDesign da app (não são guardadas); aqui só o mapa sugerido.
// Ver SKILL.md.
//
// Este ficheiro é só a CLI (adapter): lê/escreve ficheiros e imprime. A lógica é a da app
// (src/services/indesign/), a mesma da "Importação InDesign" da página inicial.
import '../../../src/services/indesign/happy-dom'; // DOMParser/XMLSerializer no bun (o browser já os tem)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DEFAULT_CSS } from '../../../src/context/StyleContext';
import { analyzeBook, optimizeBook } from './commands';
import { editorExportCss } from './editor';

const optimizedPathFor = (epub: string) => join(dirname(epub), 'optimizados', basename(epub));

// mapa = sugestão (regras da casa + heurística)
function analyzeFile(epubPath: string) {
    const basePath = join(import.meta.dir, 'estilos-base.json');
    return analyzeBook(readFileSync(epubPath), {
        baseStyles: existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {},
    });
}

async function analyze(epubPath: string) {
    const { map, bodySize, alreadyOptimized, lineBreaks } = await analyzeFile(epubPath);
    console.log(`Texto base ${bodySize}em\n`);
    if (alreadyOptimized) console.log('  ℹ EPUB já optimizado (formato da app) — o convert copia-o sem alterações.\n');
    for (const [k, e] of Object.entries(map.classes)) {
        console.log(`${String(e.count).padStart(6)}  ${k.padEnd(36)} → ${(e.target || '∅').padEnd(14)} [${e.origem}] ${e.css}`);
    }
    if (lineBreaks.length) {
        // perguntar ao utilizador (casos + 1 exemplo por tipo) antes de usar convert --juntar-br
        console.log(`\n  <br/> do paginador em parágrafos/notas: ${lineBreaks.reduce((n, l) => n + l.count, 0)} — PERGUNTAR antes de juntar`);
        for (const l of lineBreaks) console.log(`${String(l.count).padStart(6)}  ${l.label}\n          ${l.before}  →  ${l.after}`);
    }
}

async function convert(epubPath: string, joinLineBreaks: boolean) {
    const { map } = await analyzeFile(epubPath);
    const { bytes, report, verify: r, problems, warnings } = await optimizeBook(readFileSync(epubPath), map, editorExportCss(DEFAULT_CSS), { joinLineBreaks });
    const outPath = optimizedPathFor(epubPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);

    console.log(`✓ ${outPath}`);
    if (report.alreadyOptimized) { console.log('  ℹ EPUB já optimizado (formato da app) — copiado sem alterações'); return; }
    console.log(`  ${report.documents} documentos, ${report.notes} notas convertidas, corpo do texto ${report.bodySize}em`);
    if (report.missing.length) console.log(`  ⚠ classes fora do mapa: ${report.missing.join(', ')}`);
    console.log('\n  Estilo original → estilo do editor');
    for (const { original, count, editor } of report.styles) {
        console.log(`  ${String(count).padStart(6)}  ${original.padEnd(40)} → ${editor.map(([o, n]) => editor.length > 1 ? `${o} (${n})` : o).join(', ')}`);
    }

    // verificação (política em optimizeBook: problemas bloqueiam a importação na app, avisos não)
    console.log(`\n${basename(epubPath)}: ${r!.paired} parágrafos comparados, ${r!.unpaired} sem par`);
    for (const d of r!.diffs) {
        console.log(`  ${String(d.count).padStart(5)}  ${d.original.padEnd(34)} ${d.prop.padEnd(7)} ${d.want.padStart(7)} → ${d.got.padEnd(7)} (${d.optimized})  «${d.example}»`);
    }
    console.log(`  texto ${r!.text.length} caracteres · imagens ${r!.images[1]} · quebras de página ${r!.pages[1]} · notas ${r!.notes[1]}`);
    for (const p of problems) console.log(`  ✗ ${p.message}`);
    for (const w of warnings) console.log(`  ⚠ ${w.message}`);
    if (!problems.length && !warnings.length) console.log('  verificação ✓ (texto, imagens, quebras, notas, intenção, classes só do editor)');
}

const [cmd, file, ...flags] = process.argv.slice(2);
if (!file || !['analyze', 'convert'].includes(cmd)) {
    console.error('uso: bun optimize.ts analyze <livro.epub> | convert <livro.epub> [--juntar-br]');
    process.exit(1);
}
if (cmd === 'analyze') await analyze(file);
else await convert(file, flags.includes('--juntar-br'));
