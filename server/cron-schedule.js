// Avaliador mínimo de cron de 5 campos (minuto hora dia mês dia-semana) — suporta `*`, número,
// lista "1,2,3", passo "*/N" e intervalo "1-5" (e combinações "1-5/2"). Sem dependência: é a
// única peça que falta pra ligar o campo de agendamento do Painel ao cron real (server/backup.js)
// — não justifica trazer node-cron/croner só por isto.
const FIELD_RANGES = { minute: [0, 59], hour: [0, 23], day: [1, 31], month: [1, 12], weekday: [0, 6] };

function parseField(field, [min, max]) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`passo inválido: "${part}"`);
    let lo = min, hi = max;
    if (range !== '*') {
      if (range.includes('-')) {
        [lo, hi] = range.split('-').map(Number);
      } else {
        lo = hi = Number(range);
      }
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo > hi || lo < min || hi > max) {
        throw new Error(`valor fora de gama (${min}-${max}): "${part}"`);
      }
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('cron tem de ter 5 campos: minuto hora dia mês dia-semana');
  const [minute, hour, day, month, weekday] = fields;
  return {
    minute: parseField(minute, FIELD_RANGES.minute),
    hour: parseField(hour, FIELD_RANGES.hour),
    day: parseField(day, FIELD_RANGES.day),
    month: parseField(month, FIELD_RANGES.month),
    weekday: parseField(weekday, FIELD_RANGES.weekday),
  };
}

export function matchesCron(parsed, date) {
  return parsed.minute.has(date.getMinutes())
    && parsed.hour.has(date.getHours())
    && parsed.day.has(date.getDate())
    && parsed.month.has(date.getMonth() + 1)
    && parsed.weekday.has(date.getDay());
}

// Próxima ocorrência a partir de `from` (exclusive — nunca devolve o próprio minuto de
// partida), varrendo minuto a minuto até 1 ano à frente. Simples e rápido que chegue: pior
// caso ~525600 iterações, cada uma só 5 lookups num Set — microssegundos no total.
export function nextRun(expr, from = new Date()) {
  const parsed = parseCron(expr);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = new Date(from);
  limit.setFullYear(limit.getFullYear() + 1);
  while (d <= limit) {
    if (matchesCron(parsed, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  throw new Error('sem próxima ocorrência dentro de 1 ano — cron expression inválida?');
}
