import React, { useState } from 'react';
import { Save } from 'lucide-react';
import type { Ebook } from '../../../api/ebooks-api';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface MetadataModalProps {
    ebook: Ebook;
    onClose: () => void;
    onSave: (data: Partial<Ebook>) => void;
}

const MetadataModalComponent: React.FC<MetadataModalProps> = ({ ebook, onClose, onSave }) => {
    useBodyScrollLock();
    const [formData, setFormData] = useState({
        title: ebook.title || '',
        author: ebook.author || '',
        description: ebook.description || '',
        publisher: ebook.publisher || '',
        language: ebook.language || 'pt',
        pub_date: ebook.pub_date || new Date().toISOString().split('T')[0],
        physical_isbn: ebook.physical_isbn || '',
        ebook_isbn: ebook.ebook_isbn || '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        Informações do Livro
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onSave(formData)}
                            title="Guardar Metadados"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
                        >
                            <Save size={20} />
                        </button>
                        <ModalCloseButton onClick={onClose} />
                    </div>
                </div>

                <div className="overflow-y-auto p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">ISBN Livro Físico</label>
                            <input name="physical_isbn" value={formData.physical_isbn} onChange={handleChange} placeholder="978-972-..." className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">E-ISBN</label>
                            <input name="ebook_isbn" value={formData.ebook_isbn} onChange={handleChange} placeholder="978-972-..." className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Título</label>
                            <input name="title" value={formData.title} onChange={handleChange} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Autor</label>
                            <input name="author" value={formData.author} onChange={handleChange} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Sinopse / Descrição</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all resize-none" />
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Editora</label>
                            <select name="publisher" value={formData.publisher} onChange={handleChange} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all bg-white">
                                <option value="">Selecionar editora…</option>
                                <option value="Almedina">Almedina</option>
                                <option value="Actual Editora">Actual Editora</option>
                                <option value="Edições 70">Edições 70</option>
                                <option value="Minotauro">Minotauro</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Data de Publicação</label>
                            <input type="date" name="pub_date" value={formData.pub_date} onChange={handleChange} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Idioma</label>
                            <select name="language" value={formData.language} onChange={handleChange} className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all bg-white">
                                <option value="pt">Português</option>
                                <option value="en">Inglês</option>
                                <option value="es">Espanhol</option>
                                <option value="fr">Francês</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const MetadataModal = React.memo(MetadataModalComponent);
