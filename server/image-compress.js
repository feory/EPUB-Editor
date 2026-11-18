// Comprime uma imagem do livro SEM mudar nome nem extensão (o livro continua a apontar para o mesmo ficheiro):
// reduz a largura se passar de `maxWidth` (nunca amplia) e recodifica no mesmo formato. Devolve null se não valer a pena
// (GIF — pode ser animado —, ilegível, ou o resultado não é pelo menos MIN_GAIN mais pequeno).
const MIN_GAIN = 0.03;

export const DEFAULT_COMPRESS = { maxWidth: 1600, quality: 82 };

/** Valida as opções vindas do cliente/modelo; devolve { maxWidth, quality } ou { error }. */
export function compressOptions(input = {}) {
  const maxWidth = input.maxWidth ?? DEFAULT_COMPRESS.maxWidth;
  const quality = input.quality ?? DEFAULT_COMPRESS.quality;
  if (!Number.isInteger(maxWidth) || maxWidth < 400 || maxWidth > 6000) return { error: 'maxWidth tem de ser um inteiro entre 400 e 6000' };
  if (!Number.isInteger(quality) || quality < 40 || quality > 95) return { error: 'quality tem de ser um inteiro entre 40 e 95' };
  return { maxWidth, quality };
}

export async function compressImageBuffer(buffer, ext, { maxWidth, quality }) {
  const kind = ext.toLowerCase().replace('jpeg', 'jpg');
  if (!['png', 'jpg', 'webp'].includes(kind)) return null;
  const sharp = (await import('sharp')).default;
  try {
    let img = sharp(buffer).rotate().resize({ width: maxWidth, withoutEnlargement: true });
    if (kind === 'png') img = img.png({ compressionLevel: 9, effort: 10 });
    else if (kind === 'jpg') img = img.jpeg({ quality, mozjpeg: true });
    else img = img.webp({ quality });
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    if (data.length > buffer.length * (1 - MIN_GAIN)) return null;
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
