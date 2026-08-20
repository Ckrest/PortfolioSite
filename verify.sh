#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
SITE_ROOT="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
cd "$SITE_ROOT"

npm run check:block-registry
npm run test:unit

while IFS= read -r source_file; do
  [[ "$source_file" == */vendor/* ]] && continue
  node --check "$source_file"
done < <(find . -path './node_modules' -prune -o -path './dist' -prune -o -name '*.js' -type f -print)

echo "portfolio_site_source=ok"
