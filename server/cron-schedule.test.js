import { test, expect } from 'bun:test';
import { parseCron, nextRun } from './cron-schedule.js';

test('parseCron: rejeita expressão sem 5 campos', () => {
  expect(() => parseCron('* * *')).toThrow();
});

test('parseCron: rejeita valor fora de gama', () => {
  expect(() => parseCron('99 * * * *')).toThrow();
});

// Comparação por getters LOCAIS (getHours/getDate/...), nunca toISOString (UTC) — new Date(from)
// aqui é sempre local, e o offset local varia por TZ/época do ano (ex. Lisboa WEST/WET).
test('nextRun: "* * * * *" devolve o minuto seguinte, nunca o de partida', () => {
  const from = new Date(2026, 0, 1, 10, 0, 30);
  const next = nextRun('* * * * *', from);
  expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([1, 10, 1]);
});

test('nextRun: "0 3 * * *" acerta o próximo 03:00, hoje se ainda não passou, amanhã se já passou', () => {
  const before = nextRun('0 3 * * *', new Date(2026, 0, 1, 1, 0, 0));
  expect([before.getDate(), before.getHours(), before.getMinutes()]).toEqual([1, 3, 0]);

  const after = nextRun('0 3 * * *', new Date(2026, 0, 1, 5, 0, 0));
  expect([after.getDate(), after.getHours(), after.getMinutes()]).toEqual([2, 3, 0]);
});

test('nextRun: passo "*/15" só bate nos minutos 0/15/30/45', () => {
  const next = nextRun('*/15 * * * *', new Date('2026-01-01T10:05:00'));
  expect(next.getMinutes()).toBe(15);
});
