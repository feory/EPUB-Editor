import { test, expect } from 'bun:test';
import { passwordFormError } from './passwordForm';

test('passwordFormError: valida por ordem; válido → null', () => {
    expect(passwordFormError('', 'x'.repeat(12))).toContain('atual');
    expect(passwordFormError('antiga', 'curta')).toContain('12');
    expect(passwordFormError('a'.repeat(12), 'a'.repeat(12))).toContain('diferente');
    expect(passwordFormError('antiga', 'b'.repeat(12))).toBeNull();
});
