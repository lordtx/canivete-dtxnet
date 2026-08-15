'use strict';
/* ============================================================
 * CANIVETE — camada de dados PostgreSQL (adapter async)
 * Mesma interface do db-sqlite.js; selecionado quando DATABASE_URL existe.
 * ============================================================ */
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'dados');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

/* ---------------- schema ---------------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS menus (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS conteudos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '[]',
  arquivo TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS envios (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conteudo_id INTEGER NOT NULL REFERENCES conteudos(id) ON DELETE CASCADE,
  dispositivo TEXT NOT NULL,
  tipo_envio TEXT NOT NULL DEFAULT 'formulario',
  nome TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  atualizado_em TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE(conteudo_id, dispositivo, tipo_envio)
);
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  tipo TEXT NOT NULL,
  preco REAL NOT NULL DEFAULT 0,
  foto TEXT NOT NULL DEFAULT '',
  dispositivo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  nota TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  avaliado_em TEXT
);
CREATE TABLE IF NOT EXISTS precos_referencia (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto TEXT NOT NULL UNIQUE,
  preco_min_compra REAL NOT NULL DEFAULT 0,
  preco_max_venda REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
  expira_em TEXT NOT NULL
);
`;

async function inicializar() {
  await pool.query(SCHEMA);
}

/* ---------------- helpers ---------------- */
async function getSetting(chave, padrao = '') {
  const r = await pool.query('SELECT valor FROM settings WHERE chave = $1', [chave]);
  return r.rows.length ? r.rows[0].valor : padrao;
}
async function setSetting(chave, valor) {
  await pool.query(
    'INSERT INTO settings (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
    [chave, String(valor)]
  );
}

/* ---- senha ---- */
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verificarSenha(senha, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(senha, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function senhaDefinida() {
  return !!(await getSetting('senha_hash', ''));
}
async function definirSenha(senha) {
  if (!senha || String(senha).length < 4) throw new Error('Senha deve ter pelo menos 4 caracteres');
  await setSetting('senha_hash', hashSenha(String(senha)));
}

/* ---- sessões ---- */
async function criarSessao() {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    "INSERT INTO sessoes (token, expira_em) VALUES ($1, to_char(now() + interval '12 hours', 'YYYY-MM-DD\"T\"HH24:MI:SS.000\"Z\"'))",
    [token]
  );
  return token;
}
async function validarSessao(token) {
  if (!token) return false;
  const r = await pool.query('SELECT expira_em FROM sessoes WHERE token = $1', [token]);
  if (!r.rows.length) return false;
  if (new Date(r.rows[0].expira_em).getTime() < Date.now()) {
    await pool.query('DELETE FROM sessoes WHERE token = $1', [token]);
    return false;
  }
  return true;
}
async function destruirSessao(token) {
  if (token) await pool.query('DELETE FROM sessoes WHERE token = $1', [token]);
}

/* ---- menus ---- */
async function listarMenus() {
  const r = await pool.query('SELECT * FROM menus ORDER BY ordem, id');
  return r.rows;
}
async function criarMenu({ parent_id, nome, icone, ordem, ativo }) {
  const r = await pool.query(
    'INSERT INTO menus (parent_id, nome, icone, ordem, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [parent_id || null, nome, icone || '', ordem || 0, ativo === false ? 0 : 1]
  );
  return r.rows[0].id;
}
async function atualizarMenu(id, { parent_id, nome, icone, ordem, ativo }) {
  await pool.query(
    'UPDATE menus SET parent_id = $1, nome = $2, icone = $3, ordem = $4, ativo = $5 WHERE id = $6',
    [parent_id || null, nome, icone || '', ordem || 0, ativo === false ? 0 : 1, id]
  );
}
async function removerMenu(id) {
  await pool.query('DELETE FROM menus WHERE id = $1', [id]);
}
async function filhosDe(id) {
  const r = await pool.query('SELECT id FROM menus WHERE parent_id = $1', [id]);
  return r.rows.map(x => x.id);
}
async function subtreeDe(id) {
  const ids = new Set([id]);
  let fila = [id];
  while (fila.length) {
    const r = await pool.query(
      'SELECT id FROM menus WHERE parent_id = ANY($1::int[])',
      [fila]
    );
    fila = r.rows.map(x => x.id);
    r.rows.forEach(x => ids.add(x.id));
  }
  return [...ids];
}

/* ---- conteúdos ---- */
async function listarConteudos() {
  const r = await pool.query('SELECT * FROM conteudos ORDER BY ordem, id');
  return r.rows;
}
async function conteudoPorId(id) {
  const r = await pool.query('SELECT * FROM conteudos WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function criarConteudo({ menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo }) {
  const r = await pool.query(
    'INSERT INTO conteudos (menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [menu_id, tipo, titulo, corpo || '', JSON.stringify(dados || []), arquivo || '', ordem || 0, ativo === false ? 0 : 1]
  );
  return r.rows[0].id;
}
async function atualizarConteudo(id, { menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo }) {
  await pool.query(
    'UPDATE conteudos SET menu_id = $1, tipo = $2, titulo = $3, corpo = $4, dados = $5, arquivo = $6, ordem = $7, ativo = $8 WHERE id = $9',
    [menu_id, tipo, titulo, corpo || '', JSON.stringify(dados || []), arquivo || '', ordem || 0, ativo === false ? 0 : 1, id]
  );
}
async function removerConteudo(id) {
  await pool.query('DELETE FROM conteudos WHERE id = $1', [id]);
}

/* ---- envios ---- */
async function upsertEnvio({ conteudo_id, dispositivo, tipo_envio, nome, whatsapp, dados }) {
  const r = await pool.query(
    `INSERT INTO envios (conteudo_id, dispositivo, tipo_envio, nome, whatsapp, dados)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (conteudo_id, dispositivo, tipo_envio)
     DO UPDATE SET nome = EXCLUDED.nome, whatsapp = EXCLUDED.whatsapp, dados = EXCLUDED.dados,
                   atualizado_em = to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
     RETURNING id`,
    [conteudo_id, dispositivo, tipo_envio, nome || '', whatsapp || '', JSON.stringify(dados || {})]
  );
  return r.rows[0].id;
}
async function enviosDoDispositivo(dispositivo) {
  const r = await pool.query(
    `SELECT e.*, c.titulo AS conteudo_titulo, c.tipo AS conteudo_tipo
     FROM envios e JOIN conteudos c ON c.id = e.conteudo_id
     WHERE e.dispositivo = $1 ORDER BY e.atualizado_em DESC`,
    [dispositivo]
  );
  return r.rows;
}
async function envioPorConteudo(conteudo_id, dispositivo, tipo_envio) {
  const r = await pool.query(
    'SELECT * FROM envios WHERE conteudo_id = $1 AND dispositivo = $2 AND tipo_envio = $3',
    [conteudo_id, dispositivo, tipo_envio]
  );
  return r.rows[0] || null;
}
async function todosEnvios() {
  const r = await pool.query(
    `SELECT e.*, c.titulo AS conteudo_titulo, m.nome AS menu_nome
     FROM envios e JOIN conteudos c ON c.id = e.conteudo_id
     LEFT JOIN menus m ON m.id = c.menu_id
     ORDER BY e.atualizado_em DESC`
  );
  return r.rows;
}

/* ---- produtos ---- */
async function criarProduto({ nome, vendedor, whatsapp, tipo, preco, foto, dispositivo }) {
  const r = await pool.query(
    'INSERT INTO produtos (nome, vendedor, whatsapp, tipo, preco, foto, dispositivo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [nome, vendedor, whatsapp, tipo, Number(preco) || 0, foto || '', dispositivo || '']
  );
  return r.rows[0].id;
}
async function listarProdutos(status) {
  const r = status
    ? await pool.query('SELECT * FROM produtos WHERE status = $1 ORDER BY criado_em DESC', [status])
    : await pool.query('SELECT * FROM produtos ORDER BY criado_em DESC');
  return r.rows;
}
async function produtoPorId(id) {
  const r = await pool.query('SELECT * FROM produtos WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function aprovarProduto(id) {
  await pool.query(
    "UPDATE produtos SET status = 'aprovado', avaliado_em = to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), nota = '' WHERE id = $1",
    [id]
  );
}
async function reprovarProduto(id, nota) {
  await pool.query(
    "UPDATE produtos SET status = 'reprovado', nota = $1, avaliado_em = to_char(now(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = $2",
    [nota || '', id]
  );
}
async function produtosDoDispositivo(dispositivo) {
  const r = await pool.query('SELECT * FROM produtos WHERE dispositivo = $1 ORDER BY criado_em DESC', [dispositivo]);
  return r.rows;
}

/* ---- preços de referência ---- */
async function listarPrecos() {
  const r = await pool.query('SELECT * FROM precos_referencia ORDER BY produto');
  return r.rows;
}
async function salvarPrecos(itens) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM precos_referencia');
    for (const it of itens) {
      if (it && it.produto) await client.query(
        'INSERT INTO precos_referencia (produto, preco_min_compra, preco_max_venda) VALUES ($1, $2, $3)',
        [String(it.produto).trim(), Number(it.preco_min_compra) || 0, Number(it.preco_max_venda) || 0]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
async function precoReferencia(nomeProduto) {
  if (!nomeProduto) return null;
  const n = String(nomeProduto).toLowerCase();
  const r = await pool.query('SELECT produto, preco_min_compra, preco_max_venda FROM precos_referencia');
  return r.rows.find(x => n.includes(String(x.produto).toLowerCase())) || null;
}

/* ---- configurações ---- */
function configPadrao() {
  return {
    titulo: process.env.SITE_TITULO || 'Canivete',
    descricao: process.env.SITE_DESCRICAO || 'Central de informações para quem compra e vende na internet.',
    tema: process.env.TEMA || 'claro',
    fundo_tipo: process.env.FUNDO_TIPO || 'cor',
    fundo_valor: process.env.FUNDO_VALOR || '#FAF6F0',
    contato_whatsapp: process.env.CONTATO_WHATSAPP || '',
    contato_email: process.env.CONTATO_EMAIL || '',
    nota_rodape: process.env.NOTA_RODAPE || '',
  };
}
async function getConfigCompleta() {
  const cfg = configPadrao();
  for (const k of Object.keys(cfg)) cfg[k] = await getSetting('cfg_' + k, cfg[k]);
  return cfg;
}
async function setConfigParcial(patch) {
  const cfg = configPadrao();
  for (const k of Object.keys(cfg)) {
    if (patch[k] !== undefined) await setSetting('cfg_' + k, patch[k]);
  }
}

/* ---- painel ---- */
async function dashboard() {
  const q = async (sql, params) => Number((await pool.query(sql, params)).rows[0].c);
  return {
    menus: await q('SELECT COUNT(*) c FROM menus'),
    conteudos: await q('SELECT COUNT(*) c FROM conteudos'),
    envios: await q('SELECT COUNT(*) c FROM envios'),
    produtos_pendentes: await q("SELECT COUNT(*) c FROM produtos WHERE status = 'pendente'"),
    produtos_aprovados: await q("SELECT COUNT(*) c FROM produtos WHERE status = 'aprovado'"),
    produtos_reprovados: await q("SELECT COUNT(*) c FROM produtos WHERE status = 'reprovado'"),
    precos: await q('SELECT COUNT(*) c FROM precos_referencia'),
  };
}

module.exports = {
  DATA_DIR, pool, inicializar,
  getSetting, setSetting,
  senhaDefinida, definirSenha, verificarSenha,
  criarSessao, validarSessao, destruirSessao,
  listarMenus, criarMenu, atualizarMenu, removerMenu, filhosDe, subtreeDe,
  listarConteudos, conteudoPorId, criarConteudo, atualizarConteudo, removerConteudo,
  upsertEnvio, enviosDoDispositivo, envioPorConteudo, todosEnvios,
  criarProduto, listarProdutos, produtoPorId, aprovarProduto, reprovarProduto, produtosDoDispositivo,
  listarPrecos, salvarPrecos, precoReferencia,
  configPadrao, getConfigCompleta, setConfigParcial,
  dashboard,
};
