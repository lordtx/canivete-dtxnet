'use strict';
/* ============================================================
 * CANIVETE — painel administrativo
 * ============================================================ */

const TIPOS_CONTEUDO = [
  ['texto', 'Texto'], ['pdf', 'PDF'], ['imagem', 'Imagem'], ['video', 'Vídeo'],
  ['lista', 'Lista'], ['checklist', 'Checklist'], ['formulario', 'Formulário'], ['arquivo', 'Arquivo'],
];
const TIPOS_CAMPO = [
  ['texto', 'Texto curto'], ['texto_longo', 'Texto longo'], ['numero', 'Número'],
  ['selecao', 'Seleção'], ['check', 'Marcar (checkbox)'], ['whatsapp', 'WhatsApp'], ['data', 'Data'],
];

let secaoAtual = 'painel';
let arvoreAdm = [];
let conteudosAdm = [];
let produtosAdm = [];
let enviosAdm = [];
let precosAdm = [];
let configAdm = null;

/* ---------------- auth ---------------- */
async function initAdmin() {
  document.getElementById('formLogin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const senha = document.getElementById('loginSenha').value;
    try {
      await api('/api/admin/login', { method: 'POST', json: { senha } });
      entrar();
    } catch (e) {
      document.getElementById('loginErro').textContent = e.message;
    }
  });
  document.querySelectorAll('.admin-nav button[data-secao]').forEach(b => {
    b.addEventListener('click', () => {
      if (b.dataset.secao === 'sair') return sair();
      navegar(b.dataset.secao);
    });
  });
  try {
    await api('/api/admin/me');
    entrar();
  } catch (e) {
    document.getElementById('telaLogin').classList.remove('oculto');
  }
}

function entrar() {
  document.getElementById('telaLogin').classList.add('oculto');
  document.getElementById('telaAdmin').classList.remove('oculto');
  navegar('painel');
  atualizarBadge();
}

async function sair() {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch (e) {}
  location.reload();
}

async function atualizarBadge() {
  try {
    const d = await api('/api/admin/dashboard');
    const b = document.getElementById('badgePendentes');
    b.textContent = d.produtos_pendentes ? `(${d.produtos_pendentes})` : '';
  } catch (e) {}
}

/* ---------------- navegação ---------------- */
function navegar(secao) {
  secaoAtual = secao;
  document.querySelectorAll('.admin-nav button').forEach(b => {
    b.classList.toggle('ativo', b.dataset.secao === secao);
  });
  const main = document.getElementById('adminMain');
  main.innerHTML = '<div class="vazio">Carregando...</div>';
  if (secao === 'painel') renderPainel();
  else if (secao === 'menus') renderMenus();
  else if (secao === 'conteudos') renderConteudos();
  else if (secao === 'produtos') renderProdutos();
  else if (secao === 'precos') renderPrecos();
  else if (secao === 'envios') renderEnvios();
  else if (secao === 'config') renderConfig();
}

/* ---------------- painel ---------------- */
async function renderPainel() {
  const main = document.getElementById('adminMain');
  try {
    const d = await api('/api/admin/dashboard');
    main.innerHTML = `
      <h2>📊 Painel</h2>
      <p class="sub">Visão geral da plataforma.</p>
      <div class="cartoes-stats">
        <div class="stat"><div class="num">${d.menus}</div><div class="rotulo">Menus</div></div>
        <div class="stat"><div class="num">${d.conteudos}</div><div class="rotulo">Conteúdos</div></div>
        <div class="stat"><div class="num">${d.envios}</div><div class="rotulo">Preenchimentos</div></div>
        <div class="stat"><div class="num" style="color:var(--amber)">${d.produtos_pendentes}</div><div class="rotulo">Produtos pendentes</div></div>
        <div class="stat"><div class="num" style="color:var(--green)">${d.produtos_aprovados}</div><div class="rotulo">Aprovados</div></div>
        <div class="stat"><div class="num" style="color:var(--danger)">${d.produtos_reprovados}</div><div class="rotulo">Reprovados</div></div>
        <div class="stat"><div class="num">${d.precos}</div><div class="rotulo">Referências de preço</div></div>
      </div>
      <div class="cartao">
        <h3>Ações rápidas</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
          <button class="btn btn-primario" onclick="navegar('menus')">🗂️ Gerenciar menus</button>
          <button class="btn" onclick="navegar('conteudos')">📄 Adicionar conteúdo</button>
          <button class="btn" onclick="navegar('produtos')">🏆 Avaliar produtos ${d.produtos_pendentes ? '(' + d.produtos_pendentes + ' pendentes)' : ''}</button>
          <button class="btn" onclick="navegar('precos')">📈 Tabela de preços</button>
        </div>
      </div>`;
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

/* ---------------- menus ---------------- */
async function carregarMenus() {
  arvoreAdm = await api('/api/admin/menus');
}

function achatarMenus(nos, nivel = 0, out = []) {
  for (const no of nos) {
    out.push({ ...no, nivel });
    achatarMenus(no.children || [], nivel + 1, out);
  }
  return out;
}

async function renderMenus() {
  const main = document.getElementById('adminMain');
  try {
    await carregarMenus();
    const flat = achatarMenus(arvoreAdm);
    main.innerHTML = `
      <h2>🗂️ Menus</h2>
      <p class="sub">Menus e submenus (quantos níveis precisar). Conteúdos são adicionados ao menu selecionado.</p>
      <button class="btn btn-primario" onclick="abrirMenuEditor()">➕ Novo menu</button>
      <div style="margin-top:16px">
        ${flat.length ? `<ul class="arvore arvore-admin">${flat.map(m => `
          <li style="margin-left:${m.nivel * 18}px">
            <div class="no-menu ${m.ativo ? '' : 'inativo'}">
              <span>${m.icone ? escHtml(m.icone) : '📁'}</span>
              <strong>${escHtml(m.nome)}</strong>
              <span style="color:var(--ink-soft); font-size:12px">${m.conteudos.length} conteúdo(s)</span>
              <span class="acoes">
                <button class="btn btn-fantasma btn-pequeno" onclick="abrirMenuEditor(${m.id})">✏️</button>
                <button class="btn btn-fantasma btn-pequeno" onclick="abrirConteudoEditor(null, ${m.id})">➕ Conteúdo</button>
                <button class="btn btn-perigo btn-pequeno" onclick="removerMenu(${m.id}, '${escHtml(m.nome)}')">🗑️</button>
              </span>
            </div>
          </li>`).join('')}</ul>`
        : '<div class="vazio"><p>Nenhum menu criado. Comece criando o primeiro!</p></div>'}
      </div>`;
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function abrirMenuEditor(idMenu) {
  const menu = idMenu ? achatarMenus(arvoreAdm).find(m => m.id === idMenu) : null;
  const flat = achatarMenus(arvoreAdm);
  // exclui o próprio menu e descendentes da lista de pais possíveis
  const excluidos = idMenu ? new Set(descendentes(arvoreAdm, idMenu).map(m => m.id)) : new Set();
  const opcoes = flat.filter(m => m.id !== idMenu && !excluidos.has(m.id));

  const corpo = abrirModal(`
    <h3>${menu ? '✏️ Editar menu' : '➕ Novo menu'}</h3>
    <form id="formMenu">
      <div class="campo"><label>Nome <span class="obrig">*</span></label><input type="text" id="mNome" required value="${menu ? escHtml(menu.nome) : ''}"></div>
      <div class="campo"><label>Ícone (emoji, opcional)</label><input type="text" id="mIcone" value="${menu ? escHtml(menu.icone) : ''}" placeholder="📁"></div>
      <div class="campo"><label>Menu pai (opcional — submenu)</label>
        <select id="mPai"><option value="">— Nenhum (nível principal) —</option>
          ${opcoes.map(o => `<option value="${o.id}" ${menu && menu.parent_id === o.id ? 'selected' : ''}>${'—'.repeat(o.nivel)} ${escHtml(o.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="campo"><label>Ordem</label><input type="number" id="mOrdem" value="${menu ? menu.ordem : 0}"></div>
      <div class="campo"><label><input type="checkbox" id="mAtivo" ${!menu || menu.ativo ? 'checked' : ''}> Ativo (visível para usuários)</label></div>
      <button type="submit" class="btn btn-verde btn-bloco">💾 Salvar</button>
    </form>
  `);
  document.getElementById('formMenu').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = {
      nome: document.getElementById('mNome').value,
      icone: document.getElementById('mIcone').value,
      parent_id: document.getElementById('mPai').value ? Number(document.getElementById('mPai').value) : null,
      ordem: Number(document.getElementById('mOrdem').value) || 0,
      ativo: document.getElementById('mAtivo').checked,
    };
    try {
      if (menu) await api('/api/admin/menus/' + menu.id, { method: 'PUT', json: dados });
      else await api('/api/admin/menus', { method: 'POST', json: dados });
      fecharModal();
      toast('Menu salvo! ✅', 'ok');
      renderMenus();
    } catch (e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

function descendentes(nos, id, out = []) {
  for (const no of nos) {
    if (no.id === id) { descendentes(no.children || [], null, out); }
    else if (id === null) { out.push(no); descendentes(no.children || [], null, out); }
    else descendentes(no.children || [], id, out);
  }
  return out;
}

async function removerMenu(id, nome) {
  if (!confirm('Excluir o menu "' + nome + '" e TODO o seu conteúdo (submenus e conteúdos)?')) return;
  try {
    await api('/api/admin/menus/' + id, { method: 'DELETE' });
    toast('Menu excluído.', 'ok');
    renderMenus();
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ---------------- conteúdos ---------------- */
async function renderConteudos() {
  const main = document.getElementById('adminMain');
  try {
    const [arvore, conteudos] = await Promise.all([api('/api/admin/menus'), api('/api/admin/conteudos')]);
    arvoreAdm = arvore;
    conteudosAdm = conteudos;
    const flat = achatarMenus(arvoreAdm);
    const menusMap = new Map(flat.map(m => [m.id, m]));
    const grupos = new Map();
    for (const c of conteudos) {
      if (!grupos.has(c.menu_id)) grupos.set(c.menu_id, []);
      grupos.get(c.menu_id).push(c);
    }
    const blocos = [...grupos.entries()].map(([menuId, lista]) => {
      const m = menusMap.get(menuId);
      if (!m) return '';
      const linhas = lista.map(c => `
        <div class="linha-material">
          <div class="principal">
            <div class="titulo">${escHtml(iconTipo(c.tipo))} ${escHtml(c.titulo)}</div>
            <div class="meta">${nomeTipoAdm(c.tipo)} · ordem ${c.ordem}${c.ativo ? '' : ' · INATIVO'}</div>
          </div>
          <button class="btn btn-fantasma btn-pequeno" onclick="abrirConteudoEditor(${c.id})">✏️ Editar</button>
          <button class="btn btn-perigo btn-pequeno" onclick="removerConteudo(${c.id}, '${escHtml(c.titulo)}')">🗑️</button>
        </div>`).join('');
      return `<div class="cartao"><h3>${m.icone ? escHtml(m.icone) + ' ' : ''}${escHtml(m.nome)}</h3>
        <button class="btn btn-fantasma btn-pequeno" style="margin-bottom:10px" onclick="abrirConteudoEditor(null, ${menuId})">➕ Conteúdo</button>
        ${lista.length ? linhas : '<p class="desc">Sem conteúdos neste menu.</p>'}</div>`;
    }).join('');
    main.innerHTML = `
      <h2>📄 Conteúdos</h2>
      <p class="sub">Adicione textos, PDFs, imagens, vídeos, listas, checklists, formulários e arquivos.</p>
      ${blocos || '<div class="vazio"><p>Crie um menu primeiro.</p></div>'}`;
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function iconTipo(t) { return { texto: '📄', pdf: '📕', imagem: '🖼️', video: '🎬', lista: '📋', checklist: '☑️', formulario: '📝', arquivo: '📦' }[t] || '📄'; }
function nomeTipoAdm(t) { return { texto: 'Texto', pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo', lista: 'Lista', checklist: 'Checklist', formulario: 'Formulário', arquivo: 'Arquivo' }[t] || t; }

/* editor de conteúdo */
const editor = { id: null, menu_id: null, tipo: 'texto', titulo: '', corpo: '', dados: [], arquivo: '', ordem: 0, ativo: true };

function abrirConteudoEditor(idConteudo, menuSugerido) {
  const c = idConteudo ? conteudosAdm.find(x => x.id === idConteudo) : null;
  editor.id = c ? c.id : null;
  editor.menu_id = c ? c.menu_id : (menuSugerido || null);
  editor.tipo = c ? c.tipo : 'texto';
  editor.titulo = c ? c.titulo : '';
  editor.corpo = c ? c.corpo : '';
  editor.dados = c ? (Array.isArray(c.dados) ? c.dados : []) : [];
  editor.arquivo = c ? c.arquivo : '';
  editor.ordem = c ? c.ordem : 0;
  editor.ativo = c ? !!c.ativo : true;
  renderEditorConteudo();
}

function renderEditorConteudo() {
  const flat = achatarMenus(arvoreAdm);
  const corpo = abrirModal(`
    <h3>${editor.id ? '✏️ Editar conteúdo' : '➕ Novo conteúdo'}</h3>
    <form id="formConteudo">
      <div class="campo"><label>Menu <span class="obrig">*</span></label>
        <select id="cMenu">${flat.map(m => `<option value="${m.id}" ${editor.menu_id === m.id ? 'selected' : ''}>${'—'.repeat(m.nivel)} ${escHtml(m.nome)}</option>`).join('')}</select>
      </div>
      <div class="campo"><label>Tipo <span class="obrig">*</span></label>
        <select id="cTipo" onchange="trocarTipoEditor()">${TIPOS_CONTEUDO.map(t => `<option value="${t[0]}" ${editor.tipo === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select>
      </div>
      <div class="campo"><label>Título <span class="obrig">*</span></label><input type="text" id="cTitulo" required value="${escHtml(editor.titulo)}"></div>
      <div id="editorEspecifico"></div>
      <div class="campo"><label>Ordem</label><input type="number" id="cOrdem" value="${editor.ordem}"></div>
      <div class="campo"><label><input type="checkbox" id="cAtivo" ${editor.ativo ? 'checked' : ''}> Ativo (visível para usuários)</label></div>
      <button type="submit" class="btn btn-verde btn-bloco">💾 Salvar</button>
    </form>
  `, true);
  renderEditorEspecifico();
  document.getElementById('formConteudo').addEventListener('submit', salvarConteudo);
}

function trocarTipoEditor() {
  editor.tipo = document.getElementById('cTipo').value;
  renderEditorEspecifico();
}

function renderEditorEspecifico() {
  const box = document.getElementById('editorEspecifico');
  if (!box) return;
  const t = editor.tipo;
  let html = '';
  if (t === 'texto') {
    html = `<div class="campo"><label>Texto (HTML simples permitido: <b>, <i>, <ul>, <a>...)</label>
      <textarea id="cCorpo" style="min-height:180px">${escHtml(editor.corpo)}</textarea></div>
      <div class="campo"><label>Pré-visualização</label><div id="prevTexto" class="cartao texto-corpo" style="padding:14px"></div></div>`;
  } else if (['pdf', 'imagem', 'video', 'arquivo'].includes(t)) {
    const preview = editor.arquivo
      ? (t === 'imagem' ? `<img src="${escHtml(editor.arquivo)}" style="max-height:200px; border-radius:10px">`
        : t === 'video' ? `<video controls src="${escHtml(editor.arquivo)}" style="max-height:200px"></video>`
        : `<a href="${escHtml(editor.arquivo)}" target="_blank">Ver arquivo atual</a>`) : '';
    html = `<div class="campo"><label>Arquivo ${t === 'pdf' ? '(PDF)' : t === 'imagem' ? '(imagem)' : t === 'video' ? '(vídeo ou URL do YouTube/Vimeo)' : '(qualquer arquivo)'}</label>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <input type="file" id="cArquivoInput" ${t === 'pdf' || t === 'arquivo' ? 'accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"' : t === 'imagem' ? 'accept="image/*"' : t === 'video' ? 'accept="video/*"' : ''} onchange="uploadArquivoEditor(this)">
        <span class="dica">ou cole uma URL:</span>
        <input type="text" id="cArquivoUrl" value="${escHtml(editor.arquivo)}" style="flex:1; min-width:220px" placeholder="/arquivos/... ou https://...">
        <button type="button" class="btn btn-fantasma btn-pequeno" onclick="usarUrlEditor()">Usar URL</button>
      </div>
      <div id="prevArquivo" style="margin-top:10px">${preview}</div></div>
      <div class="campo"><label>Descrição</label><textarea id="cCorpo" style="min-height:70px">${escHtml(editor.corpo)}</textarea></div>`;
  } else if (t === 'lista' || t === 'checklist') {
    const label = t === 'lista' ? 'Itens da lista' : 'Itens do checklist (pré-definidos — usuário marca o progresso)';
    html = `<div class="campo"><label>${label}</label><div id="cItens"></div>
      <button type="button" class="btn btn-fantasma btn-pequeno" onclick="addItemLista()">➕ Adicionar item</button></div>
      ${t === 'lista' ? '' : '<div class="campo"><label>Descrição</label><textarea id="cCorpo" style="min-height:60px">' + escHtml(editor.corpo) + '</textarea></div>'}`;
  } else if (t === 'formulario') {
    html = `<div class="campo"><label>Descrição (opcional)</label><textarea id="cCorpo" style="min-height:60px">${escHtml(editor.corpo)}</textarea></div>
      <div class="campo"><label>Campos do formulário</label><div id="cCampos"></div>
      <button type="button" class="btn btn-fantasma btn-pequeno" onclick="addCampoForm()">➕ Adicionar campo</button></div>`;
  }
  box.innerHTML = html;
  if (t === 'texto') {
    const ta = document.getElementById('cCorpo');
    ta.addEventListener('input', () => { document.getElementById('prevTexto').innerHTML = ta.value; });
    document.getElementById('prevTexto').innerHTML = ta.value;
  }
  if (t === 'lista' || t === 'checklist') renderItensLista();
  if (t === 'formulario') renderCamposForm();
}

async function uploadArquivoEditor(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('arquivo', f);
  try {
    toast('Enviando arquivo...');
    const r = await api('/api/admin/upload', { method: 'POST', body: fd });
    editor.arquivo = r.url;
    const inp = document.getElementById('cArquivoUrl');
    if (inp) inp.value = r.url;
    toast('Arquivo enviado! ✅', 'ok');
  } catch (e) { toast('Erro no upload: ' + e.message, 'erro'); }
}
function usarUrlEditor() {
  editor.arquivo = document.getElementById('cArquivoUrl').value.trim();
  renderEditorEspecifico();
}

/* itens de lista/checklist */
function renderItensLista() {
  const box = document.getElementById('cItens');
  if (!box) return;
  box.innerHTML = editor.dados.map((it, i) => `
    <div class="editor-linha">
      <input type="text" value="${escHtml(typeof it === 'string' ? it : (it.texto || ''))}" placeholder="Item ${i + 1}" onchange="editarItemLista(${i}, this.value)">
      <button type="button" class="btn btn-perigo btn-pequeno" onclick="removerItemLista(${i})">✕</button>
    </div>`).join('') || '<p class="desc">Nenhum item ainda.</p>';
}
function addItemLista() {
  editor.dados.push({ texto: '' });
  renderItensLista();
}
function editarItemLista(i, v) { editor.dados[i] = { texto: v }; }
function removerItemLista(i) { editor.dados.splice(i, 1); renderItensLista(); }

/* campos de formulário */
function renderCamposForm() {
  const box = document.getElementById('cCampos');
  if (!box) return;
  box.innerHTML = editor.dados.map((f, i) => `
    <div class="linha-campo-form" data-campo-linha="${i}">
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px">
        <select onchange="editarCampoForm(${i},'tipo',this.value)" style="flex:1; min-width:140px">
          ${TIPOS_CAMPO.map(tc => `<option value="${tc[0]}" ${f.tipo === tc[0] ? 'selected' : ''}>${tc[1]}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-perigo btn-pequeno" onclick="removerCampoForm(${i})">✕</button>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <input type="text" placeholder="Rótulo (ex: Nome)" value="${escHtml(f.rotulo || '')}" onchange="editarCampoForm(${i},'rotulo',this.value)" style="flex:2; min-width:160px">
        <input type="text" placeholder="Placeholder/dica" value="${escHtml(f.placeholder || '')}" onchange="editarCampoForm(${i},'placeholder',this.value)" style="flex:2; min-width:160px">
        <label style="display:flex; align-items:center; gap:5px; font-size:13px"><input type="checkbox" ${f.obrigatorio ? 'checked' : ''} onchange="editarCampoForm(${i},'obrigatorio',this.checked)"> Obrigatório</label>
      </div>
      ${f.tipo === 'selecao' ? `<div style="margin-top:6px"><input type="text" placeholder="Opções separadas por vírgula (ex: Sim, Não, Talvez)" value="${escHtml((f.opcoes || []).join(', '))}" onchange="editarCampoForm(${i},'opcoes',this.value)" style="width:100%"></div>` : ''}
    </div>`).join('') || '<p class="desc">Nenhum campo ainda.</p>';
}
function addCampoForm() {
  editor.dados.push({ tipo: 'texto', rotulo: '', placeholder: '', obrigatorio: false, opcoes: [] });
  renderCamposForm();
}
function editarCampoForm(i, chave, valor) {
  const f = editor.dados[i];
  if (chave === 'opcoes') f.opcoes = valor.split(',').map(s => s.trim()).filter(Boolean);
  else if (chave === 'obrigatorio') f.obrigatorio = valor;
  else if (chave === 'tipo') { f.tipo = valor; renderCamposForm(); }
  else f[chave] = valor;
}
function removerCampoForm(i) { editor.dados.splice(i, 1); renderCamposForm(); }

async function salvarConteudo(ev) {
  ev.preventDefault();
  editor.menu_id = Number(document.getElementById('cMenu').value);
  editor.titulo = document.getElementById('cTitulo').value;
  editor.ordem = Number(document.getElementById('cOrdem').value) || 0;
  editor.ativo = document.getElementById('cAtivo').checked;
  if (['texto', 'pdf', 'imagem', 'video', 'arquivo', 'formulario'].includes(editor.tipo)) {
    const ta = document.getElementById('cCorpo');
    if (ta) editor.corpo = ta.value;
  }
  if (['lista', 'checklist'].includes(editor.tipo)) {
    editor.dados = editor.dados.filter(it => (typeof it === 'string' ? it : it.texto || '').trim() !== '');
  }
  if (editor.tipo === 'formulario') {
    editor.dados = editor.dados.filter(f => f.rotulo && f.rotulo.trim());
  }
  if (['pdf', 'imagem', 'video', 'arquivo'].includes(editor.tipo)) {
    const inpUrl = document.getElementById('cArquivoUrl');
    if (inpUrl) editor.arquivo = inpUrl.value.trim();
  }
  const payload = {
    menu_id: editor.menu_id, tipo: editor.tipo, titulo: editor.titulo,
    corpo: editor.corpo, dados: editor.dados, arquivo: editor.arquivo,
    ordem: editor.ordem, ativo: editor.ativo,
  };
  try {
    if (editor.id) await api('/api/admin/conteudos/' + editor.id, { method: 'PUT', json: payload });
    else await api('/api/admin/conteudos', { method: 'POST', json: payload });
    fecharModal();
    toast('Conteúdo salvo! ✅', 'ok');
    renderConteudos();
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

async function removerConteudo(id, titulo) {
  if (!confirm('Excluir o conteúdo "' + titulo + '"?')) return;
  try {
    await api('/api/admin/conteudos/' + id, { method: 'DELETE' });
    toast('Conteúdo excluído.', 'ok');
    renderConteudos();
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ---------------- produtos (aprovação) ---------------- */
let filtroProdutoAdm = 'pendente';

async function renderProdutos() {
  const main = document.getElementById('adminMain');
  try {
    produtosAdm = await api('/api/admin/produtos');
    const grupos = { pendente: [], aprovado: [], reprovado: [] };
    produtosAdm.forEach(p => { if (grupos[p.status]) grupos[p.status].push(p); });
    const lista = grupos[filtroProdutoAdm] || [];
    main.innerHTML = `
      <h2>🏆 Produtos</h2>
      <p class="sub">Aprove ou reprove os produtos enviados pelos usuários.</p>
      <div class="tabs">
        <button class="tab ${filtroProdutoAdm === 'pendente' ? 'ativo' : ''}" onclick="filtrarProdutosAdm('pendente')">⏳ Pendentes (${grupos.pendente.length})</button>
        <button class="tab ${filtroProdutoAdm === 'aprovado' ? 'ativo' : ''}" onclick="filtrarProdutosAdm('aprovado')">✅ Aprovados (${grupos.aprovado.length})</button>
        <button class="tab ${filtroProdutoAdm === 'reprovado' ? 'ativo' : ''}" onclick="filtrarProdutosAdm('reprovado')">❌ Reprovados (${grupos.reprovado.length})</button>
      </div>
      ${lista.length ? `<div class="grade-produtos">${lista.map(p => `
        <div class="cartao-produto">
          <img class="foto" src="${escHtml(p.foto)}" alt="${escHtml(p.nome)}">
          <div class="info">
            <span class="etiqueta ${p.tipo}">${p.tipo === 'compra' ? '🛒 Compra' : '💰 Venda'}</span>
            <div class="nome">${escHtml(p.nome)}</div>
            <div class="vendedor">👤 ${escHtml(p.vendedor)} · ${escHtml(p.whatsapp)}</div>
            <div class="preco">${fmtMoeda(p.preco)}</div>
            <div class="meta" style="font-size:12px; color:var(--ink-soft)">Enviado em ${dataBonita(p.criado_em)}</div>
            ${p.nota ? '<div class="meta" style="font-size:12px; color:var(--danger)">Motivo: ' + escHtml(p.nota) + '</div>' : ''}
            ${p.status === 'pendente' ? `<div style="display:flex; gap:8px; margin-top:10px">
              <button class="btn btn-verde btn-pequeno" style="flex:1" onclick="aprovarProduto(${p.id})">✅ Aprovar</button>
              <button class="btn btn-perigo btn-pequeno" style="flex:1" onclick="reprovarProduto(${p.id})">❌ Reprovar</button>
            </div>` : (p.status === 'aprovado' ? `<button class="btn btn-perigo btn-pequeno" style="margin-top:10px" onclick="reprovarProduto(${p.id})">↩️ Reprovar</button>` : `<button class="btn btn-verde btn-pequeno" style="margin-top:10px" onclick="aprovarProduto(${p.id})">↩️ Aprovar</button>`)}
          </div>
        </div>`).join('')}</div>`
      : '<div class="vazio"><p>Nenhum produto nesta lista.</p></div>'}`;
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function filtrarProdutosAdm(f) {
  filtroProdutoAdm = f;
  renderProdutos();
}

async function aprovarProduto(id) {
  try {
    await api('/api/admin/produtos/' + id + '/aprovar', { method: 'POST' });
    toast('Produto aprovado! ✅', 'ok');
    renderProdutos();
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

function reprovarProduto(id) {
  const nota = prompt('Motivo da reprovação (opcional — aparece para o usuário):');
  if (nota === null) return;
  api('/api/admin/produtos/' + id + '/reprovar', { method: 'POST', json: { nota } })
    .then(() => { toast('Produto reprovado.', 'ok'); renderProdutos(); })
    .catch(e => toast('Erro: ' + e.message, 'erro'));
}

/* ---------------- tabela de preços ---------------- */
async function renderPrecos() {
  const main = document.getElementById('adminMain');
  try {
    precosAdm = await api('/api/admin/precos');
    main.innerHTML = `
      <h2>📈 Tabela de Preços de Referência</h2>
      <p class="sub">Valor mínimo de compra e valor máximo de venda por produto. O usuário vê essas referências no ranking quando o produto enviado bate com o nome.</p>
      <div class="cartao">
        <div id="tabelaPrecos"></div>
        <button class="btn btn-fantasma" onclick="addLinhaPreco()">➕ Adicionar produto</button>
        <button class="btn btn-verde" onclick="salvarPrecos()" style="margin-left:8px">💾 Salvar tudo</button>
      </div>`;
    renderTabelaPrecos();
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function renderTabelaPrecos() {
  const box = document.getElementById('tabelaPrecos');
  if (!box) return;
  box.innerHTML = precosAdm.map((p, i) => `
    <div class="editor-linha">
      <input type="text" placeholder="Produto (ex: iPhone 13)" value="${escHtml(p.produto)}" onchange="editarPreco(${i},'produto',this.value)" style="flex:2">
      <input type="number" step="0.01" min="0" placeholder="Compra mín. (R$)" value="${p.preco_min_compra}" onchange="editarPreco(${i},'preco_min_compra',this.value)" style="flex:1">
      <input type="number" step="0.01" min="0" placeholder="Venda máx. (R$)" value="${p.preco_max_venda}" onchange="editarPreco(${i},'preco_max_venda',this.value)" style="flex:1">
      <button class="btn btn-perigo btn-pequeno" onclick="removerLinhaPreco(${i})">✕</button>
    </div>`).join('') || '<p class="desc">Nenhuma referência cadastrada.</p>';
}
function addLinhaPreco() { precosAdm.push({ produto: '', preco_min_compra: 0, preco_max_venda: 0 }); renderTabelaPrecos(); }
function editarPreco(i, chave, valor) {
  if (chave === 'produto') precosAdm[i].produto = valor;
  else precosAdm[i][chave] = Number(valor) || 0;
}
function removerLinhaPreco(i) { precosAdm.splice(i, 1); renderTabelaPrecos(); }
async function salvarPrecos() {
  const itens = precosAdm.filter(p => p.produto && p.produto.trim());
  try {
    await api('/api/admin/precos', { method: 'PUT', json: itens });
    toast('Tabela de preços salva! ✅', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

/* ---------------- envios ---------------- */
async function renderEnvios() {
  const main = document.getElementById('adminMain');
  try {
    enviosAdm = await api('/api/admin/envios');
    main.innerHTML = `
      <h2>📋 Envios</h2>
      <p class="sub">Preenchimentos, checklists e anotações dos usuários.</p>
      <div class="cartao">
        ${enviosAdm.length ? `<table class="tabela">
          <thead><tr><th>Conteúdo</th><th>Menu</th><th>Tipo</th><th>Nome</th><th>WhatsApp</th><th>Data</th><th></th></tr></thead>
          <tbody>${enviosAdm.map(e => `
            <tr>
              <td>${escHtml(e.conteudo_titulo)}</td>
              <td>${escHtml(e.menu_nome || '')}</td>
              <td>${nomeEnvioAdm(e.tipo_envio)}</td>
              <td>${escHtml(e.nome || '—')}</td>
              <td>${escHtml(e.whatsapp || '—')}</td>
              <td style="white-space:nowrap">${dataBonita(e.atualizado_em)}</td>
              <td><button class="btn btn-fantasma btn-pequeno" onclick="verEnvio(${e.id})">👁️ Ver</button></td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="vazio"><p>Nenhum envio ainda.</p></div>'}
      </div>`;
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function nomeEnvioAdm(t) {
  return t === 'formulario' ? '📝 Formulário' : t === 'checklist' ? '☑️ Checklist' : '📝 Anotação';
}

function verEnvio(id) {
  const e = enviosAdm.find(x => x.id === id);
  if (!e) return;
  let conteudoHTML = '';
  if (e.tipo_envio === 'checklist') {
    const marcados = (e.dados.marcados || []).join(', ');
    conteudoHTML = `<p>Itens marcados: ${escHtml(marcados || 'nenhum')}</p>`;
  } else if (e.tipo_envio === 'anotacao') {
    conteudoHTML = `<p>${escHtml(e.dados.nota || '')}</p>`;
  } else {
    conteudoHTML = Object.entries(e.dados || {}).map(([k, v]) =>
      `<div class="linha-material"><div class="principal"><div class="titulo">${escHtml(k)}</div><div class="meta">${escHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</div></div></div>`
    ).join('') || '<p class="desc">Respostas vazias.</p>';
  }
  abrirModal(`
    <h3>${escHtml(e.conteudo_titulo)}</h3>
    <p class="desc">${nomeEnvioAdm(e.tipo_envio)} · ${dataBonita(e.atualizado_em)}</p>
    <div class="cartao" style="margin:0">${conteudoHTML}</div>
  `);
}

/* ---------------- configurações ---------------- */
async function renderConfig() {
  const main = document.getElementById('adminMain');
  try {
    const r = await api('/api/admin/config');
    configAdm = r.config;
    main.innerHTML = `
      <h2>⚙️ Configurações</h2>
      <p class="sub">Aparência e informações gerais do site. O caminho do painel e o token de notificação são definidos nas variáveis de ambiente do Coolify.</p>
      <div class="cartao">
        <h3>Site</h3>
        <div class="campo"><label>Título do site</label><input type="text" id="cfgTitulo" value="${escHtml(configAdm.titulo)}"></div>
        <div class="campo"><label>Descrição</label><textarea id="cfgDescricao">${escHtml(configAdm.descricao)}</textarea></div>
        <div class="campo"><label>Tema</label>
          <select id="cfgTema">
            <option value="claro" ${configAdm.tema === 'claro' ? 'selected' : ''}>Claro</option>
            <option value="escuro" ${configAdm.tema === 'escuro' ? 'selected' : ''}>Escuro</option>
            <option value="contraste" ${configAdm.tema === 'contraste' ? 'selected' : ''}>Alto contraste</option>
          </select>
        </div>
      </div>
      <div class="cartao">
        <h3>Plano de fundo</h3>
        <div class="campo"><label>Tipo</label>
          <select id="cfgFundoTipo" onchange="trocarFundoTipo()">
            <option value="cor" ${configAdm.fundo_tipo === 'cor' ? 'selected' : ''}>Cor</option>
            <option value="imagem" ${configAdm.fundo_tipo === 'imagem' ? 'selected' : ''}>Imagem</option>
            <option value="video" ${configAdm.fundo_tipo === 'video' ? 'selected' : ''}>Vídeo</option>
          </select>
        </div>
        <div id="cfgFundoEditor">
          ${configAdm.fundo_tipo === 'cor'
            ? '<div class="campo"><label>Cor (hex)</label><input type="color" id="cfgFundoValor" value="' + escHtml(configAdm.fundo_valor) + '" style="width:80px; height:44px"> <input type="text" id="cfgFundoValorTexto" value="' + escHtml(configAdm.fundo_valor) + '" style="width:120px"></div>'
            : `<div class="campo"><label>${configAdm.fundo_tipo === 'imagem' ? 'Imagem de fundo' : 'Vídeo de fundo (arquivo ou URL)'}</label>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
                  <input type="file" id="cfgFundoArquivo" ${configAdm.fundo_tipo === 'imagem' ? 'accept="image/*"' : 'accept="video/*"'} onchange="uploadFundo(this)">
                  <span class="dica">ou URL:</span>
                  <input type="text" id="cfgFundoValor" value="${escHtml(configAdm.fundo_valor)}" style="flex:1; min-width:220px" placeholder="/arquivos/... ou https://...">
                </div></div>`}
        </div>
      </div>
      <div class="cartao">
        <h3>Contato</h3>
        <div class="campo"><label>WhatsApp (só números)</label><input type="text" id="cfgWhats" value="${escHtml(configAdm.contato_whatsapp)}"></div>
        <div class="campo"><label>E-mail</label><input type="text" id="cfgEmail" value="${escHtml(configAdm.contato_email)}"></div>
      </div>
      <button class="btn btn-verde" onclick="salvarConfig()">💾 Salvar configurações</button>

      <div class="cartao" style="margin-top:22px">
        <h3>🔑 Alterar senha do painel</h3>
        <div class="campo"><label>Senha atual</label><input type="password" id="cfgSenhaAtual"></div>
        <div class="campo"><label>Nova senha</label><input type="password" id="cfgSenhaNova"></div>
        <div class="campo"><label>Confirmar nova senha</label><input type="password" id="cfgSenhaConf"></div>
        <button class="btn btn-escuro" onclick="alterarSenha()">🔒 Alterar senha</button>
      </div>

      <div class="cartao">
        <h3>ℹ️ Informações técnicas</h3>
        <p class="desc">Domínio do painel admin: <code><a href="https://${escHtml((r.painel_hosts || 'panadm').split(', ')[0])}" target="_blank">${escHtml(r.painel_hosts || '(não configurado)')}</a></code> (definido pela variável <b>PAINEL_ADM_HOSTS</b>)</p>
        <p class="desc">Caminho reserva do painel: <code><a href="${escHtml(r.painel_path)}" target="_blank">${escHtml(r.painel_path)}</a></code> (definido pela variável <b>PAINEL_ADM</b>)</p>
        <p class="desc">Notificações ntfy: ${r.ntfy ? '✅ habilitadas' : '⚠️ desabilitadas (defina NTFY_URL e NTFY_TOPIC no Coolify)'}</p>
      </div>`;
    trocarFundoTipo();
  } catch (e) {
    main.innerHTML = '<div class="vazio">Erro: ' + escHtml(e.message) + '</div>';
  }
}

function trocarFundoTipo() {
  const sel = document.getElementById('cfgFundoTipo');
  if (!sel) return;
  const tipo = sel.value;
  const box = document.getElementById('cfgFundoEditor');
  if (tipo === 'cor') {
    box.innerHTML = '<div class="campo"><label>Cor (hex)</label><input type="color" id="cfgFundoValor" value="#FAF6F0" style="width:80px; height:44px"> <input type="text" id="cfgFundoValorTexto" value="#FAF6F0" style="width:120px" oninput="document.getElementById(\'cfgFundoValor\').value=this.value"></div>';
  } else {
    box.innerHTML = `<div class="campo"><label>${tipo === 'imagem' ? 'Imagem de fundo' : 'Vídeo de fundo (arquivo ou URL)'}</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
        <input type="file" id="cfgFundoArquivo" ${tipo === 'imagem' ? 'accept="image/*"' : 'accept="video/*"'} onchange="uploadFundo(this)">
        <span class="dica">ou URL:</span>
        <input type="text" id="cfgFundoValor" value="" style="flex:1; min-width:220px" placeholder="/arquivos/... ou https://...">
      </div></div>`;
  }
}

async function uploadFundo(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('arquivo', f);
  try {
    const r = await api('/api/admin/upload', { method: 'POST', body: fd });
    const inp = document.getElementById('cfgFundoValor');
    if (inp) inp.value = r.url;
    toast('Fundo enviado! ✅', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

async function salvarConfig() {
  const tipo = document.getElementById('cfgFundoTipo').value;
  let valor = document.getElementById('cfgFundoValor') ? document.getElementById('cfgFundoValor').value : '';
  if (tipo === 'cor') {
    const t = document.getElementById('cfgFundoValorTexto');
    if (t) valor = t.value;
  }
  const payload = {
    titulo: document.getElementById('cfgTitulo').value,
    descricao: document.getElementById('cfgDescricao').value,
    tema: document.getElementById('cfgTema').value,
    fundo_tipo: tipo,
    fundo_valor: valor,
    contato_whatsapp: soDigitos(document.getElementById('cfgWhats').value),
    contato_email: document.getElementById('cfgEmail').value,
  };
  try {
    await api('/api/admin/config', { method: 'PUT', json: payload });
    toast('Configurações salvas! ✅', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

async function alterarSenha() {
  const atual = document.getElementById('cfgSenhaAtual').value;
  const nova = document.getElementById('cfgSenhaNova').value;
  const conf = document.getElementById('cfgSenhaConf').value;
  if (nova !== conf) return toast('As senhas não conferem.', 'erro');
  if (nova.length < 4) return toast('Senha muito curta (mínimo 4).', 'erro');
  try {
    await api('/api/admin/senha', { method: 'PUT', json: { senha_atual: atual, nova_senha: nova } });
    toast('Senha alterada! ✅', 'ok');
    document.getElementById('cfgSenhaAtual').value = '';
    document.getElementById('cfgSenhaNova').value = '';
    document.getElementById('cfgSenhaConf').value = '';
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

document.addEventListener('DOMContentLoaded', initAdmin);
