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

# O changelog mora em docs/ desde sempre — o script procurava na raiz,
# o git add inteiro falhava calado ("|| true") e o commit do bump de
# versão não saía: a tag nascia apontando pro commit SEM o bump.
# Descoberto no release da 3.68.2 (tag caiu no commit anterior).
CHANGELOG="docs/CHANGELOG.md"
[ -f "$CHANGELOG" ] || CHANGELOG="CHANGELOG.md"

if [ -f "$CHANGELOG" ] && ! grep -q "\#\# \[$NEW_VERSION\]" "$CHANGELOG"; then
  TODAY="$(date +%Y-%m-%d)"
  TMP="$(mktemp)"
  {
    printf '## [%s] — %s\n\n%s\n\n' "$NEW_VERSION" "$TODAY" "- $MESSAGE"
    cat "$CHANGELOG"
  } > "$TMP"
  mv "$TMP" "$CHANGELOG"
fi

if [ -d .git ]; then
  git add VERSION "$CHANGELOG" package.json package-lock.json src/lib/version.ts
  git commit -q -m "chore(release): v$NEW_VERSION — $MESSAGE" || true
  git tag -a "v$NEW_VERSION" -m "$MESSAGE"
  printf "Tag criada: v%s — publique com: git push --follow-tags\n" "$NEW_VERSION"
fi

printf "✔ Release v%s pronto.\n" "$NEW_VERSION"
