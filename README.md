# Canivete 🛠️

Plataforma multiinformações para quem compra e vende na internet — um canivete suíço digital:
menus e submenus, conteúdos (texto, PDF, imagem, vídeo, lista, checklist, formulário, arquivo),
ranking de produtos com aprovação, e cópias em PDF dos preenchimentos do usuário.

- **Membros:** https://painel.dtxnet.top
- **Admin:** https://panadm.dtxnet.top (domínio dedicado) ou `/{PAINEL_ADM}` (caminho reserva)

## Stack

- Node.js 22 + Express + SQLite (better-sqlite3) — serviço único
- Frontend vanilla JS (sem build) + jsPDF/autotable via CDN
- PWA (manifest + service worker offline-first)
- Deploy: Dockerfile → Coolify (volume persistente `/data`)

## Variáveis de ambiente (Coolify → Environment Variables)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PAINEL_ADM` | ✅ | Caminho reserva do painel (ex: `gestao-reserva-4821`) |
| `SENHA_ADM` | ✅ | Senha inicial do admin (trocável pelo painel; depois vale o banco) |
| `PAINEL_ADM_HOSTS` | — | Domínio(s) que abrem o painel direto, separados por vírgula (ex: `panadm.dtxnet.top`) |
| `DATA_DIR` | — | Pasta de dados (padrão `/data` — **use volume persistente!**) |
| `PORT` | — | Porta (padrão 3000) |
| `NTFY_URL` | — | Servidor ntfy (ex: `https://ntfy.sh`) — sem isso, notificações off |
| `NTFY_TOPIC` | — | Tópico ntfy |
| `NTFY_TOKEN` | — | Token ntfy (opcional) |
| `SITE_TITULO` / `SITE_DESCRICAO` / `TEMA` / `FUNDO_*` / `CONTATO_*` | — | Defaults iniciais (configuráveis pelo painel) |

> As exceções que ficam no painel (Configurações): título, descrição, tema, fundo, contato e senha.

## Estrutura

```
server.js            API + estáticos + roteamento por Host (PAINEL_ADM_HOSTS)
db.js                Schema SQLite + camada de dados
public/
  index.html         App dos membros
  admin.html         Painel admin
  css/estilo.css     Temas claro/escuro/contraste
  js/app.js          Lógica dos membros
  js/admin.js        Lógica do admin
  js/comum.js        Helpers + gerador de PDF (jsPDF)
  manifest.json, sw.js, icons/   PWA
deploy.sh            Orquestra deploy (repo + Coolify + DNS)
criar_app_coolify.py App no Coolify via API (projeto, env vars, volume, deploy)
criar_dns.py         Registros A no Cloudflare (painel + panadm)
Dockerfile           node:22-slim → porta 3000, VOLUME /data
```

## Testes locais

```bash
npm install
PAINEL_ADM=gestao-teste SENHA_ADM=teste123 PAINEL_ADM_HOSTS=panadm.dtxnet.top \
  DATA_DIR=./dados-teste PORT=3456 node server.js
# API: node /tmp/teste_canivete.js   (47 verificações)
# Navegador: python3 /tmp/browser_canivete.py  (25 verificações + screenshots em qa/)
```

## Fluxo do usuário

1. Navega pelos menus/submenus e abre conteúdos
2. Checklist: marca itens, progresso é salvo por dispositivo (localStorage UUID)
3. Formulário: preenche, envia (push ntfy pro admin) e pode baixar PDF com as respostas
4. **Minhas anotações**: em qualquer conteúdo, salva nota e baixa "minha cópia" em PDF
5. **Ranking**: cadastra produto com foto comprovando compra/venda → vai pra aprovação;
   aprovados aparecem com valores de referência (compra mín. × venda máx.)

## Fluxo do admin

1. `https://panadm.dtxnet.top` (ou `/{PAINEL_ADM}`) → login com senha
2. Menus → árvore recursiva (submenu de submenu, quantos precisar)
3. Conteúdos → 8 tipos, upload pelo painel, ordem, ativar/desativar
4. Produtos → aprovar/reprovar com motivo (usuário vê o status)
5. Tabela de Preços → referência por produto (casa por nome no ranking)
6. Envios → todos os preenchimentos dos usuários
7. Configurações → aparência, fundo, contato, senha, caminho do painel
