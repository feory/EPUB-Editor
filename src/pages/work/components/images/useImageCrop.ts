import { useState, useCallback } from 'react';
import { ebooksApi } from '../../../../api/ebooks-api';
import { useNotification } from '../../../../context/NotificationContext';

// Corte de imagem: partilhado pela Galeria e pelo menu de contexto (botão direito) do editor —
// cada instância mantém o seu próprio estado (só uma imagem de cada vez, sem necessidade de
// partilhar entre as duas superfícies).
export function useImageCrop(isbn: string, onSaved?: (imageId: string) => void) {
    const { showNotification } = useNotification();
    const [cropImage, setCropImage] = useState<{ id: string; url: string } | null>(null);

    // Abre o modal já (mostra spinner), depois busca a imagem em RESOLUÇÃO TOTAL (não a
    // thumbnail 200×200 em cache) para o editor de corte trabalhar sobre pixels reais.
    // Guarda por id no callback: se entretanto cancelar/abrir outra, não pisa.
    const handleOpenCrop = useCallback((imageId: string) => {
        setCropImage({ id: imageId, url: '' });
        fetch(`/api/ebooks/${isbn}/images/${imageId}`)
            .then(res => { if (!res.ok) throw new Error('Failed to load image'); return res.blob(); })
            .then(blob => setCropImage(prev => (prev?.id === imageId ? { id: imageId, url: URL.createObjectURL(blob) } : prev)))
            .catch(error => {
                console.error('Failed to load image for crop:', error);
                showNotification('error', 'Erro ao carregar imagem para editar');
                setCropImage(prev => (prev?.id === imageId ? null : prev));
            });
    }, [isbn, showNotification]);

    const handleCropCancel = useCallback(() => {
        if (cropImage?.url) URL.revokeObjectURL(cropImage.url);
        setCropImage(null);
    }, [cropImage]);

    // Grava o resultado do corte SOBRE o mesmo imageId (mesmo mecanismo do "Substituir"),
    // preserva as referências data-image-id no HTML — só troca os bytes do ficheiro.
    const handleCropSave = useCallback(async (blob: Blob) => {
        if (!cropImage) return;
        const imageId = cropImage.id;
        try {
            const formData = new FormData();
            formData.append('image', blob, `${imageId}.jpg`);
            await ebooksApi.uploadImage(isbn, imageId, formData);
            URL.revokeObjectURL(cropImage.url);
            setCropImage(null);
            showNotification('success', 'Imagem editada com sucesso', 2000);
            onSaved?.(imageId);
        } catch (error) {
            console.error('Failed to save cropped image:', error);
            showNotification('error', 'Erro ao gravar imagem editada');
        }
    }, [isbn, cropImage, showNotification, onSaved]);

    return { cropImage, handleOpenCrop, handleCropSave, handleCropCancel };
}
