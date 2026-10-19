import { test, expect } from 'bun:test';
import { initialsOf, labelOf } from './person';

test('initialsOf: nome e apelido; sem nome cai para o email', () => {
    expect(initialsOf({ name: 'Ana Maria Silva', email: 'a@x.pt' })).toBe('AS');
    expect(initialsOf({ name: 'Ana', email: 'ana@x.pt' })).toBe('AN');
    expect(initialsOf({ name: 'ana.silva@x.pt', email: 'ana.silva@x.pt' })).toBe('AS');
    expect(initialsOf({ name: 'rui@x.pt', email: 'rui@x.pt' })).toBe('RU');
});

test('labelOf: nome, senão email, senão o fallback', () => {
    expect(labelOf('Ana Silva', 'ana@x.pt', '—')).toBe('Ana Silva');
    expect(labelOf(null, 'ana@x.pt', '—')).toBe('ana@x.pt');
    expect(labelOf(undefined, null, 'Alguém')).toBe('Alguém');
    expect(labelOf('', '', 'Alguém')).toBe('Alguém');
});
