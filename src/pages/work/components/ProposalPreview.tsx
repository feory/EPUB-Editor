import React, { useState } from 'react';
import { forEditor } from '../../../utils/book-css';
import { charStyles } from '../../../utils/user-styles';
import { HEADING_SELECTORS } from '../../../utils/book-styles';
import type { Proposal } from '../ai/tools/aiTool';

const LOREM = 'Texto de exemplo para ver como fica.';

/** Um bloco de amostra para um estilo (a regra de um estilo não traz HTML): título, estilo de caracteres ou parágrafo. */
const sampleFor = (cls: string): string =>
    HEADING_SELECTORS.includes(cls) ? `<${cls}>${LOREM}</${cls}>`
        : charStyles.isStyle(cls) ? `<p>Antes <span class="${cls}">${LOREM}</span> depois.</p>`
            : `<p class="${cls}">${LOREM}</p>`;

/** O HTML numa moldura isolada com o CSS do livro; a altura segue o conteúdo. */
const Frame: React.FC<{ html: string; css: string }> = ({ html, css }) => {
    const [h, setH] = useState(60);
    return (
        <iframe title="Exemplo" sandbox="allow-same-origin" scrolling="no" style={{ height: h }} className="w-full rounded border border-border bg-white"
            srcDoc={`<!doctype html><meta charset="utf-8"><style>${css}</style><body style="margin:8px">${html}</body>`}
            onLoad={(e) => { const d = e.currentTarget.contentDocument; if (d) setH(Math.min(d.documentElement.scrollHeight, 320)); }} />
    );
};

const Pair: React.FC<{ label: string; before?: string; after: string; css: { before: string; after: string } }> = ({ label, before, after, css }) => (
    <div className="text-xs text-slate-600">
        <p className="font-semibold mb-1">{label}</p>
        <div className={before === undefined ? '' : 'grid grid-cols-2 gap-2'}>
            {before !== undefined && <div><p className="text-rose-600 mb-0.5">Antes</p><Frame html={before} css={css.before} /></div>}
            <div><p className="text-emerald-700 mb-0.5">Depois</p><Frame html={after} css={css.after} /></div>
        </div>
    </div>
);

/** Exemplo visual da proposta: estilos novos/alterados e amostras das regras, desenhados com o CSS do livro antes e depois. */
export const ProposalPreview = React.memo(function ProposalPreview({ proposal, css }: { proposal: Proposal; css: { before: string; after: string } }) {
    const c = { before: forEditor(css.before), after: forEditor(css.after) };
    const samples = proposal.reports.flatMap((r, i) => r.samples.slice(0, 1).map((s) => ({ ...s, rule: i + 1 })));
    if (!proposal.styles.length && !proposal.edits.length && !samples.length) return <p className="text-xs text-text-muted">Sem exemplo visual para esta proposta.</p>;
    return (
        <div className="flex flex-col gap-3">
            {proposal.styles.map((s) => <Pair key={s.cls} label={`Estilo novo .${s.cls}`} after={sampleFor(s.cls)} css={c} />)}
            {proposal.edits.map((e) => <Pair key={e.cls} label={`Estilo ${e.selector}`} before={sampleFor(e.cls)} after={sampleFor(e.cls)} css={c} />)}
            {samples.map((s, i) => <Pair key={i} label={`Regra ${s.rule}, cap. ${s.chapter}`} before={s.before} after={s.after || ''} css={c} />)}
        </div>
    );
});
