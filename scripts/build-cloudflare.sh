#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install --disable-pip-version-check --quiet -r requirements.txt
python3 scripts/sync_issues.py
if ! zola build --base-url "${SITE_URL:-${CF_PAGES_URL:?Set SITE_URL or use Cloudflare Pages}}" --output-dir public > /tmp/aster-build.log 2>&1; then
  echo 'Site build failed; private Markdown is intentionally withheld from logs.' >&2
  exit 1
fi
rm -f /tmp/aster-build.log
python3 scripts/finish_highlight.py
