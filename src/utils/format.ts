export function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeImageFilename(name: string): { filename: string; imageId: string } {
  let filename = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // remove truly invalid filesystem chars
    .replace(/\s+/g, '_')                    // spaces → underscores for URL safety
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  if (!filename) filename = 'image';
  if (!filename.match(/\.(png|jpg|jpeg|gif|webp)$/i)) filename += '.png';
  const imageId = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  return { filename, imageId };
}
