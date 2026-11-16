import { test, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EDITOR_CLASSES, NO_DROP_CAP_CLASSES } from '../../../utils/editor-classes';
import { BLOCK_CLASS_STYLES } from './blockStyles';

// Classes do vocabulário que NÃO são estilos de bloco (estrutura, inline, imagem).
// ('alinea' só vem das importações: o editor entende-a mas não a oferece nos menus.)
const NOT_BLOCK_STYLES = ['alinea', 'chapter-break', 'pagebreak', 'footnote-ref', 'small-caps', 'underline', 'img-left', 'img-center', 'img-right'];

test('o vocabulário (editor-classes) e os estilos de bloco (blockStyles) têm as mesmas classes', () => {
    const blocks = BLOCK_CLASS_STYLES.map((s) => s.format).sort();
    const vocab = [...EDITOR_CLASSES].filter((c) => !NOT_BLOCK_STYLES.includes(c)).sort();
    expect(blocks).toEqual(vocab);
});

test('NO_DROP_CAP_CLASSES vem dos traços (o que a limpeza usava à mão)', () => {
    expect([...NO_DROP_CAP_CLASSES].sort()).toEqual(['alinea', 'footnote', 'p-center', 'p-quote']);
});

// Classes de parágrafo escritas à mão nos importadores/tradutores: têm de existir no vocabulário (p-bottom não existia).
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return sources(p);
        return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
    });
}
test('toda a classe p-* emitida pelos importadores existe no vocabulário do editor', () => {
    const emitted = new Set<string>();
    for (const f of sources(join(import.meta.dir, '../../../services/import')).concat(sources(join(import.meta.dir, '../../../services/indesign')))) {
        for (const m of readFileSync(f, 'utf8').matchAll(/['"`]((?:p-[a-z]+(?:-[a-z]+)*)(?: p-[a-z]+(?:-[a-z]+)*)*)['"`]/g)) m[1].split(' ').forEach((c) => emitted.add(c));
    }
    const unknown = [...emitted].filter((c) => !EDITOR_CLASSES.has(c));
    expect(unknown).toEqual([]);
});
