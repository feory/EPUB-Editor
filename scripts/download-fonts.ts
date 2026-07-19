import { write, file } from "bun";
import { mkdir } from "fs/promises";
import { join } from "path";

const fonts = [
    { name: 'Regular', url: 'https://github.com/google/fonts/raw/main/ofl/crimsontext/CrimsonText-Regular.ttf' },
    { name: 'Italic', url: 'https://github.com/google/fonts/raw/main/ofl/crimsontext/CrimsonText-Italic.ttf' },
    { name: 'Bold', url: 'https://github.com/google/fonts/raw/main/ofl/crimsontext/CrimsonText-Bold.ttf' },
    { name: 'BoldItalic', url: 'https://github.com/google/fonts/raw/main/ofl/crimsontext/CrimsonText-BoldItalic.ttf' }
];

const publicDir = join(import.meta.dir, "..", "public");
const fontsDir = join(publicDir, "fonts");

console.log(`Downloading fonts to ${fontsDir}...`);

await mkdir(fontsDir, { recursive: true });

for (const font of fonts) {
    const fontPath = join(fontsDir, `CrimsonText-${font.name}.ttf`);
    if (await file(fontPath).exists()) {
        console.log(`- ${font.name} already exists.`);
        continue;
    }

    try {
        console.log(`- Downloading ${font.name}...`);
        const response = await fetch(font.url);
        if (!response.ok) throw new Error(`Failed to fetch ${font.url}: ${response.statusText}`);
        await write(fontPath, await response.arrayBuffer());
        console.log(`  ✓ Saved to ${fontPath}`);
    } catch (err) {
        console.error(`  ✕ Error downloading ${font.name}:`, err);
    }
}

console.log("Font download complete.");
