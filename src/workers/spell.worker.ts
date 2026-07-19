let wordSet: Set<string> | null = null;

async function initChecker() {
  if (wordSet) return;
  const resp = await fetch('/dict/pt.dic');
  const text = await resp.text();
  const lines = text.split('\n');
  wordSet = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const word = lines[i].split('/')[0].trim();
    if (word) wordSet.add(word.toLowerCase());
  }
}

const WORD_RE = /[a-zA-ZÀ-ÿ]+(?:[-'][a-zA-ZÀ-ÿ]+)*/g;
const ACRONYM_RE = /^[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]{2,}$/;

function checkBlocks(blocks: string[]) {
  const issues: any[] = [];

  blocks.forEach((text, paragraphIndex) => {
    if (!text.trim()) return;
    WORD_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = WORD_RE.exec(text)) !== null) {
      const word = match[0];
      if (word.length < 3) continue;
      if (/^\d+$/.test(word)) continue;
      if (ACRONYM_RE.test(word)) continue;

      const lower = word.toLowerCase();
      if (!wordSet!.has(lower)) {
        issues.push({
          word,
          context: { text, offset: match.index, length: word.length },
          paragraphIndex,
          shortMessage: 'Erro ortográfico',
          message: `"${word}" não foi encontrado no dicionário.`,
          rule: { issueType: 'misspelling' },
          replacements: [],
        });
      }
    }
  });

  return issues;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;
  try {
    if (type === 'check') {
      await initChecker();
      const result = checkBlocks(payload.blocks);
      self.postMessage({ id, result, error: null });
    } else {
      throw new Error(`Unknown type: ${type}`);
    }
  } catch (error) {
    console.error('[spell.worker]', error);
    self.postMessage({ id, result: null, error: error instanceof Error ? error.message : String(error) });
  }
};
