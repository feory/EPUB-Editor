import type { WordPart } from '../../../workers/diff.worker';

// Render char-level de um parágrafo modificado: delete rose riscado, insert verde, equal plano.
// Partilhado por DiffSidebar (comparação com ficheiro) e VersionDiffModal (diff entre saves).
export function CharDiff({ parts }: { parts: WordPart[] }) {
    return (
        <p className="text-[12px] leading-relaxed text-slate-700 break-words">
            {parts.map((part, i) => {
                if (part.type === 'delete') {
                    return <span key={i} className="bg-rose-100 text-rose-700 line-through rounded px-0.5">{part.text}</span>;
                }
                if (part.type === 'insert') {
                    return <span key={i} className="bg-emerald-100 text-emerald-800 font-medium rounded px-0.5">{part.text}</span>;
                }
                return <span key={i}>{part.text}</span>;
            })}
        </p>
    );
}
