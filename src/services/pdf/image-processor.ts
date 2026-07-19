import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedImage, PdfObj, PdfPage, PdfOperatorList, ImageSettings } from './types';

/**
 * Convert raw image data from PDF.js to a compressed Blob
 */
export const convertImageToBlob = async (imgObj: PdfObj, settings?: ImageSettings): Promise<Blob> => {
  const compress = settings?.compress ?? true;
  const quality = settings?.quality ?? 0.8;
  const MAX_WIDTH = settings?.maxWidth ?? 1200;
  
  const originalWidth = imgObj.width || 0;
  const originalHeight = imgObj.height || 0;
  
  // Calculate scaling if image is too large
  let targetWidth = originalWidth;
  let targetHeight = originalHeight;
  
  if (originalWidth > MAX_WIDTH) {
    const scale = MAX_WIDTH / originalWidth;
    targetWidth = MAX_WIDTH;
    targetHeight = Math.round(originalHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // If compressing, fill with white background (JPEGs don't support transparency)
  if (compress) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Helper to draw with scaling
  const drawImage = async (source: any) => {
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  };

  if (!imgObj.data || imgObj.data.length === 0) {
    if (imgObj.bitmap) {
      try {
        if (imgObj.bitmap instanceof ImageBitmap) {
          await drawImage(imgObj.bitmap);
        } else {
          const bitmap = await createImageBitmap(imgObj.bitmap as any);
          await drawImage(bitmap);
        }
      } catch (err) {
        if (ArrayBuffer.isView(imgObj.bitmap) || imgObj.bitmap instanceof ArrayBuffer) {
          const data = new Uint8ClampedArray(imgObj.bitmap as any);
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = originalWidth;
          tempCanvas.height = originalHeight;
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx) {
            const imageData = new ImageData(data, originalWidth, originalHeight);
            tCtx.putImageData(imageData, 0, 0);
            await drawImage(tempCanvas);
          }
        }
        else {
          throw new Error('Could not convert bitmap to image');
        }
      }
    } else {
      throw new Error('Image object has no data or bitmap');
    }
  } else {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalWidth;
    tempCanvas.height = originalHeight;
    const tCtx = tempCanvas.getContext('2d');
    
    if (tCtx) {
      let imageData: ImageData;
      if (imgObj.kind === 1) { // RGB_24BPP
        const rgbaData = new Uint8ClampedArray(originalWidth * originalHeight * 4);
        for (let i = 0, j = 0; i < imgObj.data.length; i += 3, j += 4) {
          rgbaData[j] = imgObj.data[i];
          rgbaData[j + 1] = imgObj.data[i + 1];
          rgbaData[j + 2] = imgObj.data[i + 2];
          rgbaData[j + 3] = 255;
        }
        imageData = new ImageData(rgbaData, originalWidth, originalHeight);
      } else {
        imageData = new ImageData(
          new Uint8ClampedArray(imgObj.data),
          originalWidth,
          originalHeight
        );
      }
      tCtx.putImageData(imageData, 0, 0);
      await drawImage(tempCanvas);
    }
  }

  return new Promise((resolve, reject) => {
    if (compress) {
      // Export as JPEG with defined quality for significant size reduction
      canvas.toBlob((blob) => {
        if (blob) { resolve(blob); }
        else { reject(new Error('Failed to convert canvas to blob')); }
      }, 'image/jpeg', quality);
    } else {
      // Export as original PNG
      canvas.toBlob((blob) => {
        if (blob) { resolve(blob); }
        else { reject(new Error('Failed to convert canvas to blob')); }
      }, 'image/png');
    }
  });
};

/**
 * Extract images from a PDF page
 */
export const extractImagesFromPage = async (
  page: PdfPage,
  pageIndex: number,
  operatorList: PdfOperatorList,
  minY: number,
  maxY: number,
  settings?: ImageSettings
): Promise<ExtractedImage[]> => {
  const images: ExtractedImage[] = [];
  let imageCount = 0;

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const fn = operatorList.fnArray[i];

    if (
      fn === (pdfjsLib.OPS as any).paintImageXObject ||
      fn === (pdfjsLib.OPS as any).paintInlineImageXObject
    ) {
      try {
        const args = operatorList.argsArray[i];
        const imgName = args[0];

        let imgObj: PdfObj;
        if (page.objs.has(imgName)) {
          imgObj = page.objs.get(imgName);
        } else {
          await new Promise<void>((resolve) => {
            page.objs.ensure(imgName, resolve);
          });
          imgObj = page.objs.get(imgName);
        }

        if (!imgObj || !imgObj.width || !imgObj.height) continue;

        let imgY = maxY;
        if (args.length > 1 && Array.isArray(args[1])) {
          const transform = args[1];
          if (transform.length >= 6) {
            imgY = transform[5];
          }
        }

        if (imgY < minY || imgY > maxY) continue;

        const blob = await convertImageToBlob(imgObj, settings);
        const imageId = `img-p${pageIndex}-${imageCount}`;
        imageCount++;

        images.push({
          id: imageId,
          blob,
          position: imgY,
          pageIndex
        });
      } catch (error) {
        console.error(`[Page ${pageIndex}] Failed to extract image:`, error);
      }
    }
  }

  return images;
};
