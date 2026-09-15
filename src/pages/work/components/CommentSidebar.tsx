import React, { useState } from 'react';
import { X, Check, Trash2, CornerDownRight } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { PanelResizeHandle } from './PanelResizeHandle';
import type { CommentThreadView } from '../hooks/useCommentEditorSync';
import type { Comment } from '../../../api/ebooks-api';

const ListFooter = () => <div className="h-5" />;

function formatTimestamp(ts: string) {
    try {
        const [datePart, timePart] = ts.split(' ');
        if (!timePart) return ts;
        return new Date(`${datePart}T${timePart}Z`).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
}

interface CommentSidebarProps {
    threads: CommentThreadView[];
    unresolvedCount: number;
    draftAnchorId: string | null;
    onCancelDraft: () => void;
    onSubmitDraft: (text: string) => void;
    onReply: (anchorId: string, rootId: number, text: string) => void;
    onResolve: (id: number, resolved: boolean) => void;
    onDelete: (id: number) => void;
    onGoTo: (anchorId: string) => void;
    currentUserId: number;
    currentUserRole: 'admin' | 'user';
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

function CommentMessage({ comment, currentUserId, currentUserRole, onDelete }: {
    comment: Comment; currentUserId: number; currentUserRole: 'admin' | 'user'; onDelete: (id: number) => void;
}) {
    const canDelete = currentUserRole === 'admin' || comment.user_id === currentUserId;
    return (
        <div className="group flex items-start justify-between gap-2">
            <div>
                <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-slate-700">{comment.user_email}</span>
                    <span className="text-[10px] text-slate-400">{formatTimestamp(comment.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{comment.text}</p>
            </div>
            {canDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(comment.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-500 transition-all shrink-0"
                    title="Apagar"
                >
                    <Trash2 size={13} />
                </button>
            )}
        </div>
    );
}

const CommentSidebarComponent: React.FC<CommentSidebarProps> = ({
    threads, unresolvedCount, draftAnchorId, onCancelDraft, onSubmitDraft, onReply, onResolve, onDelete, onGoTo,
    currentUserId, currentUserRole, onClose, width, onResize,
}) => {
    const [draftText, setDraftText] = useState('');
    const [replyingId, setReplyingId] = useState<number | null>(null);
    const [replyText, setReplyText] = useState('');

    return (
        <aside style={{ width }} className="fixed right-0 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-0 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-border flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="p-5 border-b border-border flex items-center justify-between bg-white">
                <div>
                    <h3 className="font-black text-slate-900 leading-tight">Comentários</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {unresolvedCount} por resolver
                    </p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all">
                    <X size={20} />
                </button>
            </div>

            {draftAnchorId && (
                <div className="p-4 border-b border-border bg-amber-50/60">
                    <textarea
                        autoFocus
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        placeholder="Escreve o comentário…"
                        className="w-full text-sm p-2 rounded-lg border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                        rows={3}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={() => { setDraftText(''); onCancelDraft(); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button
                            onClick={() => { if (draftText.trim()) { onSubmitDraft(draftText.trim()); setDraftText(''); } }}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg"
                        >
                            Comentar
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 bg-slate-50/50 overflow-hidden">
                {threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 px-10 text-center">
                        <h4 className="font-bold text-slate-900">Sem comentários</h4>
                        <p className="text-sm leading-relaxed">Seleciona texto no editor e usa o botão de comentário na barra de seleção.</p>
                    </div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={threads}
                        components={{ Footer: ListFooter }}
                        itemContent={(_i, thread) => {
                            const { orphan } = thread;
                            return (
                                <div className="px-5 pt-5">
                                    <div
                                        className={`rounded-2xl border shadow-sm overflow-hidden transition-opacity ${thread.root.resolved ? 'opacity-50 border-slate-200' : 'border-slate-200'}`}
                                    >
                                        <div
                                            className="group p-4 cursor-pointer hover:bg-slate-50"
                                            onClick={() => onGoTo(thread.anchorId)}
                                        >
                                            {orphan && (
                                                <span className="inline-block mb-2 px-2 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-600 uppercase tracking-wide">
                                                    Texto removido
                                                </span>
                                            )}
                                            <CommentMessage comment={thread.root} currentUserId={currentUserId} currentUserRole={currentUserRole} onDelete={onDelete} />
                                        </div>

                                        {thread.replies.length > 0 && (
                                            <div className="px-4 pb-2 space-y-3 border-t border-slate-100 pt-3">
                                                {thread.replies.map((reply) => (
                                                    <div key={reply.id} className="group pl-4 border-l-2 border-slate-100">
                                                        <CommentMessage comment={reply} currentUserId={currentUserId} currentUserRole={currentUserRole} onDelete={onDelete} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setReplyingId(replyingId === thread.root.id ? null : thread.root.id); setReplyText(''); }}
                                                className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
                                            >
                                                <CornerDownRight size={13} /> Responder
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onResolve(thread.root.id, !thread.root.resolved); }}
                                                className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${thread.root.resolved ? 'text-slate-500 hover:bg-slate-200' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
                                            >
                                                <Check size={13} /> {thread.root.resolved ? 'Reabrir' : 'Resolver'}
                                            </button>
                                        </div>

                                        {replyingId === thread.root.id && (
                                            <div className="p-3 border-t border-slate-100 bg-white" onClick={(e) => e.stopPropagation()}>
                                                <textarea
                                                    autoFocus
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    placeholder="Escreve uma resposta…"
                                                    className="w-full text-sm p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                                                    rows={2}
                                                />
                                                <div className="flex justify-end gap-2 mt-2">
                                                    <button onClick={() => setReplyingId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
                                                    <button
                                                        onClick={() => { if (replyText.trim()) { onReply(thread.anchorId, thread.root.id, replyText.trim()); setReplyingId(null); } }}
                                                        className="px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg"
                                                    >
                                                        Responder
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }}
                    />
                )}
            </div>
        </aside>
    );
};

export const CommentSidebar = React.memo(CommentSidebarComponent);
