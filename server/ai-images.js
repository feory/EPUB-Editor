// A imagem de um livro pronta para o modelo de visão: lida do disco e reduzida (as do livro vão até 2 MB; para descrever
// basta 1024 px no lado maior, e menos pixels = menos tokens = menos custo). Sem `sharp`, vai o original.
import { join } from 'path';
import { DATA_DIR } from './config.js';
import { findImagePath } from './routes/images.js';

const MAX_SIDE = 1024;
const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** { data: base64, mediaType } ou null se a imagem não existe. */
export async function loadImageForModel(isbn, id) {
  const path = await findImagePath(join(DATA_DIR, isbn, 'images'), id);
  if (!path) return null;
  const bytes = await Bun.file(path).arrayBuffer();
  try {
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp(bytes).resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
    return { data: jpeg.toString('base64'), mediaType: 'image/jpeg' };
  } catch {
    const mediaType = MEDIA_TYPES[path.split('.').pop().toLowerCase()];
    return mediaType ? { data: Buffer.from(bytes).toString('base64'), mediaType } : null;
  }
}
