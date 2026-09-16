// Leitura/escrita amigável da regra .box (StyleContext.tsx) — só as 3 propriedades expostas
// no painel simples do Editor CSS (cor de fundo, cor e espessura do contorno). Regex pontual
// para o formato exato usado no CSS deste projeto (`border: Npx solid #hex;`), não um parser
// CSS genérico — livros com CSS divergente desse formato mostram valores por omissão no painel,
// mas continuam editáveis no editor de texto ao lado.

export interface BoxStyle {
    backgroundColor: string; // hex, ou '' se não definida
    borderColor: string;     // hex, ou '' se sem contorno
    borderWidth: number;     // px, 0 = sem contorno
}

const BOX_BLOCK_RE = /\.box\s*\{([^}]*)\}/;

export function parseBoxStyle(css: string): BoxStyle {
    const body = BOX_BLOCK_RE.exec(css)?.[1] ?? '';
    const bg = /background-color:\s*([^;]+);/.exec(body);
    const border = /border:\s*([\d.]+)px\s+solid\s+([^;]+);/.exec(body);
    return {
        backgroundColor: bg ? bg[1].trim() : '',
        borderColor: border ? border[2].trim() : '',
        borderWidth: border ? parseFloat(border[1]) : 0,
    };
}

function setDeclaration(body: string, prop: string, value: string | null): string {
    const re = new RegExp(`${prop}:\\s*[^;]+;`);
    if (value === null) return re.test(body) ? body.replace(re, '').trim() : body;
    const decl = `${prop}: ${value};`;
    return re.test(body) ? body.replace(re, decl) : `${body.trim()} ${decl}`.trim();
}

export function applyBoxStyle(css: string, patch: Partial<BoxStyle>): string {
    const next = { ...parseBoxStyle(css), ...patch };

    const rewriteBody = (body: string) => {
        let out = setDeclaration(body, 'background-color', next.backgroundColor || null);
        const borderValue = next.borderWidth > 0 ? `${next.borderWidth}px solid ${next.borderColor || '#000000'}` : null;
        out = setDeclaration(out, 'border', borderValue);
        return out;
    };

    if (BOX_BLOCK_RE.test(css)) {
        return css.replace(BOX_BLOCK_RE, (_m, body: string) => `.box { ${rewriteBody(body)} }`);
    }
    // Regra .box em falta (livro anterior à funcionalidade) — cria uma nova com os valores
    // por omissão de DEFAULT_CSS para o resto (padding/margin).
    const newBody = rewriteBody('padding: 0.8em 1em; margin: 1em 0;');
    const marker = '/* === CAIXAS === */';
    return css.includes(marker)
        ? css.replace(marker, `${marker}\n    .box { ${newBody} }`)
        : `${css.trimEnd()}\n\n    .box { ${newBody} }\n`;
}
