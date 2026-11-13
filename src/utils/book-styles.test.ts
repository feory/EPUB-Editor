import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { planStyles, planStyleEdits, applyStylePlan, type StyleEdit } from './book-styles';
import { readRuleBody } from './css-rule';

const CSS = `/* === ESTILOS DE PARÁGRAFO === */
    .p-quote { margin-left: 4.5em !important; font-size: 0.85em !important; }
/* === ESTILOS PERSONALIZADOS === */
    .p-destaque { color: #555; }
/* === EDITOR (não exportado para EPUB) === */
`;

test('editar estilo do editor: muda o valor, mantém !important e as outras propriedades', () => {
    const { planned, errors } = planStyleEdits([{ cls: 'p-quote', props: { 'font-size': '0.75em' } }], CSS);
    expect(errors).toEqual([]);
    expect(planned[0].before).toContain('font-size: 0.85em !important');
    expect(planned[0].after).toContain('font-size: 0.75em !important');
    expect(planned[0].after).toContain('margin-left: 4.5em !important');
});

test('valor "" remove a propriedade; edição que não muda nada fica de fora', () => {
    const rm = planStyleEdits([{ cls: 'p-destaque', props: { color: '' } }], CSS).planned[0];
    expect(rm.decls).toEqual([['color', null]]);
    expect(rm.after).toBe('');
    expect(planStyleEdits([{ cls: 'p-destaque', props: { color: '#555' } }], CSS).planned).toEqual([]);
});

test('editar um estilo do editor sem regra no livro cria a regra', () => {
    const out = applyStylePlan(CSS, [], planStyleEdits([{ cls: 'p-small', props: { 'font-size': '0.8em' } }], CSS).planned).css;
    expect(readRuleBody(out, '.p-small')).toBe('font-size: 0.8em;');
});

test('erros: classe inexistente/estrutural, propriedade fora da lista, valor perigoso, sem propriedades', () => {
    const bad: StyleEdit[] = [
        { cls: 'nao-existe', props: { color: 'red' } },
        { cls: 'footnote', props: { color: 'red' } },
        { cls: 'p-quote', props: { position: 'fixed' } },
        { cls: 'p-quote', props: { color: 'url(x)' } },
        { cls: 'p-quote', props: {} },
    ];
    expect(planStyleEdits(bad, CSS).errors).toHaveLength(5);
});

test('applyStylePlan: estilos novos e edições numa só passagem, antes do marcador do editor', () => {
    const styles = planStyles([{ name: 'Nota', props: { 'font-size': '0.9em' } }], CSS).planned;
    const edits = planStyleEdits([{ cls: 'p-quote', props: { 'font-size': '0.7em' } }], CSS).planned;
    const out = applyStylePlan(CSS, styles, edits).css;
    expect(readRuleBody(out, '.nota')).toBe('font-size: 0.9em;');
    expect(readRuleBody(out, '.p-quote')).toContain('font-size: 0.7em !important');
    expect(out.indexOf('.nota')).toBeLessThan(out.indexOf('EDITOR (não exportado'));
});

test('títulos h1–h3: edita a regra do título (sem ponto); sem regra cria-a; h4 não é permitido', () => {
    const css = `${CSS}\n    h2 { font-size: 1.5em; margin-top: 2em; }\n`;
    const { planned, errors } = planStyleEdits([
        { cls: 'h2', props: { 'font-size': '1.3em' } },
        { cls: 'h1', props: { 'text-align': 'center' } },
    ], css);
    expect(errors).toEqual([]);
    expect(planned.map((p) => p.selector)).toEqual(['h2', 'h1']);
    expect(planned[0].after).toBe('font-size: 1.3em; margin-top: 2em;');
    const out = applyStylePlan(css, [], planned).css;
    expect(readRuleBody(out, 'h1')).toBe('text-align: center;');
    expect(readRuleBody(out, 'h2')).toContain('font-size: 1.3em');
    expect(planStyleEdits([{ cls: 'h4', props: { color: 'red' } }], css).errors).toHaveLength(1);
});

test('applyStylePlan: revalida contra o CSS atual — estilo criado ou apagado entretanto → erros e CSS inalterado', () => {
    const styles = planStyles([{ name: 'Nota', props: { 'font-size': '0.9em' } }], CSS).planned;
    const created = applyStylePlan(`${CSS}\n    .nota { color: red; }\n`, styles, []);
    expect(created.errors[0]).toContain('Já existe');
    const edits = planStyleEdits([{ cls: 'p-destaque', props: { color: 'blue' } }], CSS).planned;
    const gone = applyStylePlan(CSS.replace('.p-destaque { color: #555; }', ''), [], edits);
    expect(gone.errors).toEqual(['o estilo "p-destaque" já não existe']);
    expect(gone.css).toBe(CSS.replace('.p-destaque { color: #555; }', ''));
});
