# EPUB Platform

Plataforma de edição de ebooks: importação (PDF, DOCX, IDML, EPUB legacy), edição em rich-text com TinyMCE, gestão de capítulos, notas de rodapé, page-list, galeria de imagens, validação (ACE/EPUB) e exportação para EPUB3.

## Funcionalidades

- **Importação**: PDF (texto), Word/DOCX (via Mammoth, com mapeamento de estilos), IDML (InDesign — figuras, notas, capitulares, colunas), EPUB legacy (com mapeamento de classes antigas).
- **Editor**: rich-text sobre TinyMCE — capítulos por marcador (não por heading cru), notas de rodapé, capitulares, divisórias, versaletes, citações, caixas com borda, edição de HTML inline por bloco, atalhos de teclado, menu "/" estilo Notion.
- **Índice**: ligação automática das entradas aos capítulos por título; ligação manual (mini-menu do editor) para os casos que o automático não apanha.
- **Page-list**: deteção automática do folio do PDF impresso, alinhamento com o texto do ebook.
- **Galeria de imagens**, corte/substituição, deteção de uso.
- **Validação**: ACE (acessibilidade), epubcheck, links, notas de rodapé.
- **Revisão gramatical**: LanguageTool (opcional, local ou remoto).
- **Exportação EPUB3**: semântica (`epub:type`), page-list, footnotes, cores acessíveis.
- **Painel de administração**: utilizadores, uso de disco, sessões ativas, backup para Backblaze B2 (opcional), registo de atividade, saúde do sistema.

## Stack

Bun · SQLite · React · TinyMCE · Vite

## Requisitos

- [Bun](https://bun.sh)
- (opcional) Docker + Docker Compose, para deployment
- (opcional) [LanguageTool](https://languagetool.org) local, para correção gramatical
- (opcional) [Ghostscript](https://www.ghostscript.com) (`gs`), para figuras EPS no import IDML

## Setup

```bash
bun install
```

Cria um `.env.local` com:

```bash
# obrigatórias
JWT_SECRET=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...

# opcionais
PORT=3999                                     # porta do backend
ALLOWED_ORIGIN=http://localhost:5173          # CORS
COOKIE_SECURE=true                            # cookies só em HTTPS (produção)
DEBUG=true                                    # logs verbosos
LANGUAGETOOL_URL=http://localhost:8010        # backend → LanguageTool
VITE_LANGUAGETOOL_URL=http://localhost:8010   # frontend → LanguageTool (dev direto, sem backend)

# backup para Backblaze B2 (sem isto, o separador Backup do Painel fica desativado)
B2_KEY_ID=...
B2_APPLICATION_KEY=...
B2_BUCKET_NAME=...
```

## Desenvolvimento

```bash
bun run dev        # frontend (Vite)
bun run server     # backend (API Bun)
bun run dev:full   # ambos em paralelo
bun run dev:lt     # ambos + LanguageTool local
```

## Testes

```bash
bun test
```

Testes unitários sobre funções puras (importadores, exportador EPUB, utilitários de edição) — sem browser, correm em segundos.

## Build

```bash
bun run build      # tsc + vite build
bun run lint
```

## Deployment (Docker)

```bash
docker compose up -d --build
```

Serviços: `frontend` (nginx, porta `8049`), `backend` (API Bun, porta interna `3999`), `languagetool`.

## Estrutura

```
src/                frontend React
src/pages/work/     editor de capítulos (TinyMCE) e ferramentas
src/pages/          páginas de topo (Home, Painel, Work)
src/services/       importadores (PDF/DOCX/IDML/EPUB) e exportador EPUB
src/utils/          transformações de HTML puras, partilhadas editor/export
server/             API Bun + SQLite
```

Notas técnicas mais profundas (arquitetura de capítulos, importadores, exportação) vivem em [CLAUDE.md](./CLAUDE.md).
