import { gzip, gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';

// Base64 sem spread (evita stack overflow em buffers grandes).
function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/**
 * Como `compressHtml`, mas o gzip corre num worker (fflate async): num livro de 1,6 MB o
 * `gzipSync` de nível 9 bloqueava a thread principal ~66 ms a cada save. A saída é a mesma.
 * Onde tem de ser síncrono (beforeunload) continua a usar-se `compressHtml`.
 */
export function compressHtmlAsync(html: string): Promise<string> {
    return new Promise((resolve) => {
        gzip(strToU8(html), { level: 9 }, (err, data) => {
            if (err) { console.error('[Compression] Erro ao comprimir:', err); resolve(`UNCOMPRESSED:${html}`); return; }
            resolve(toBase64(data));
        });
    });
}

/**
 * Compress HTML string to base64 (gzip)
 * Typical compression: 70-80% size reduction
 *
 * @param html - HTML string to compress
 * @returns Base64 encoded compressed data
 */
export function compressHtml(html: string): string {
    try {
        // Convert string to Uint8Array
        const data = strToU8(html);

        // Compress with gzip (level 9 = máxima compressão; mais lento a comprimir, sem custo na descompressão)
        const compressed = gzipSync(data, { level: 9 });

        return toBase64(compressed);
    } catch (error) {
        console.error('[Compression] Erro ao comprimir:', error);
        // Fallback: return original (with marker for uncompressed)
        return `UNCOMPRESSED:${html}`;
    }
}

/**
 * Decompress base64 gzip data back to HTML string
 *
 * @param compressed - Base64 encoded compressed data
 * @returns Original HTML string
 */
export function decompressHtml(compressed: string): string {
    try {
        // Check if data is actually compressed
        if (compressed.startsWith('UNCOMPRESSED:')) {
            return compressed.slice('UNCOMPRESSED:'.length);
        }

        // Convert base64 to Uint8Array
        const binaryString = atob(compressed);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Decompress
        const decompressed = gunzipSync(bytes);

        // Convert back to string
        const html = strFromU8(decompressed);

        return html;
    } catch (error) {
        console.error('[Decompression] Erro ao descomprimir:', error);
        // Fallback: try to return as-is (might be legacy uncompressed data)
        return compressed;
    }
}
