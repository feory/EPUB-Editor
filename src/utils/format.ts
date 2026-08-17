export function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Tem de gerar o MESMO nome que sanitizeName (server/routes/images.js) — o import IDML prevê
// o imageId com esta função para casar imagem↔figura na colocação; políticas diferentes fazem
// a previsão nunca bater com o ficheiro realmente guardado (ver server para o porquê do NFC).
export function sanitizeImageFilename(name: string): { filename: string; imageId: string } {
  let filename = name
    .normalize('NFC') // pastas/ficheiros extraídos no macOS vêm em NFD ("ç" = "c"+cedilha combinável)
    .replace(/[^a-zA-Z0-9._-]/g, '_') // ASCII-only, como o servidor
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  if (!filename) filename = 'image';
  if (!filename.match(/\.(png|jpg|jpeg|gif|webp)$/i)) filename += '.png';
  const imageId = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  return { filename, imageId };
}
