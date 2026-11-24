import { readNotes } from '../notes/read-notes';

export interface FootnoteIssue {
  type: 'orphan-ref' | 'orphan-note' | 'sequence-gap' | 'broken-link';
  message: string;
  marker: string;
  id?: string;
  context?: string;
}

export interface ValidationReport {
  issues: FootnoteIssue[];
  totalRefs: number;
  totalNotes: number;
}

/**
 * Valida as notas do HTML (as que `readNotes` reconhece: de rodapé e do fim do capítulo): cada marcador tem de ter tantas referências no texto
 * como notas. Conta, em vez de só ver se o marcador existe: com a numeração a recomeçar em cada capítulo (1, 2, 3… em cada um) uma nota em
 * falta no capítulo 3 não fica escondida por haver uma com o mesmo número no capítulo 5.
 */
export function validateFootnotes(html: string): ValidationReport {
  const { defs, refs } = readNotes(html);
  const issues: FootnoteIssue[] = [];

  for (const note of defs.filter((d) => d.marker === '?')) {
    issues.push({ type: 'broken-link', marker: '?', message: `Nota inválida (sem número). Texto: "${note.text.slice(0, 30)}..."`, context: note.text.slice(0, 40) });
  }

  const markers = new Set([...refs.map((r) => r.marker), ...defs.map((d) => d.marker)].filter((m) => m !== '?'));
  for (const marker of markers) {
    const r = refs.filter((x) => x.marker === marker);
    const d = defs.filter((x) => x.marker === marker);
    for (const ref of r.slice(d.length)) issues.push({ type: 'orphan-ref', marker, message: `Referência [${marker}] sem nota correspondente.`, context: ref.context });
    for (const note of d.slice(r.length)) issues.push({ type: 'orphan-note', marker, message: `Nota [${marker}] não referenciada no texto.`, context: note.text.slice(0, 80) });
  }

  return { issues, totalRefs: refs.length, totalNotes: defs.length };
}
