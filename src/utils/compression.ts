import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';

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

        // Compress with gzip (level 6 = balanced speed/compression)
        const compressed = gzipSync(data, { level: 6 });

        // Convert to base64 without spread operator (prevents stack overflow)
        let binary = '';
        const len = compressed.length;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(compressed[i]);
        }
        const base64 = btoa(binary);

        const originalSize = (html.length / 1024).toFixed(2);
        const compressedSize = (base64.length / 1024).toFixed(2);
        const ratio = ((1 - base64.length / html.length) * 100).toFixed(1);

        console.log(`[Compression] ${originalSize}KB → ${compressedSize}KB (${ratio}% redução)`);

        return base64;
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

        console.log(`[Decompression] ${(compressed.length / 1024).toFixed(2)}KB → ${(html.length / 1024).toFixed(2)}KB`);

        return html;
    } catch (error) {
        console.error('[Decompression] Erro ao descomprimir:', error);
        // Fallback: try to return as-is (might be legacy uncompressed data)
        return compressed;
    }
}
