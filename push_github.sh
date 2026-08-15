#!/usr/bin/env bash
# Empurra o código para o GitHub (repo lordtx/canivete-dtxnet)
# Token lido de .git-token (gitignored) para evitar exposição em comando/env.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
GH_TOKEN="$(cat "${DIR}/.git-token" | tr -d '[:space:]')"
REPO="lordtx/canivete-dtxnet"

echo "▶ Criando repositório $REPO ..."
curl -s -X POST "https://api.github.com/user/repos" \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: deploy-canivete" \
  -d '{"name":"canivete-dtxnet","description":"Canivete — plataforma multiinformações (Node+Express+Postgres/SQLite+S3)","private":true}' \
  -o /tmp/gh_canivete.json -w "  HTTP %{http_code}\n" || true
if grep -q '"full_name"' /tmp/gh_canivete.json; then
  echo "  Repo criado (ou já existia)"
else
  head -c 300 /tmp/gh_canivete.json; echo
fi

echo "▶ Enviando código..."
cd "$DIR"
git init -q 2>/dev/null || true
git add -A
git commit -qm "Canivete: plataforma multiinformações (Postgres/SQLite + S3/disco)" 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://lordtx:${GH_TOKEN}@github.com/${REPO}.git"
git push -u origin main -f 2>&1 | tail -2

echo "▶ Verificando..."
curl -s "https://api.github.com/repos/${REPO}/contents/server.js" \
  -H "Authorization: Bearer ${GH_TOKEN}" -H "User-Agent: deploy-canivete" \
  | grep -o '"size": [0-9]*' | head -1

echo "OK: https://github.com/${REPO}"
