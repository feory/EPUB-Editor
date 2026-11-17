import { test, expect } from 'bun:test';
import { AxiosError, AxiosHeaders } from 'axios';
import { aiErrorMessage } from './aiError';

const failure = (status: number, error: string, headers: Record<string, string> = {}) =>
    new AxiosError('x', undefined, undefined, undefined, { status, data: { error }, headers: new AxiosHeaders(headers), statusText: '', config: { headers: new AxiosHeaders() } });

test('429 com Retry-After diz quanto esperar (segundos até 90, depois minutos)', () => {
    expect(aiErrorMessage(failure(429, 'Demasiados pedidos à IA. Tenta mais tarde.', { 'retry-after': '45' }))).toBe('Demasiados pedidos à IA. Tenta daqui a 45 s.');
    expect(aiErrorMessage(failure(429, 'Demasiados pedidos à IA. Tenta mais tarde.', { 'retry-after': '700' }))).toBe('Demasiados pedidos à IA. Tenta daqui a 12 min.');
});

test('sem Retry-After (ou outro erro) mantém a mensagem do servidor; sem resposta é erro de rede; não-axios é inesperado', () => {
    expect(aiErrorMessage(failure(429, 'IA ocupada, tenta daqui a pouco'))).toBe('IA ocupada, tenta daqui a pouco');
    expect(aiErrorMessage(failure(502, 'Erro da IA', { 'retry-after': '5' }))).toBe('Erro da IA');
    expect(aiErrorMessage(new AxiosError('rede'))).toBe('Erro de rede');
    expect(aiErrorMessage(new Error('x'))).toBe('Erro inesperado');
});
