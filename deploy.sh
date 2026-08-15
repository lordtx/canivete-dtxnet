#!/usr/bin/env bash
# ============================================================
# DEPLOY DO CANIVETE — repo GitHub + app Coolify + DNS
#
# Uso:
#   GH_TOKEN=... PAINEL_ADM=... SENHA_ADM=... bash deploy.sh
#
# Env obrigatórias:
#   GH_TOKEN      token GitHub (fine-grained, repo create + push)
#   PAINEL_ADM    caminho reserva do painel (ex: gestao-reserva-4821)
#   SENHA_ADM     senha inicial do admin (trocável depois pelo painel)
#
# Env opcionais:
#   PAINEL_ADM_HOSTS   domínio(s) do painel admin (padrão: panadm.dtxnet.top)
#   DOMINIO_MEMBROS    domínio dos usuários (padrão: painel.dtxnet.top)
#   NTFY_URL / NTFY_TOPIC / NTFY_TOKEN
#   DATA_DIR           (padrão /data — volume persistente)
# ============================================================
set -euo pipefail

GH_TOKEN="${GH_TOKEN:?Defina GH_TOKEN}"
PAINEL_ADM="${PAINEL_ADM:?Defina PAINEL_ADM (caminho reserva do painel)}"
SENHA_ADM="${SENHA_ADM:?Defina SENHA_ADM}"
PAINEL_ADM_HOSTS="${PAINEL_ADM_HOSTS:-panadm.dtxnet.top}"
DOMINIO_MEMBROS="${DOMINIO_MEMBROS:-painel.dtxnet.top}"
REPO="lordtx/canivete-dtxnet"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================================"
echo " CANIVETE — deploy"
echo "  Membros:  https://${DOMINIO_MEMBROS}"
echo "  Admin:    https://${PAINEL_ADM_HOSTS}  (reserva: /${PAINEL_ADM})"
echo "============================================================"

# ---------- 1. Repositório GitHub ----------
echo "▶ 1/4 Criando repositório $REPO ..."
curl -s -X POST "https://api.github.com/user/repos" \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: deploy-canivete" \
  -d "{\"name\":\"canivete-dtxnet\",\"description\":\"Canivete — plataforma multiinformações (Node+Express+SQLite)\",\"private\":true}" \
  -o /tmp/gh_canivete.json -w "  HTTP %{http_code}\n" || true
if ! grep -q '"full_name"' /tmp/gh_canivete.json; then
  echo "  (repo pode já existir — seguindo)"
fi

echo "▶ Enviando código..."
cd "$DIR"
git init -q 2>/dev/null || true
git add -A
git commit -qm "Canivete: plataforma multiinformações (menus, conteúdos, ranking)" 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://lordtx:${GH_TOKEN}@github.com/${REPO}.git"
git push -u origin main -f 2>&1 | tail -2

# ---------- 2. App no Coolify ----------
echo "▶ 2/4 Criando/atualizando aplicação no Coolify..."
export PAINEL_ADM SENHA_ADM PAINEL_ADM_HOSTS DOMINIO_MEMBROS
python3 "${DIR}/criar_app_coolify.py"

# ---------- 3. DNS ----------
echo "▶ 3/4 Criando registros DNS..."
export DOMINIO_MEMBROS PAINEL_ADM_HOSTS
python3 "${DIR}/criar_dns.py" || echo "  ⚠ DNS não criado — crie os registros A manualmente no Cloudflare."

# ---------- 4. Pronto ----------
echo ""
echo "============================================================"
echo " AGORA NO PAINEL DO COOLIFY (https://server.dtxnet.top):"
echo "============================================================"
echo " ✔ Repo:  ${REPO}"
echo " ✔ App:   Canivete (dockerfile, porta 3000)"
echo " ✔ Domínios: ${DOMINIO_MEMBROS} + ${PAINEL_ADM_HOSTS}"
echo " ✔ Volume: /data (persistente)"
echo ""
echo " Se o deploy não disparou sozinho, clique em Redeploy no app."
echo " Env vars já injetadas: PAINEL_ADM, SENHA_ADM, PAINEL_ADM_HOSTS,"
echo "   DATA_DIR, NTFY_URL/TOPIC/TOKEN (se definidas)"
echo ""
echo " Depois de publicado:"
echo "   Membros → https://${DOMINIO_MEMBROS}"
echo "   Admin   → https://${PAINEL_ADM_HOSTS} (senha: SENHA_ADM)"
echo "   Reserva → https://${DOMINIO_MEMBROS}/${PAINEL_ADM}"
echo "============================================================"
