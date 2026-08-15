'use strict';
/* ============================================================
 * CANIVETE — plataforma multiinformações (Node + Express)
 *
 * Banco: DATABASE_URL (PostgreSQL) ou SQLite (padrão).
 * Arquivos: S3_ENDPOINT (MinIO/S3) ou disco local (padrão).
 *
 * Env vars (Coolify → Environment Variables):
 *   PAINEL_ADM        caminho reserva do painel admin (obrigatório)
 *   PAINEL_ADM_HOSTS  domínio(s) que abrem o painel (ex: panadm.dtxnet.top)
 *   SENHA_ADM         senha inicial do admin (trocável no painel)
 *   DATABASE_URL      connection string PostgreSQL (opcional; sem ela usa SQLite)
 *   S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY/S3_REGION  (MinIO/S3; opcional)
 *   NTFY_URL/TOPIC/TOKEN  notificações ntfy (opcional)
 *   SITE_TITULO, SITE_DESCRICAO, TEMA, FUNDO_*, CONTATO_*  (defaults do site)
 *   DATA_DIR          pasta de dados (volume persistente) — padrão /data
 *   PORT              porta — padrão 3000
 * ============================================================ */
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const multer = require('multer');

const dbm = require('./db');
const storage = require('./storage');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PATH = (process.env.PAINEL_ADM || 'painel-admin').replace(/^\/+|\/+$/g, '');
const ADMIN_HOSTS = (process.env.PAINEL_ADM_HOSTS || '')
  .split(',').map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')).filter(Boolean);
const PUBLICO_DIR = path.join(__dirname, 'public');

/* uploads em memória (storage.salvar grava em disco ou S3) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
});

/* ---------------- utilitários ---------------- */
function jsonErro(res, status, msg) {
  return res.status(status).json({ erro: msg });
}
function parseJson(texto, padrao) {
  try { return JSON.parse(texto); } catch { return padrao; }
}
function esc(s) { return String(s == null ? '' : s); }
function hostAdmin(req) {
  if (!ADMIN_HOSTS.length) return false;
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  return ADMIN_HOSTS.includes(host);
}

/* ---------------- notificação ntfy ---------------- */
function notificar(titulo, mensagem, anexoUrl) {
  const url = (process.env.NTFY_URL || '').replace(/\/+$/, '');
  const topico = process.env.NTFY_TOPIC || '';
  if (!url || !topico) return;
  const body = { topic: topico, title: titulo, message: mensagem, tags: ['mega'] };
  if (anexoUrl) body.attach = anexoUrl;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NTFY_TOKEN) headers['Authorization'] = 'Bearer ' + process.env.NTFY_TOKEN;
  const req = http.request(url, { method: 'POST', headers }, res => { res.resume(); });
  req.on('error', () => {});
  req.write(JSON.stringify(body));
  req.end();
}

/* ---------------- auth admin ---------------- */
function sessaoToken(req) {
  const h = req.headers.cookie || '';
  for (const parte of h.split(';')) {
    const [k, v] = parte.trim().split('=');
    if (k === 'cnv_sessao') return decodeURIComponent(v);
  }
  return null;
}
async function exigirAdmin(req, res, next) {
  if (await dbm.validarSessao(sessaoToken(req))) return next();
  return jsonErro(res, 401, 'Não autorizado');
}

/* ---------------- árvore de menus ---------------- */
async function montarArvoreMenus(apenasAtivos) {
  const [menus, conteudos] = await Promise.all([dbm.listarMenus(), dbm.listarConteudos()]);
  const filtrados = menus.filter(m => !apenasAtivos || m.ativo);
  const conteudosAtivos = conteudos.filter(c => !apenasAtivos || c.ativo);
  const porId = new Map();
  for (const m of filtrados) porId.set(m.id, { id: m.id, nome: m.nome, icone: m.icone, ordem: m.ordem, children: [], conteudos: [] });
  for (const c of conteudosAtivos) {
    const node = porId.get(c.menu_id);
    if (node) node.conteudos.push({ id: c.id, titulo: c.titulo, tipo: c.tipo, arquivo: c.arquivo, ordem: c.ordem });
  }
  const raizes = [];
  for (const m of filtrados) {
    const node = porId.get(m.id);
    const pai = m.parent_id ? porId.get(m.parent_id) : null;
    if (pai) pai.children.push(node);
    else raizes.push(node);
  }
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.id - b.id);
    arr.forEach(n => { n.children = sortRec(n.children); n.conteudos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.id - b.id); });
    return arr;
  };
  return sortRec(raizes);
}

async function conteudoPublico(id) {
  const c = await dbm.conteudoPorId(id);
  if (!c || !c.ativo) return null;
  return {
    id: c.id, menu_id: c.menu_id, tipo: c.tipo, titulo: c.titulo,
    corpo: c.corpo, dados: parseJson(c.dados, []), arquivo: c.arquivo,
  };
}

/* ============================================================
 * API PÚBLICA (usuário)
 * ============================================================ */
app.get('/api/site', async (_req, res) => {
  res.json(await dbm.getConfigCompleta());
});

app.get('/api/menu', async (_req, res) => {
  res.json(await montarArvoreMenus(true));
});

app.get('/api/conteudo/:id', async (req, res) => {
  const c = await conteudoPublico(Number(req.params.id));
  if (!c) return jsonErro(res, 404, 'Conteúdo não encontrado');
  res.json(c);
});

app.post('/api/envio', async (req, res) => {
  const { conteudo_id, dispositivo, tipo_envio, nome, whatsapp, dados } = req.body || {};
  if (!conteudo_id || !dispositivo) return jsonErro(res, 400, 'Dados incompletos');
  const c = await dbm.conteudoPorId(Number(conteudo_id));
  if (!c) return jsonErro(res, 404, 'Conteúdo não encontrado');
  const tipo = ['formulario', 'checklist', 'anotacao'].includes(tipo_envio) ? tipo_envio : 'formulario';
  const id = await dbm.upsertEnvio({
    conteudo_id: Number(conteudo_id),
    dispositivo: String(dispositivo).slice(0, 100),
    tipo_envio: tipo,
    nome: esc(nome).slice(0, 200),
    whatsapp: esc(whatsapp).slice(0, 40),
    dados: dados || {},
  });
  if (tipo === 'formulario') {
    const total = (await dbm.todosEnvios()).filter(e => e.conteudo_id === Number(conteudo_id)).length;
    notificar('📋 Novo preenchimento', `${esc(nome) || 'Anônimo'} preencheu "${c.titulo}"${esc(whatsapp) ? ' · ' + esc(whatsapp) : ''} (envio #${id} · total: ${total})`);
  }
  res.json({ ok: true, id });
});

app.get('/api/meus-envios', async (req, res) => {
  const dispositivo = req.query.dispositivo || '';
  if (!dispositivo) return res.json([]);
  const envios = (await dbm.enviosDoDispositivo(dispositivo)).map(e => ({
    id: e.id, conteudo_id: e.conteudo_id, conteudo_titulo: e.conteudo_titulo,
    conteudo_tipo: e.conteudo_tipo, tipo_envio: e.tipo_envio,
    dados: parseJson(e.dados, {}), nome: e.nome, whatsapp: e.whatsapp,
    atualizado_em: e.atualizado_em,
  }));
  res.json(envios);
});

app.get('/api/precos', async (_req, res) => {
  res.json(await dbm.listarPrecos());
});

app.get('/api/produtos', async (req, res) => {
  const dispositivo = req.query.dispositivo || '';
  const aprovados = (await dbm.listarProdutos('aprovado')).map(p => ({
    id: p.id, nome: p.nome, vendedor: p.vendedor, whatsapp: p.whatsapp, tipo: p.tipo, preco: p.preco, foto: p.foto, criado_em: p.criado_em,
  }));
  for (const p of aprovados) p.ref = await dbm.precoReferencia(p.nome);
  const meus = dispositivo
    ? (await dbm.produtosDoDispositivo(dispositivo)).map(p => ({
        id: p.id, nome: p.nome, tipo: p.tipo, preco: p.preco, status: p.status, nota: p.nota, criado_em: p.criado_em,
      }))
    : [];
  res.json({ aprovados, meus });
});

app.post('/api/produtos', upload.single('foto'), async (req, res) => {
  const { nome, vendedor, whatsapp, tipo, preco, dispositivo } = req.body || {};
  if (!nome || !vendedor || !whatsapp || !['compra', 'venda'].includes(tipo)) {
    return jsonErro(res, 400, 'Preencha produto, vendedor, WhatsApp e tipo (compra/venda)');
  }
  if (!req.file) return jsonErro(res, 400, 'Anexe a foto comprovando a compra/venda');
  const nomeArquivo = await storage.salvar(req.file.buffer, req.file.originalname);
  const fotoUrl = '/arquivos/' + nomeArquivo;
  const id = await dbm.criarProduto({
    nome: esc(nome).slice(0, 200),
    vendedor: esc(vendedor).slice(0, 200),
    whatsapp: esc(whatsapp).slice(0, 40),
    tipo,
    preco: Number(preco) || 0,
    foto: fotoUrl,
    dispositivo: esc(dispositivo).slice(0, 100),
  });
  notificar(
    '🛒 Novo produto p/ avaliar',
    `${tipo === 'compra' ? 'Compra' : 'Venda'} · ${esc(nome)} · R$ ${Number(preco) || 0}\nVendedor: ${esc(vendedor)} · ${esc(whatsapp)}`,
    fotoUrl
  );
  res.json({ ok: true, id });
});

/* ============================================================
 * API ADMIN (sessão)
 * ============================================================ */
app.post('/api/admin/login', async (req, res) => {
  const { senha } = req.body || {};
  if (!(await dbm.senhaDefinida())) return jsonErro(res, 500, 'Senha de administrador não configurada');
  if (!dbm.verificarSenha(String(senha || ''), await dbm.getSetting('senha_hash', ''))) {
    return jsonErro(res, 401, 'Senha incorreta');
  }
  const token = await dbm.criarSessao();
  res.setHeader('Set-Cookie', `cnv_sessao=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', exigirAdmin, async (req, res) => {
  await dbm.destruirSessao(sessaoToken(req));
  res.setHeader('Set-Cookie', 'cnv_sessao=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/admin/me', exigirAdmin, (_req, res) => {
  res.json({ ok: true, painel: '/' + ADMIN_PATH });
});

app.get('/api/admin/dashboard', exigirAdmin, async (_req, res) => {
  res.json(await dbm.dashboard());
});

/* menus */
app.get('/api/admin/menus', exigirAdmin, async (_req, res) => {
  res.json(await montarArvoreMenus(false));
});
app.post('/api/admin/menus', exigirAdmin, async (req, res) => {
  const { parent_id, nome, icone, ordem, ativo } = req.body || {};
  if (!nome) return jsonErro(res, 400, 'Nome do menu é obrigatório');
  if (parent_id && !(await dbm.listarMenus()).some(m => m.id === Number(parent_id))) {
    return jsonErro(res, 400, 'Menu pai inválido');
  }
  const id = await dbm.criarMenu({ parent_id, nome, icone, ordem, ativo });
  res.json({ ok: true, id });
});
app.put('/api/admin/menus/:id', exigirAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { parent_id, nome, icone, ordem, ativo } = req.body || {};
  if (!nome) return jsonErro(res, 400, 'Nome do menu é obrigatório');
  if (parent_id && Number(parent_id) === id) return jsonErro(res, 400, 'Um menu não pode ser pai de si mesmo');
  if (parent_id && (await dbm.subtreeDe(id)).includes(Number(parent_id))) {
    return jsonErro(res, 400, 'Não pode mover para dentro do próprio submenu');
  }
  await dbm.atualizarMenu(id, { parent_id, nome, icone, ordem, ativo });
  res.json({ ok: true });
});
app.delete('/api/admin/menus/:id', exigirAdmin, async (req, res) => {
  await dbm.removerMenu(Number(req.params.id));
  res.json({ ok: true });
});

/* conteúdos */
app.get('/api/admin/conteudos', exigirAdmin, async (_req, res) => {
  const lista = (await dbm.listarConteudos()).map(c => ({ ...c, dados: parseJson(c.dados, []) }));
  res.json(lista);
});
app.post('/api/admin/conteudos', exigirAdmin, async (req, res) => {
  const b = req.body || {};
  if (!b.menu_id || !b.tipo || !b.titulo) return jsonErro(res, 400, 'Menu, tipo e título são obrigatórios');
  if (!(await dbm.listarMenus()).some(m => m.id === Number(b.menu_id))) return jsonErro(res, 400, 'Menu inválido');
  if (!['texto', 'pdf', 'imagem', 'video', 'lista', 'checklist', 'formulario', 'arquivo'].includes(b.tipo)) {
    return jsonErro(res, 400, 'Tipo de conteúdo inválido');
  }
  const id = await dbm.criarConteudo(b);
  res.json({ ok: true, id });
});
app.put('/api/admin/conteudos/:id', exigirAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  if (!(await dbm.conteudoPorId(id))) return jsonErro(res, 404, 'Conteúdo não encontrado');
  await dbm.atualizarConteudo(id, b);
  res.json({ ok: true });
});
app.delete('/api/admin/conteudos/:id', exigirAdmin, async (req, res) => {
  await dbm.removerConteudo(Number(req.params.id));
  res.json({ ok: true });
});

/* upload de arquivos (pdf, imagem, video, arquivos, fundo) */
app.post('/api/admin/upload', exigirAdmin, upload.single('arquivo'), async (req, res) => {
  if (!req.file) return jsonErro(res, 400, 'Envie um arquivo');
  const nome = await storage.salvar(req.file.buffer, req.file.originalname);
  res.json({ ok: true, url: '/arquivos/' + nome, nome: req.file.originalname });
});

/* produtos — avaliação */
app.get('/api/admin/produtos', exigirAdmin, async (req, res) => {
  const status = req.query.status || '';
  res.json(await dbm.listarProdutos(status || null));
});
app.post('/api/admin/produtos/:id/aprovar', exigirAdmin, async (req, res) => {
  const p = await dbm.produtoPorId(Number(req.params.id));
  if (!p) return jsonErro(res, 404, 'Produto não encontrado');
  await dbm.aprovarProduto(p.id);
  notificar('✅ Produto aprovado', `${p.nome} · ${p.tipo === 'compra' ? 'Compra' : 'Venda'} · R$ ${p.preco} · ${p.whatsapp}`);
  res.json({ ok: true });
});
app.post('/api/admin/produtos/:id/reprovar', exigirAdmin, async (req, res) => {
  const p = await dbm.produtoPorId(Number(req.params.id));
  if (!p) return jsonErro(res, 404, 'Produto não encontrado');
  const nota = (req.body || {}).nota || '';
  await dbm.reprovarProduto(p.id, nota);
  res.json({ ok: true });
});

/* tabela de preços de referência */
app.get('/api/admin/precos', exigirAdmin, async (_req, res) => {
  res.json(await dbm.listarPrecos());
});
app.put('/api/admin/precos', exigirAdmin, async (req, res) => {
  const itens = req.body || [];
  await dbm.salvarPrecos(itens);
  res.json({ ok: true });
});

/* configurações */
app.get('/api/admin/config', exigirAdmin, async (_req, res) => {
  res.json({
    config: await dbm.getConfigCompleta(),
    painel_path: '/' + ADMIN_PATH,
    painel_hosts: ADMIN_HOSTS.join(', '),
    banco: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
    storage: storage.s3Ativo() ? 's3' : 'disco',
    ntfy: !!(process.env.NTFY_URL && process.env.NTFY_TOPIC),
  });
});
app.put('/api/admin/config', exigirAdmin, async (req, res) => {
  await dbm.setConfigParcial(req.body || {});
  res.json({ ok: true });
});
app.put('/api/admin/senha', exigirAdmin, async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};
  if (!dbm.verificarSenha(String(senha_atual || ''), await dbm.getSetting('senha_hash', ''))) {
    return jsonErro(res, 401, 'Senha atual incorreta');
  }
  try {
    await dbm.definirSenha(nova_senha);
    notificar('🔑 Senha do painel alterada', 'A senha de administrador foi alterada.');
    res.json({ ok: true });
  } catch (e) {
    return jsonErro(res, 400, e.message);
  }
});

/* envios (preenchimentos dos usuários) */
app.get('/api/admin/envios', exigirAdmin, async (_req, res) => {
  res.json((await dbm.todosEnvios()).map(e => ({ ...e, dados: parseJson(e.dados, {}) })));
});

/* ============================================================
 * ARQUIVOS + ESTÁTICOS
 * ============================================================ */
app.get('/arquivos/:nome', (req, res) => storage.servir(req, res, req.params.nome));

// painel admin: domínio dedicado ou caminho reserva
app.get('/' + ADMIN_PATH, (_req, res) => {
  res.sendFile(path.join(PUBLICO_DIR, 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLICO_DIR, hostAdmin(req) ? 'admin.html' : 'index.html'));
});

app.use(express.static(PUBLICO_DIR));

// SPA fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/arquivos/')) return jsonErro(res, 404, 'Não encontrado');
  res.sendFile(path.join(PUBLICO_DIR, hostAdmin(req) ? 'admin.html' : 'index.html'));
});

/* ---------------- boot ---------------- */
(async () => {
  if (dbm.inicializar) await dbm.inicializar(); // PostgreSQL: cria schema

  if (!process.env.PAINEL_ADM) {
    console.warn('⚠ PAINEL_ADM não definido — usando caminho padrão: /' + ADMIN_PATH + ' (defina no Coolify!)');
  }
  if (ADMIN_HOSTS.length) {
    console.log('✔ Domínio(s) do painel admin: ' + ADMIN_HOSTS.join(', '));
  } else {
    console.warn('⚠ PAINEL_ADM_HOSTS vazio — painel acessível apenas pelo caminho /' + ADMIN_PATH);
  }
  if (!(await dbm.senhaDefinida())) {
    const senhaInicial = process.env.SENHA_ADM || 'admin1234';
    await dbm.definirSenha(senhaInicial);
    console.warn('⚠ Senha do admin inicializada' + (process.env.SENHA_ADM ? ' a partir de SENHA_ADM' : ' com o padrão (defina SENHA_ADM no Coolify!)'));
  }
  if (!process.env.NTFY_URL || !process.env.NTFY_TOPIC) {
    console.warn('⚠ NTFY_URL/NTFY_TOPIC ausentes — notificações desabilitadas');
  }
  console.log('✔ Banco: ' + (process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'));
  console.log('✔ Arquivos: ' + (storage.s3Ativo() ? 'S3 (' + process.env.S3_ENDPOINT + ')' : 'disco local (' + storage.UPLOAD_DIR + ')'));

  app.listen(PORT, () => {
    console.log(`✔ Canivete rodando em http://0.0.0.0:${PORT}`);
    console.log(`✔ Painel admin: /${ADMIN_PATH}`);
    console.log(`✔ Dados em: ${dbm.DATA_DIR || process.env.DATA_DIR || '/data'}`);
  });
})().catch(e => {
  console.error('❌ Falha no boot:', e);
  process.exit(1);
});
