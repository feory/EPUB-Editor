import React, { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../components/ModalCloseButton';

interface FormData {
    ebook_isbn: string;
    physical_isbn: string;
    title: string;
    author: string;
    description: string;
    publisher: string;
    language: string;
    pub_date: string;
}

interface CreateEbookModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: FormData) => void;
    isSubmitting: boolean;
}

export const CreateEbookModal: React.FC<CreateEbookModalProps> = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
    const [formData, setFormData] = useState<FormData>({
        ebook_isbn: '',
        physical_isbn: '',
        title: '',
        author: '',
        description: '',
        publisher: '',
        language: 'pt',
        pub_date: new Date().toISOString().split('T')[0],
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSave = () => { onSubmit(formData); };

    useBodyScrollLock(isOpen);
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700">Novo Ebook</h2>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSubmitting}
                            title="Criar Ebook"
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all disabled:opacity-70"
                        >
                            {isSubmitting ? <span className="inline-flex items-center justify-center w-5 h-5"><Loader2 className="animate-spin" size={18} /></span> : <Save size={20} />}
                        </button>
                        <ModalCloseButton onClick={onClose} />
                    </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="overflow-y-auto p-8 space-y-6 flex-1">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">ISBN Livro Físico</label>
                            <input name="physical_isbn" value={formData.physical_isbn} onChange={handleChange} placeholder="978-972-..."
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">E-ISBN *</label>
                            <input name="ebook_isbn" required value={formData.ebook_isbn} onChange={handleChange} placeholder="978-..."
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Título *</label>
                            <input name="title" required value={formData.title} onChange={handleChange} placeholder="Ex: Dom Quixote"
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Autor *</label>
                            <input name="author" required value={formData.author} onChange={handleChange} placeholder="Ex: Miguel de Cervantes"
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Sinopse / Descrição</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
                            className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all resize-none" />
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Editora</label>
                            <select name="publisher" value={formData.publisher} onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all bg-white text-text-main">
                                <option value="">Selecionar editora…</option>
                                <option value="Almedina">Almedina</option>
                                <option value="Actual Editora">Actual Editora</option>
                                <option value="Edições 70">Edições 70</option>
                                <option value="Minotauro">Minotauro</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Data de Publicação</label>
                            <input type="date" name="pub_date" value={formData.pub_date} onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all text-text-main" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">Idioma</label>
                            <select name="language" value={formData.language} onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-border focus:border-primary outline-none transition-all bg-white text-text-main">
                                <option value="pt">Português</option>
                                <option value="en">Inglês</option>
                                <option value="es">Espanhol</option>
                                <option value="fr">Francês</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
