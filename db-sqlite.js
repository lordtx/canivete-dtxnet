'use strict';
/* ============================================================
 * CANIVETE — camada de dados (SQLite via better-sqlite3)
 * ============================================================ */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'dados');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'canivete.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ---------------- SCHEMA ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  icone TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS conteudos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,               -- texto|pdf|imagem|video|lista|checklist|formulario|arquivo
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '[]', -- JSON (itens de lista/checklist, campos de formulário)
  arquivo TEXT NOT NULL DEFAULT '', -- URL do arquivo p/ pdf/imagem/video/arquivo
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conteudo_id INTEGER NOT NULL REFERENCES conteudos(id) ON DELETE CASCADE,
  dispositivo TEXT NOT NULL,
  tipo_envio TEXT NOT NULL DEFAULT 'formulario', -- formulario|checklist|anotacao
  nome TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  dados TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(conteudo_id, dispositivo, tipo_envio)
);
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- compra|venda
  preco REAL NOT NULL DEFAULT 0,
  foto TEXT NOT NULL DEFAULT '',
  dispositivo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente|aprovado|reprovado
  nota TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  avaliado_em TEXT
);
CREATE TABLE IF NOT EXISTS precos_referencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto TEXT NOT NULL UNIQUE,
  preco_min_compra REAL NOT NULL DEFAULT 0,
  preco_max_venda REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL
);
`);

/* ---------------- HELPERS ---------------- */

function getSetting(chave, padrao = '') {
  const r = db.prepare('SELECT valor FROM settings WHERE chave = ?').get(chave);
  return r ? r.valor : padrao;
}
function setSetting(chave, valor) {
  db.prepare(
    'INSERT INTO settings (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
  ).run(chave, String(valor));
}

/* ---- senha do admin ---- */
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
function senhaDefinida() {
  return !!getSetting('senha_hash', '');
}
function definirSenha(senha) {
  if (!senha || String(senha).length < 4) throw new Error('Senha deve ter pelo menos 4 caracteres');
  setSetting('senha_hash', hashSenha(String(senha)));
}

/* ---- sessões ---- */
function criarSessao() {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessoes (token, expira_em) VALUES (?, ?)').run(token, expira);
  return token;
}
function validarSessao(token) {
  if (!token) return false;
  const r = db.prepare('SELECT expira_em FROM sessoes WHERE token = ?').get(token);
  if (!r) return false;
  if (new Date(r.expira_em).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
    return false;
  }
  return true;
}
function destruirSessao(token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

/* ---- menus ---- */
function listarMenus() {
  return db.prepare('SELECT * FROM menus ORDER BY ordem, id').all();
}
function criarMenu({ parent_id, nome, icone, ordem, ativo }) {
  const info = db
    .prepare('INSERT INTO menus (parent_id, nome, icone, ordem, ativo) VALUES (?, ?, ?, ?, ?)')
    .run(parent_id || null, nome, icone || '', ordem || 0, ativo === false ? 0 : 1);
  return info.lastInsertRowid;
}
function atualizarMenu(id, { parent_id, nome, icone, ordem, ativo }) {
  db.prepare('UPDATE menus SET parent_id = ?, nome = ?, icone = ?, ordem = ?, ativo = ? WHERE id = ?').run(
    parent_id || null, nome, icone || '', ordem || 0, ativo === false ? 0 : 1, id
  );
}
function removerMenu(id) {
  db.prepare('DELETE FROM menus WHERE id = ?').run(id); // CASCADE leva filhos e conteúdos
}
function filhosDe(id) {
  return db.prepare('SELECT id FROM menus WHERE parent_id = ?').all(id).map(r => r.id);
}
function subtreeDe(id) {
  const ids = new Set([id]);
  let fila = [id];
  while (fila.length) {
    const filhos = db
      .prepare('SELECT id FROM menus WHERE parent_id IN (' + fila.map(() => '?').join(',') + ')')
      .all(...fila);
    fila = filhos.map(r => r.id);
    filhos.forEach(r => ids.add(r.id));
  }
  return [...ids];
}

/* ---- conteúdos ---- */
function listarConteudos() {
  return db.prepare('SELECT * FROM conteudos ORDER BY ordem, id').all();
}
function conteudoPorId(id) {
  return db.prepare('SELECT * FROM conteudos WHERE id = ?').get(id);
}
function criarConteudo({ menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo }) {
  const info = db
    .prepare('INSERT INTO conteudos (menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(menu_id, tipo, titulo, corpo || '', JSON.stringify(dados || []), arquivo || '', ordem || 0, ativo === false ? 0 : 1);
  return info.lastInsertRowid;
}
function atualizarConteudo(id, { menu_id, tipo, titulo, corpo, dados, arquivo, ordem, ativo }) {
  db.prepare('UPDATE conteudos SET menu_id = ?, tipo = ?, titulo = ?, corpo = ?, dados = ?, arquivo = ?, ordem = ?, ativo = ? WHERE id = ?').run(
    menu_id, tipo, titulo, corpo || '', JSON.stringify(dados || []), arquivo || '', ordem || 0, ativo === false ? 0 : 1, id
  );
}
function removerConteudo(id) {
  db.prepare('DELETE FROM conteudos WHERE id = ?').run(id);
}

/* ---- envios ---- */
function upsertEnvio({ conteudo_id, dispositivo, tipo_envio, nome, whatsapp, dados }) {
  const existente = db
    .prepare('SELECT id FROM envios WHERE conteudo_id = ? AND dispositivo = ? AND tipo_envio = ?')
    .get(conteudo_id, dispositivo, tipo_envio);
  if (existente) {
    db.prepare('UPDATE envios SET nome = ?, whatsapp = ?, dados = ?, atualizado_em = datetime(\'now\') WHERE id = ?').run(
      nome || '', whatsapp || '', JSON.stringify(dados || {}), existente.id
    );
    return existente.id;
  }
  const info = db
    .prepare('INSERT INTO envios (conteudo_id, dispositivo, tipo_envio, nome, whatsapp, dados) VALUES (?, ?, ?, ?, ?, ?)')
    .run(conteudo_id, dispositivo, tipo_envio, nome || '', whatsapp || '', JSON.stringify(dados || {}));
  return info.lastInsertRowid;
}
function enviosDoDispositivo(dispositivo) {
  return db
    .prepare(
      `SELECT e.*, c.titulo AS conteudo_titulo, c.tipo AS conteudo_tipo
       FROM envios e JOIN conteudos c ON c.id = e.conteudo_id
       WHERE e.dispositivo = ? ORDER BY e.atualizado_em DESC`
    )
    .all(dispositivo);
}
function envioPorConteudo(conteudo_id, dispositivo, tipo_envio) {
  return db
    .prepare('SELECT * FROM envios WHERE conteudo_id = ? AND dispositivo = ? AND tipo_envio = ?')
    .get(conteudo_id, dispositivo, tipo_envio);
}
function todosEnvios() {
  return db
    .prepare(
      `SELECT e.*, c.titulo AS conteudo_titulo, m.nome AS menu_nome
       FROM envios e JOIN conteudos c ON c.id = e.conteudo_id
       LEFT JOIN menus m ON m.id = c.menu_id
       ORDER BY e.atualizado_em DESC`
    )
    .all();
}

/* ---- produtos ---- */
function criarProduto({ nome, vendedor, whatsapp, tipo, preco, foto, dispositivo }) {
  const info = db
    .prepare('INSERT INTO produtos (nome, vendedor, whatsapp, tipo, preco, foto, dispositivo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nome, vendedor, whatsapp, tipo, Number(preco) || 0, foto || '', dispositivo || '');
  return info.lastInsertRowid;
}
function listarProdutos(status) {
  if (status) return db.prepare('SELECT * FROM produtos WHERE status = ? ORDER BY criado_em DESC').all(status);
  return db.prepare('SELECT * FROM produtos ORDER BY criado_em DESC').all();
}
function produtoPorId(id) {
  return db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
}
function aprovarProduto(id) {
  db.prepare("UPDATE produtos SET status = 'aprovado', avaliado_em = datetime('now'), nota = '' WHERE id = ?").run(id);
}
function reprovarProduto(id, nota) {
  db.prepare("UPDATE produtos SET status = 'reprovado', nota = ?, avaliado_em = datetime('now') WHERE id = ?").run(nota || '', id);
}
function produtosDoDispositivo(dispositivo) {
  return db.prepare('SELECT * FROM produtos WHERE dispositivo = ? ORDER BY criado_em DESC').all(dispositivo);
}

/* ---- preços de referência ---- */
function listarPrecos() {
  return db.prepare('SELECT * FROM precos_referencia ORDER BY produto').all();
}
function salvarPrecos(itens) {
  db.transaction(() => {
    db.prepare('DELETE FROM precos_referencia').run();
    const ins = db.prepare('INSERT INTO precos_referencia (produto, preco_min_compra, preco_max_venda) VALUES (?, ?, ?)');
    for (const it of itens) {
      if (it && it.produto) ins.run(String(it.produto).trim(), Number(it.preco_min_compra) || 0, Number(it.preco_max_venda) || 0);
    }
  })();
}
function precoReferencia(nomeProduto) {
  if (!nomeProduto) return null;
  const n = String(nomeProduto).toLowerCase();
  const refs = db.prepare('SELECT produto, preco_min_compra, preco_max_venda FROM precos_referencia').all();
  return refs.find(r => n.includes(String(r.produto).toLowerCase())) || null;
}

/* ---- configurações padrão ---- */
function configPadrao() {
  return {
    titulo: process.env.SITE_TITULO || 'Canivete',
    descricao: process.env.SITE_DESCRICAO || 'Central de informações para quem compra e vende na internet.',
    tema: process.env.TEMA || 'claro', // claro|escuro
    fundo_tipo: process.env.FUNDO_TIPO || 'cor', // cor|imagem|video
    fundo_valor: process.env.FUNDO_VALOR || '#FAF6F0',
    contato_whatsapp: process.env.CONTATO_WHATSAPP || '',
    contato_email: process.env.CONTATO_EMAIL || '',
    nota_rodape: process.env.NOTA_RODAPE || '',
  };
}
function getConfigCompleta() {
  const cfg = configPadrao();
  for (const k of Object.keys(cfg)) cfg[k] = getSetting('cfg_' + k, cfg[k]);
  return cfg;
}
function setConfigParcial(patch) {
  const cfg = configPadrao();
  for (const k of Object.keys(cfg)) {
    if (patch[k] !== undefined) setSetting('cfg_' + k, patch[k]);
  }
}

/* ---- painel (contagens) ---- */
function dashboard() {
  return {
    menus: db.prepare('SELECT COUNT(*) c FROM menus').get().c,
    conteudos: db.prepare('SELECT COUNT(*) c FROM conteudos').get().c,
    envios: db.prepare('SELECT COUNT(*) c FROM envios').get().c,
    produtos_pendentes: db.prepare("SELECT COUNT(*) c FROM produtos WHERE status = 'pendente'").get().c,
    produtos_aprovados: db.prepare("SELECT COUNT(*) c FROM produtos WHERE status = 'aprovado'").get().c,
    produtos_reprovados: db.prepare("SELECT COUNT(*) c FROM produtos WHERE status = 'reprovado'").get().c,
    precos: db.prepare('SELECT COUNT(*) c FROM precos_referencia').get().c,
  };
}

module.exports = {
  db, DATA_DIR, UPLOAD_DIR,
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
