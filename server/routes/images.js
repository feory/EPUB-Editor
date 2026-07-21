import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { stat, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { corsHeaders, handleGetFile, safeSegment } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP'];
const MAX_IMAGE_SIZE = 2_000_000;
// EPS/PSD são ficheiros de ORIGEM (naturalmente maiores — vetorial com preview embutido, ou
// Photoshop com layers), convertidos para PNG e descartados de imediato; limite próprio, mais
// alto, só para o upload cru (o ficheiro final guardado continua sujeito ao MAX_IMAGE_SIZE).
const MAX_SOURCE_IMAGE_SIZE = 50_000_000;

// File may vanish between existence check and unlink (TOCTOU); ignore missing-file errors.
function safeUnlink(path) {
  try { unlinkSync(path); } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

// Rasteriza um EPS (Illustrator vetorial) para PNG a 300dpi com Ghostscript (cor, nítido).
// Fallback: o preview raster embutido no DOS-EPS (cinza, baixa-res) via sharp, se o gs faltar.
// ponytail: 300dpi fixo — subir -r se precisar de mais nitidez. Requer `ghostscript` no PATH.
async function epsToPng(buffer) {
  const base = join(tmpdir(), `eps-${crypto.randomUUID()}`);
  const epsPath = `${base}.eps`, pngPath = `${base}.png`;
  await Bun.write(epsPath, buffer);
  try {
    const proc = Bun.spawn(
      ['gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop', '-sDEVICE=png16m', '-r300', `-sOutputFile=${pngPath}`, epsPath],
      { stdout: 'ignore', stderr: 'ignore' });
    await proc.exited;
    if (proc.exitCode === 0 && existsSync(pngPath)) return await Bun.file(pngPath).arrayBuffer();
  } catch { /* gs ausente */ }
  finally { safeUnlink(epsPath); safeUnlink(pngPath); }
  // Fallback sem gs: preview TIFF embutido (DOS-EPS, magic C5D0D3C6; offset/len em 20/24, LE).
  const dv = new DataView(buffer);
  if (buffer.byteLength > 28 && dv.getUint32(0) === 0xC5D0D3C6) {
    const off = dv.getUint32(20, true), len = dv.getUint32(24, true);
    if (off && len) {
      const sharp = await import('sharp').catch(() => null);
      if (sharp) return await sharp.default(Buffer.from(buffer, off, len), { failOn: 'none' }).png().toBuffer();
    }
  }
  return null;
}

// Rasteriza um PSD (Photoshop) para PNG com ImageMagick (composite/frame [0], não as layers
// individuais). `magick` (IMv7, ex. Homebrew) ou `convert` (IMv6, ex. apt Debian) — nomes do
// binário diferem consoante a distribuição/versão instalada.
async function psdToPng(buffer) {
  const base = join(tmpdir(), `psd-${crypto.randomUUID()}`);
  const psdPath = `${base}.psd`, pngPath = `${base}.png`;
  await Bun.write(psdPath, buffer);
  try {
    for (const cmd of ['magick', 'convert']) {
      try {
        const proc = Bun.spawn([cmd, `${psdPath}[0]`, pngPath], { stdout: 'ignore', stderr: 'ignore' });
        await proc.exited;
        if (proc.exitCode === 0 && existsSync(pngPath)) return await Bun.file(pngPath).arrayBuffer();
      } catch { /* binário ausente — tenta o próximo */ }
    }
  } finally { safeUnlink(psdPath); safeUnlink(pngPath); }
  return null;
}

function sanitizeName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

// One readdir instead of up to 9 existsSync probes (non-blocking + fewer syscalls).
async function findImagePath(dir, imageId) {
  let entries;
  try { entries = await readdir(dir); } catch { return null; }
  // Prefer `${imageId}.${ext}` for a known extension, then a raw `imageId` file.
  const withExt = entries.find(f => {
    const dot = f.lastIndexOf('.');
    return dot > 0 && f.slice(0, dot) === imageId && IMAGE_EXTENSIONS.includes(f.slice(dot + 1));
  });
  if (withExt) return join(dir, withExt);
  return entries.includes(imageId) ? join(dir, imageId) : null;
}

export async function listImages(req, isbn) {
  const imagesDir = join(DATA_DIR, isbn, 'images');
  if (!existsSync(imagesDir)) return Response.json({ images: [] }, { headers: corsHeaders });

  const sharp = await import('sharp').catch(() => null);

  const filesPromises = (await readdir(imagesDir))
    .filter(f => f.match(/\.(png|jpg|jpeg|gif|webp)$/i))
    .map(async f => {
      const filePath = join(imagesDir, f);
      const st = await stat(filePath);
      const id = f.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
      let dimensions = null;
      if (sharp) {
        try {
          const buffer = await Bun.file(filePath).arrayBuffer();
          const metadata = await sharp.default(buffer).metadata();
          dimensions = { width: metadata.width, height: metadata.height };
        } catch (err) {
          debugLog(`[Metadata] Erro ao obter dimensões de ${f}:`, err.message);
        }
      }
      return { id, filename: f, size: st.size, modified: st.mtimeMs, dimensions };
    });

  const files = await Promise.all(filesPromises);
  return Response.json({ images: files.sort((a, b) => b.modified - a.modified) }, { headers: corsHeaders });
}

export async function getImage(isbn, imageId, url) {
  const imagesDir = join(DATA_DIR, isbn, 'images');
  const thumbnailsDir = join(DATA_DIR, isbn, 'thumbnails');
  const imagePath = await findImagePath(imagesDir, imageId);
  if (!imagePath) return new Response("Image not found", { status: 404, headers: corsHeaders });

  if (url.searchParams.get('thumbnail') !== 'true') return handleGetFile(imagePath, corsHeaders);

  if (!existsSync(thumbnailsDir)) mkdirSync(thumbnailsDir, { recursive: true });
  const imageFilename = imagePath.split('/').pop();
  const thumbPath = join(thumbnailsDir, imageFilename);
  if (existsSync(thumbPath)) return handleGetFile(thumbPath, corsHeaders);

  try {
    const sharp = await import('sharp').catch(() => null);
    if (sharp) {
      const buffer = await Bun.file(imagePath).arrayBuffer();
      const thumbnail = await sharp.default(buffer)
        .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      await Bun.write(thumbPath, thumbnail);
      debugLog(`[Thumbnail] Gerado: ${imageFilename}`);
      return new Response(thumbnail, { headers: { ...corsHeaders, 'Content-Type': 'image/png' } });
    }
  } catch (err) {
    debugLog('[Thumbnail] Erro ao gerar thumbnail:', err.message);
  }

  return handleGetFile(imagePath, corsHeaders);
}

export async function renameImage(req, isbn, imageId) {
  const imagesDir = join(DATA_DIR, isbn, 'images');
  const thumbnailsDir = join(DATA_DIR, isbn, 'thumbnails');
  const { newName } = await req.json();
  if (!newName) return Response.json({ error: "New name required" }, { status: 400, headers: corsHeaders });

  const oldPath = await findImagePath(imagesDir, imageId);
  if (!oldPath) return Response.json({ error: "Image not found" }, { status: 404, headers: corsHeaders });

  let sanitizedName = sanitizeName(newName);
  const extension = oldPath.split('.').pop();
  if (!sanitizedName.match(/\.(png|jpg|jpeg|gif|webp)$/i)) sanitizedName += `.${extension}`;

  const newPath = join(imagesDir, sanitizedName);
  if (existsSync(newPath)) return Response.json({ error: "File with this name already exists" }, { status: 409, headers: corsHeaders });

  await Bun.write(newPath, Bun.file(oldPath));
  safeUnlink(oldPath);

  const oldFilename = oldPath.split('/').pop();
  const oldThumbPath = join(thumbnailsDir, oldFilename);
  if (existsSync(oldThumbPath)) {
    await Bun.write(join(thumbnailsDir, sanitizedName), Bun.file(oldThumbPath));
    safeUnlink(oldThumbPath);
    debugLog(`Thumbnail renomeado: ${oldFilename} → ${sanitizedName}`);
  }

  const newImageId = sanitizedName.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
  debugLog(`Imagem renomeada: ${imageId} → ${newImageId}`);
  return Response.json({ message: 'Image renamed', oldId: imageId, newId: newImageId, filename: sanitizedName }, { headers: corsHeaders });
}

export async function deleteImage(isbn, imageId) {
  const imagesDir = join(DATA_DIR, isbn, 'images');
  const thumbnailsDir = join(DATA_DIR, isbn, 'thumbnails');
  const imagePath = await findImagePath(imagesDir, imageId);
  if (!imagePath) return new Response("Image not found", { status: 404, headers: corsHeaders });

  const filename = imagePath.split('/').pop();
  safeUnlink(imagePath);
  debugLog(`Imagem apagada: ${filename}`);

  const thumbPath = join(thumbnailsDir, filename);
  if (existsSync(thumbPath)) { safeUnlink(thumbPath); debugLog(`Thumbnail apagado: ${filename}`); }

  return Response.json({ message: 'Image deleted', id: imageId }, { headers: corsHeaders });
}

export async function saveSingleImage(req, isbn, imageId) {
  if (!safeSegment(imageId)) {
    return Response.json({ error: 'Invalid image id' }, { status: 400, headers: corsHeaders });
  }
  const imagesDir = join(DATA_DIR, isbn, 'images');
  const thumbnailsDir = join(DATA_DIR, isbn, 'thumbnails');
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
  if (!existsSync(thumbnailsDir)) mkdirSync(thumbnailsDir, { recursive: true });
  const formData = await req.formData();
  const image = formData.get('image');
  if (!image) return Response.json({ error: 'No image' }, { status: 400, headers: corsHeaders });
  if (image.size > MAX_IMAGE_SIZE) return Response.json({ error: 'Image too large' }, { status: 413, headers: corsHeaders });
  const rawExt = (image.type?.split('/')[1] || 'png').replace(/[^a-z]/gi, '').toLowerCase();
  const validExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
  const ext = validExts.has(rawExt) ? rawExt : 'png';
  // Substituição: remover variantes de outra extensão do mesmo id + thumbnail
  // (senão um ficheiro antigo noutra extensão venceria no findImagePath).
  for (const e of IMAGE_EXTENSIONS) {
    if (e.toLowerCase() === ext) continue;
    safeUnlink(join(imagesDir, `${imageId}.${e}`));
    safeUnlink(join(thumbnailsDir, `${imageId}.${e}`));
  }
  safeUnlink(join(thumbnailsDir, `${imageId}.${ext}`));
  await Bun.write(join(imagesDir, `${imageId}.${ext}`), image);
  return Response.json({ message: 'Image saved' }, { headers: corsHeaders });
}

export async function batchImages(req, isbn) {
  const imagesDir = join(DATA_DIR, isbn, 'images');
  const thumbnailsDir = join(DATA_DIR, isbn, 'thumbnails');
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });
  if (!existsSync(thumbnailsDir)) mkdirSync(thumbnailsDir, { recursive: true });

  const formData = await req.formData();
  const images = formData.getAll('images');
  const saved = [];

  if (images.some(f => f.size > (/\.(eps|psd)$/i.test(f.name) ? MAX_SOURCE_IMAGE_SIZE : MAX_IMAGE_SIZE))) {
    return Response.json({ error: 'Image too large' }, { status: 413, headers: corsHeaders });
  }

  await Promise.all(images.map(async (file) => {
    // EPS vetorial → rasterizar com Ghostscript (cor, alta-res) e guardar como PNG.
    if (/\.eps$/i.test(file.name)) {
      const id = sanitizeName(file.name.replace(/\.eps$/i, '')) || 'image';
      const png = await epsToPng(await file.arrayBuffer());
      if (png) { await Bun.write(join(imagesDir, `${id}.png`), png); saved.push({ id, filename: `${id}.png` }); }
      else debugLog(`[EPS] conversão falhou (gs ausente?): ${file.name}`);
      return;
    }
    // PSD (Photoshop) → rasterizar com ImageMagick e guardar como PNG.
    if (/\.psd$/i.test(file.name)) {
      const id = sanitizeName(file.name.replace(/\.psd$/i, '')) || 'image';
      const png = await psdToPng(await file.arrayBuffer());
      if (png) { await Bun.write(join(imagesDir, `${id}.png`), png); saved.push({ id, filename: `${id}.png` }); }
      else debugLog(`[PSD] conversão falhou (ImageMagick ausente?): ${file.name}`);
      return;
    }
    let filename = sanitizeName(file.name);
    if (!filename.match(/\.(png|jpg|jpeg|gif|webp)$/i)) filename += '.png';
    const id = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
    await Bun.write(join(imagesDir, filename), file);
    saved.push({ id, filename });
  }));

  return Response.json({ message: 'Batch saved', saved }, { headers: corsHeaders });
}
