import { expect, test } from 'bun:test';
import { cloneStyle, deleteQuestion } from './userStyleActions';
import { boxStyles, charStyles, paragraphStyles } from '../../../utils/user-styles';

const css = `/* === ESTILOS PERSONALIZADOS === */
    .b-azul { background-color: #00f; }
    .b-azul-copia { color: red; }
    .c-forte { font-weight: bold; }
    .capitular { font-size: 3em !important; }
/* === EDITOR (não exportado para EPUB) === */
`;

test('deleteQuestion: nomeia o estilo e onde vai ser retirado, por tipo', () => {
    expect(deleteQuestion(boxStyles, 'b-azul')).toBe('Apagar o estilo "azul" e retirá-lo das caixas onde foi aplicado?');
    expect(deleteQuestion(charStyles, 'c-forte')).toBe('Apagar o estilo "forte" e retirá-lo do texto onde foi aplicado?');
    expect(deleteQuestion(paragraphStyles, 'capitular')).toBe('Apagar o estilo "capitular" e retirá-lo dos parágrafos onde foi aplicado?');
});

test('cloneStyle: cria com nome livre e as declarações do original; devolve o erro do create', () => {
    const calls: Array<[string, string]> = [];
    const create = (cls: string, body: string) => { calls.push([cls, body]); return null; };
    expect(cloneStyle(boxStyles, css, 'b-azul', create)).toBeNull();
    expect(calls[0][0]).toBe('b-azul-copia-2'); // -copia já existe
    expect(calls[0][1]).toContain('background-color: #00f');
    expect(cloneStyle(paragraphStyles, css, 'capitular', () => 'erro')).toBe('erro');
});
