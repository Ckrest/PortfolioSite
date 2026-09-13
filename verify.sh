#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
SITE_ROOT="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
cd "$SITE_ROOT"

npm run check:block-registry
npm run test:unit
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
bash -n pkg/bin/portfolio-site-realize install-user.sh scripts/stage-prepared-release scripts/validate-installed-release

while IFS= read -r source_file; do
  [[ "$source_file" == */vendor/* ]] && continue
  node --check "$source_file"
done < <(find . -path './node_modules' -prune -o -path './dist' -prune -o -name '*.js' -type f -print)

echo "portfolio_site_source=ok"
