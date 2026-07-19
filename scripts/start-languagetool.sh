#!/bin/bash
set -e

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
LT_DIR="$SCRIPTS_DIR/languagetool"
PORT="${LANGUAGETOOL_PORT:-8010}"

# Encontrar Java 17+
find_java() {
  for candidate in \
    "$(/usr/libexec/java_home -v 17 2>/dev/null)" \
    "/opt/homebrew/opt/openjdk@17/bin/java" \
    "/opt/homebrew/opt/openjdk/bin/java" \
    "/usr/local/opt/openjdk@17/bin/java" \
    "$(which java 2>/dev/null)"; do
    if [ -x "$candidate" ]; then
      version=$("$candidate" -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
      [ "${version:-0}" -ge 17 ] 2>/dev/null && echo "$candidate" && return
    fi
  done
  echo ""
}

JAVA_BIN=$(find_java)

if [ -z "$JAVA_BIN" ]; then
  echo "Java 17+ não encontrado. A instalar via brew..."
  brew install openjdk@17
  JAVA_BIN="/opt/homebrew/opt/openjdk@17/bin/java"
fi

echo "Java: $JAVA_BIN ($("$JAVA_BIN" -version 2>&1 | head -1))"

if [ ! -d "$LT_DIR" ]; then
  echo "A descarregar LanguageTool..."
  mkdir -p "$LT_DIR"
  curl -L "https://languagetool.org/download/LanguageTool-stable.zip" -o "$LT_DIR/lt.zip"
  unzip -q "$LT_DIR/lt.zip" -d "$LT_DIR/extracted"
  mv "$LT_DIR/extracted/LanguageTool-"* "$LT_DIR/server"
  rm -rf "$LT_DIR/lt.zip" "$LT_DIR/extracted"
  echo "LanguageTool instalado em $LT_DIR/server"
fi

JAR=$(find "$LT_DIR/server" -name "languagetool-server.jar" | head -1)

if [ -z "$JAR" ]; then
  echo "Erro: languagetool-server.jar não encontrado"
  exit 1
fi

echo "A iniciar LanguageTool na porta $PORT..."
"$JAVA_BIN" -jar "$JAR" --port "$PORT" --allow-origin '*'
