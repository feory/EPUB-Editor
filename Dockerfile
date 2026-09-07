FROM oven/bun:1.4-slim

ENV DEBIAN_FRONTEND=noninteractive \
    ELECTRON_DISABLE_SANDBOX=1 \
    ELECTRON_NO_SANDBOX=1 \
    ELECTRON_DISABLE_GPU=1 \
    LIBGL_ALWAYS_SOFTWARE=1 \
    NO_AT_BRIDGE=1

# Install system dependencies + Node.js 20 via NodeSource (installs to /usr/lib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gosu \
    ghostscript \
    imagemagick \
    default-jre-headless \
    ca-certificates \
    gnupg \
    rclone \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    xvfb \
    xauth \
    dbus-x11 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install @daisy/ace globally
RUN npm install -g @daisy/ace \
    && npm cache clean --force \
    # Remove all Electron locales except en-US (~150MB savings)
    && find /usr/lib/node_modules/@daisy/ace/node_modules/electron/dist/locales \
       -name "*.pak" ! -name "en-US.pak" -delete 2>/dev/null || true

# Fix chrome-sandbox permissions (SUID needed for non-root Electron)
RUN chmod 4755 /usr/lib/node_modules/@daisy/ace/node_modules/electron/dist/chrome-sandbox 2>/dev/null \
    || echo "chrome-sandbox chmod skipped"

# Wrap ace to always use xvfb-run (ensures DISPLAY is available regardless of how it's called)
RUN ACE_BIN=$(which ace) \
    && mv "$ACE_BIN" "${ACE_BIN}.real" \
    && printf '#!/bin/sh\nexport NO_AT_BRIDGE=1\nexec xvfb-run -a "%s.real" "$@"\n' "$ACE_BIN" > "$ACE_BIN" \
    && chmod +x "$ACE_BIN"

# Verify ace works headlessly
RUN ace --version && echo "✓ ace ready"

# Create non-root user BEFORE copying files so COPY --chown doesn't duplicate /app in a new layer
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install production dependencies.
# Fase 2: o backend importa apenas `jose` e `sharp` (resto das deps é do frontend,
# que se compila na imagem nginx) — podamos tudo o resto na MESMA layer para não
# duplicar tamanho. Ver server/*.js imports antes de adicionar algo à lista de manter.
COPY package.json ./
RUN bun install --production \
    && rm -rf /root/.bun/install/cache \
    && rm -rf node_modules/@codemirror node_modules/@uiw node_modules/@tanstack \
        node_modules/@tinymce node_modules/@tailwindcss node_modules/tinymce \
        node_modules/react node_modules/react-dom node_modules/react-router-dom \
        node_modules/react-virtuoso node_modules/react-image-crop \
        node_modules/lucide-react node_modules/axios node_modules/file-saver \
        node_modules/jszip node_modules/fflate node_modules/mammoth node_modules/pdfjs-dist \
        node_modules/concurrently

COPY --chown=appuser:appuser server.js ./
COPY --chown=appuser:appuser server/ ./server/
COPY --chown=appuser:appuser tools/ ./tools/
RUN mkdir -p data temp && chown appuser:appuser /app data temp

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3999

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "server.js"]
