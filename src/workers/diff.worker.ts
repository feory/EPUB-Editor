export type WordPart = { type: 'equal' | 'insert' | 'delete'; text: string };

export interface DiffItem {
  type: 'equal' | 'insert' | 'delete' | 'modify';
  editorText?: string;
  refText?: string;
  editorIndex?: number;
  charDiff?: WordPart[];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function lcsDP(a: string[], b: string[]): number[][] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp;
}

function consolidateParts(parts: WordPart[]): WordPart[] {
  const result: WordPart[] = [];
  for (const part of parts) {
    const last = result[result.length - 1];
    if (last && last.type === part.type) {
      last.text += part.text;
    } else {
      result.push({ type: part.type, text: part.text });
    }
  }
  return result;
}

function charDiffAndSimilarity(editorText: string, refText: string): { charDiff: WordPart[]; sim: number } {
  const aOrig = [...editorText.trim()];
  const bOrig = [...refText.trim()];
  if (!aOrig.length || !bOrig.length) return { charDiff: [], sim: 0 };

  const aNorm = aOrig.map(c => c.toLowerCase());
  const bNorm = bOrig.map(c => c.toLowerCase());
  const dp = lcsDP(aNorm, bNorm);
  const lcsLen = dp[aNorm.length][bNorm.length];
  const sim = (2 * lcsLen) / (aNorm.length + bNorm.length);

  const raw: WordPart[] = [];
  let i = aOrig.length, j = bOrig.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aNorm[i - 1] === bNorm[j - 1]) {
      raw.unshift({ type: 'equal', text: aOrig[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'delete', text: bOrig[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'insert', text: aOrig[i - 1] });
      i--;
    }
  }
  return { charDiff: consolidateParts(raw), sim };
}

function diffParagraphs(editorParas: string[], refParas: string[]): DiffItem[] {
  const a = editorParas.map(normalize);
  const b = refParas.map(normalize);
  const m = a.length, n = b.length;

  const dp = lcsDP(a, b);

  const raw: DiffItem[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.unshift({ type: 'equal', editorText: editorParas[i - 1], refText: refParas[j - 1], editorIndex: i - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'delete', refText: refParas[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'insert', editorText: editorParas[i - 1], editorIndex: i - 1 });
      i--;
    }
  }

  // Merge adjacent delete+insert (or insert+delete) pairs that are similar into 'modify'
  const result: DiffItem[] = [];
  let k = 0;
  while (k < raw.length) {
    const cur = raw[k];
    const next = raw[k + 1];

    if (next) {
      const isDeleteInsert = cur.type === 'delete' && next.type === 'insert';
      const isInsertDelete = cur.type === 'insert' && next.type === 'delete';

      if (isDeleteInsert || isInsertDelete) {
        const refItem  = isDeleteInsert ? cur  : next;
        const editorItem = isDeleteInsert ? next : cur;
        const { charDiff, sim } = charDiffAndSimilarity(
          editorItem.editorText ?? '',
          refItem.refText ?? ''
        );

        if (sim >= 0.4) {
          // Guard: detect paragraph split — two editor paragraphs that together
          // form the reference paragraph should not be collapsed into a modify.
          if (isInsertDelete) {
            const prevResult = result[result.length - 1];
            if (prevResult?.type === 'insert' && prevResult.editorText) {
              const combined = prevResult.editorText + ' ' + (editorItem.editorText ?? '');
              const { sim: combinedSim } = charDiffAndSimilarity(combined, refItem.refText ?? '');
              if (combinedSim > sim * 1.05) {
                result.push(cur);
                k++;
                continue;
              }
            }
          }

          result.push({
            type: 'modify',
            editorText: editorItem.editorText,
            refText: refItem.refText,
            editorIndex: editorItem.editorIndex,
            charDiff,
          });
          k += 2;
          continue;
        }
      }
    }

    result.push(cur);
    k++;
  }

  return result;
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;
  try {
    if (type === 'diff') {
      const result = diffParagraphs(payload.editorParagraphs, payload.refParagraphs);
      self.postMessage({ id, result, error: null });
    } else {
      throw new Error(`Unknown type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ id, result: null, error: error instanceof Error ? error.message : 'Erro desconhecido' });
  }
};
