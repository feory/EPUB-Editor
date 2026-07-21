# EPUB Platform

Plataforma de edição de ebooks: importação (PDF, DOCX, IDML, EPUB legacy), edição em rich-text com TinyMCE, gestão de capítulos, notas de rodapé, page-list, galeria de imagens, validação (ACE/EPUB) e exportação para EPUB3.

Versão atual: **0.9.4.4.1** — ver histórico completo em [CLAUDE.md](./CLAUDE.md).

## Stack

Bun · SQLite · React · TinyMCE · Vite

## Requisitos

- [Bun](https://bun.sh)
- (opcional) Docker + Docker Compose, para deployment
- (opcional) [LanguageTool](https://languagetool.org) local, para correção gramatical

## Setup

```bash
bun install
```

Cria um `.env.local` com:

```
JWT_SECRET=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
VITE_LANGUAGETOOL_URL=http://localhost:8010   # opcional
```

## Desenvolvimento

```bash
bun run dev        # frontend (Vite)
bun run server     # backend (API Bun)
bun run dev:full   # ambos em paralelo
bun run dev:lt     # ambos + LanguageTool local
```

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
src/            frontend React
server/         API Bun + SQLite
src/services/   importadores (PDF/DOCX/IDML/EPUB) e exportador EPUB
src/pages/work/ editor de capítulos (TinyMCE) e ferramentas
```
