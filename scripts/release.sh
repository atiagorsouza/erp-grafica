#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PrintFlow ERP — RELEASE DE NOVA VERSÃO
#
# Uso: bash scripts/release.sh 3.1.0 "Correções no PDV e motor de custo"
#
# Faz: valida semver → atualiza VERSION, src/lib/version.ts e package.json
#      → adiciona entrada no CHANGELOG.md → commit + tag anotada (se git).
# ---------------------------------------------------------------------------
set -euo pipefail
NEW_VERSION="${1:-}"
MESSAGE="${2:-Release $NEW_VERSION}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -n "$NEW_VERSION" ] || { echo "Uso: bash scripts/release.sh <versão> [mensagem]"; exit 1; }
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || { echo "✖ Versão semver inválida: $NEW_VERSION"; exit 1; }

cd "$ROOT"
CURRENT="$(head -n1 VERSION | tr -d '[:space:]')"

printf "Release %s → %s\n" "$CURRENT" "$NEW_VERSION"

printf '%s\n' "$NEW_VERSION" > VERSION
node scripts/check-version.mjs --fix >/dev/null

if [ -f CHANGELOG.md ] && ! grep -q "\#\# \[$NEW_VERSION\]" CHANGELOG.md; then
  TODAY="$(date +%Y-%m-%d)"
  TMP="$(mktemp)"
  {
    printf '## [%s] — %s\n\n%s\n\n' "$NEW_VERSION" "$TODAY" "- $MESSAGE"
    cat CHANGELOG.md
  } > "$TMP"
  mv "$TMP" CHANGELOG.md
fi

if [ -d .git ]; then
  git add VERSION CHANGELOG.md package.json package-lock.json src/lib/version.ts 2>/dev/null || true
  git commit -q -m "chore(release): v$NEW_VERSION — $MESSAGE" || true
  git tag -a "v$NEW_VERSION" -m "$MESSAGE"
  printf "Tag criada: v%s — publique com: git push --follow-tags\n" "$NEW_VERSION"
fi

printf "✔ Release v%s pronto.\n" "$NEW_VERSION"
