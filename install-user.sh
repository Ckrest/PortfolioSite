#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="${HOME}/.local/bin"
PRIVATE_CONFIG="$CONFIG_HOME/portfolio-site"
NODE_BIN="${PORTFOLIO_SITE_NODE:-}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Portfolio Site installation requires Node.js 20 or newer." >&2
  exit 1
fi
NODE_BIN="$(readlink -f "$NODE_BIN")"
NODE_MAJOR="$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ || "$NODE_MAJOR" -lt 20 ]]; then
  echo "Portfolio Site installation requires Node.js 20 or newer." >&2
  exit 1
fi

mkdir -p "$BIN_HOME" "$CONFIG_HOME/systemd/user" "$DATA_HOME/applications" \
  "$PRIVATE_CONFIG"
chmod 700 "$PRIVATE_CONFIG"
environment_file="$(mktemp "$PRIVATE_CONFIG/.environment.XXXXXX")"
printf 'PORTFOLIO_SITE_NODE=%s\n' "$NODE_BIN" >"$environment_file"
chmod 600 "$environment_file"
mv -f "$environment_file" "$PRIVATE_CONFIG/environment"
ln -sfn "$ROOT_DIR/pkg/bin/portfolio-site" "$BIN_HOME/portfolio-site"
ln -sfn "$ROOT_DIR/pkg/bin/portfolio-site-server" "$BIN_HOME/portfolio-site-server"
ln -sfn "$ROOT_DIR/pkg/systemd/portfolio-site-local.service" \
  "$CONFIG_HOME/systemd/user/portfolio-site-local.service"
ln -sfn "$ROOT_DIR/pkg/systemd/portfolio-site-pool-sync.service" \
  "$CONFIG_HOME/systemd/user/portfolio-site-pool-sync.service"
ln -sfn "$ROOT_DIR/pkg/systemd/portfolio-site-pool-sync.path" \
  "$CONFIG_HOME/systemd/user/portfolio-site-pool-sync.path"
ln -sfn "$ROOT_DIR/pkg/systemd/portfolio-site-pool-sync.timer" \
  "$CONFIG_HOME/systemd/user/portfolio-site-pool-sync.timer"
ln -sfn "$ROOT_DIR/pkg/applications/portfolio-site.desktop" \
  "$DATA_HOME/applications/portfolio-site.desktop"

systemctl --user daemon-reload
systemctl --user enable --now portfolio-site-pool-sync.path portfolio-site-pool-sync.timer
update-desktop-database "$DATA_HOME/applications" >/dev/null 2>&1 || true
echo "Installed managed Portfolio Site launcher, runtime binding, and pool synchronization."
