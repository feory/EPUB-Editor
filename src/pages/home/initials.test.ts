import { test, expect } from 'bun:test';
import { initialsOf } from './initials';

test('initialsOf: nome e apelido; sem nome cai para o email', () => {
    expect(initialsOf({ name: 'Ana Maria Silva', email: 'a@x.pt' })).toBe('AS');
    expect(initialsOf({ name: 'Ana', email: 'ana@x.pt' })).toBe('AN');
    expect(initialsOf({ name: 'ana.silva@x.pt', email: 'ana.silva@x.pt' })).toBe('AS');
    expect(initialsOf({ name: 'rui@x.pt', email: 'rui@x.pt' })).toBe('RU');
});
