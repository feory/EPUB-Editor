import { build } from "bun";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "fs";

const outdir = "./dist";

// 1. Limpar diretório de saída
if (existsSync(outdir)) {
    rmSync(outdir, { recursive: true, force: true });
}
mkdirSync(outdir);

console.log("🚀 Iniciando Bun.build...");

// 2. Executar o build do Bun
const result = await build({
  entrypoints: ["./src/main.tsx"],
  outdir: outdir,
  naming: "[name].[hash].[ext]",
  minify: true,
  sourcemap: "external",
  target: "browser",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  console.error("❌ Build falhou:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

console.log("✅ Código compilado com sucesso.");

// 3. Gerar o index.html final
// Nota: Em um projeto real, leríamos o index.html e injetaríamos os hashes. 
// Para este exemplo, vamos copiar e ajustar o básico.
let html = await Bun.file("index.html").text();
const mainJs = result.outputs.find(o => o.path.includes("main") && o.path.endsWith(".js"));

if (mainJs) {
    const jsName = mainJs.path.split("/").pop();
    html = html.replace('/src/main.tsx', `./${jsName}`);
}

// Remover referências ao Vite no HTML
html = html.replace(/<script type="module" src="\/@vite\/client"><\/script>/, "");

await Bun.write(join(outdir, "index.html"), html);

// 4. Copiar assets públicos
if (existsSync("./public")) {
    const assets = readdirSync("./public");
    for (const asset of assets) {
        copyFileSync(join("./public", asset), join(outdir, asset));
    }
}

console.log(`✨ Build concluído em ${outdir}/`);
