#!/bin/sh
set -e

# Fix data/temp dir permissions for volume mounts (entrypoint runs as root)
chown -R appuser:appuser /app/data /app/temp 2>/dev/null || true

# Fix ebooks.db — Docker creates it as a directory if it doesn't exist on host
if [ -d /app/ebooks.db ]; then
    rm -rf /app/ebooks.db
    touch /app/ebooks.db
fi
chown appuser:appuser /app/ebooks.db 2>/dev/null || true

# Drop to appuser
exec gosu appuser "$@"
