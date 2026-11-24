import { test, expect } from 'bun:test';
import { cleanIndexText } from './index-cleaner';

test('cleanIndexText: descarta números de página (regressão pós-refactor buildEntries)', () => {
    const raw = 'Segurança psicológica, 12, 45\nConfiança, 34–36';
    expect(cleanIndexText(raw)).toEqual(['Segurança psicológica', 'Confiança']);
});

test('cleanIndexText: crossref colado ao número (mesma linha) continua a separar corretamente', () => {
    const raw = 'Liderança, 100\nConfiança, 34ver também Liderança\nSegurança, 78';
    expect(cleanIndexText(raw)).toEqual(['Liderança', 'Confiança; ver também Liderança', 'Segurança']);
});
