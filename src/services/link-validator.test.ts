import { test, expect } from 'bun:test';
import { validateLinks } from './link-validator';

test('validateLinks: URL a terminar em "/" antes de quebra de parágrafo não é falso positivo', () => {
    // Nota de rodapé cujo URL acaba em "/" mesmo antes do </p><p> seguinte — achatar a
    // fronteira de bloco para 1 espaço só fazia o URL "engolir" a 1ª palavra do parágrafo a
    // seguir (scanUrl trata "/" como estrutural, logo espaço-a-seguir = quebra interna).
    const html = '<p class="footnote">Disponível em: https://exemplo.com/artigo/</p><p>Não deveria entrar aqui.</p>';
    const report = validateLinks(html);
    expect(report.issues).toEqual([]);
});

test('validateLinks: URL genuinamente partido por espaço (extração de PDF) continua detetado', () => {
    const html = '<p>Ver https://www.exemplo .com/pagina para mais.</p>';
    const report = validateLinks(html);
    expect(report.issues.length).toBe(1);
    expect(report.issues[0].type).toBe('broken-url');
});

test('validateLinks: href com espaços continua detetado', () => {
    const html = '<p><a href="https://exemplo.com/ pagina">link</a></p>';
    const report = validateLinks(html);
    expect(report.issues.some(i => i.type === 'spaced-href')).toBe(true);
});
