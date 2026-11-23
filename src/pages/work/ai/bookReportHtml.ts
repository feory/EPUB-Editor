// O relatório de falhas (texto de bookReport.ts) como página HTML: título, resumo, uma secção por tema, subtítulos e listas.
// Lê o formato do texto (títulos sublinhados com "=", itens "- ", continuações com 4 espaços), por isso o texto continua a ser a única fonte.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TAG = /^\[([^\]]+)\]\s*/; // "[erro · impacto]" ou "[Capítulo · PDF p. 3]" no início de um item
const SUBTITLE = /\(\d+\)$|: (?:\d+ problemas?|sem problemas)$|: não foi possível/;

const CSS = `body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#1e293b}
h1{font-size:1.5rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:2rem 0 .5rem;padding-bottom:.25rem;border-bottom:2px solid #e2e8f0}h3{font-size:1rem;margin:1rem 0 .25rem;color:#475569}
.meta{color:#64748b;margin:.1rem 0}ul{padding-left:1.2rem}li{margin:.5rem 0}.tag{display:inline-block;font-size:.75rem;font-weight:600;background:#e0f2fe;color:#075985;border-radius:4px;padding:0 .4rem;margin-right:.35rem}
.sub{display:block;color:#475569;font-size:.9rem;margin-left:.25rem}p{margin:.4rem 0}`;

export function reportToHtml(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let list = false, item = false;
    const closeItem = () => { if (item) out.push('</li>'); item = false; };
    const closeList = () => { closeItem(); if (list) out.push('</ul>'); list = false; };
    let title = 'Relatório';
    let head = true;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^=+$/.test(lines[i + 1] ?? '') && l.trim()) { closeList(); head = false; out.push(`<h2>${esc(l)}</h2>`); i++; continue; }
        if (!l.trim()) { closeList(); continue; }
        if (head) { if (i === 0) { title = l; out.push(`<h1>${esc(l)}</h1>`); } else out.push(`<p class="meta">${esc(l)}</p>`); continue; }
        if (l.startsWith('- ')) {
            closeItem();
            if (!list) { out.push('<ul>'); list = true; }
            const tag = TAG.exec(l.slice(2));
            out.push(`<li>${tag ? `<span class="tag">${esc(tag[1])}</span>` : ''}${esc(l.slice(2).replace(TAG, ''))}`);
            item = true;
        } else if (l.startsWith('    ') && item) out.push(`<span class="sub">${esc(l.trim())}</span>`);
        else { closeList(); out.push(SUBTITLE.test(l) ? `<h3>${esc(l)}</h3>` : `<p>${esc(l)}</p>`); }
    }
    closeList();
    return `<!doctype html><html lang="pt"><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style><body>${out.join('\n')}</body></html>`;
}
