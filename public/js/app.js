'use strict';
/* ============================================================
 * CANIVETE — app do usuário
 * ============================================================ */

const ICONE_TIPO = {
  texto: '📄', pdf: '📕', imagem: '🖼️', video: '🎬',
  lista: '📋', checklist: '☑️', formulario: '📝', arquivo: '📦',
};

const App = {
  site: null,
  arvore: [],
  expandidos: new Set(),
  conteudoAtual: null,
  menuAtual: null,
  formularioDados: {},   // respostas do formulário em edição
  checklistEstado: {},   // {idItem: bool} do checklist em edição
  produtos: { aprovados: [], meus: [] },
  filtroProduto: 'todos',
};

/* ---------------- init ---------------- */
async function init() {
  document.getElementById('btnAbrirMenu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('aberta'));
  document.getElementById('btnRanking').addEventListener('click', () => { fecharDrawer(); location.hash = '#/ranking'; });
  document.getElementById('btnMateriais').addEventListener('click', () => { fecharDrawer(); location.hash = '#/materiais'; });

  try { App.site = await api('/api/site'); aplicarSite(App.site); } catch (e) {}
  await carregarArvore();
  window.addEventListener('hashchange', rota);
  rota();
}

function fecharDrawer() { document.getElementById('sidebar').classList.remove('aberta'); }

function aplicarSite(site) {
  document.body.className = 'tema-' + (site.tema || 'claro');
  document.title = site.titulo + ' · ' + site.descricao;
  document.getElementById('tituloSite').textContent = site.titulo;
  document.getElementById('subtituloSite').textContent = site.descricao;
  document.getElementById('monograma').textContent = (site.titulo || 'C').trim().charAt(0).toUpperCase();

  const video = document.getElementById('fundoVideo');
  const body = document.body;
  body.style.backgroundImage = '';
  body.style.backgroundColor = '';
  if (site.fundo_tipo === 'video' && site.fundo_valor) {
    video.src = site.fundo_valor;
    video.style.display = 'block';
  } else {
    video.style.display = 'none';
    video.removeAttribute('src');
  }
  if (site.fundo_tipo === 'cor') body.style.backgroundColor = site.fundo_valor;
  if (site.fundo_tipo === 'imagem' && site.fundo_valor) {
    body.style.backgroundImage = "url('" + site.fundo_valor + "')";
    body.style.backgroundSize = 'cover';
    body.style.backgroundAttachment = 'fixed';
  }
}

/* ---------------- árvore de menus ---------------- */
async function carregarArvore() {
  try { App.arvore = await api('/api/menu'); } catch (e) { App.arvore = []; }
  const ul = document.getElementById('arvoreMenus');
  ul.innerHTML = '';
  App.arvore.forEach(no => ul.appendChild(noMenuHTML(no, 0)));
}

function noMenuHTML(no, nivel) {
  const li = document.createElement('li');
  const temFilhos = no.children && no.children.length > 0;
  const temConteudos = no.conteudos && no.conteudos.length > 0;
  const aberto = App.expandidos.has(no.id);
  const total = contarConteudos(no);

  const btn = document.createElement('button');
  btn.className = 'item-menu' + (aberto ? ' aberto' : '') + (App.menuAtual === no.id ? ' ativo' : '');
  btn.style.paddingLeft = (10 + nivel * 14) + 'px';
  btn.innerHTML =
    (no.icone ? '<span class="icone-menu">' + escHtml(no.icone) + '</span>' : '') +
    '<span class="nome-linha">' + escHtml(no.nome) + '</span>' +
    (total > 0 ? '<span class="badge">' + total + '</span>' : '') +
    (temFilhos ? '<span class="seta">▶</span>' : '');
  btn.onclick = () => {
    if (temFilhos) {
      App.expandidos.has(no.id) ? App.expandidos.delete(no.id) : App.expandidos.add(no.id);
      renderArvore();
    }
    fecharDrawer();
    App.menuAtual = no.id;
    renderArvore();
    location.hash = '#/menu/' + no.id;
  };
  li.appendChild(btn);

  if (temFilhos && aberto) {
    const sub = document.createElement('ul');
    sub.className = 'filhos';
    no.children.forEach(c => sub.appendChild(noMenuHTML(c, nivel + 1)));
    li.appendChild(sub);
  }
  return li;
}

function renderArvore() {
  const ul = document.getElementById('arvoreMenus');
  ul.innerHTML = '';
  App.arvore.forEach(no => ul.appendChild(noMenuHTML(no, 0)));
}

/* ---------------- rotas ---------------- */
async function rota() {
  const h = location.hash || '#/';
  const c = document.getElementById('conteudo');
  try {
    if (h.startsWith('#/c/')) {
      const id = Number(h.split('/')[2]);
      const conteudo = await api('/api/conteudo/' + id);
      renderConteudo(conteudo);
      setTimeout(mostrarPopupDoacao, 2500);
    } else if (h.startsWith('#/menu/')) {
      const id = Number(h.split('/')[2]);
      renderMenuView(id);
    } else if (h === '#/ranking') {
      await carregarRanking();
    } else if (h === '#/materiais') {
      await renderMateriais();
    } else {
      renderHome();
    }
  } catch (e) {
    c.innerHTML = '<div class="vazio"><div class="grande">😕</div><p>' + escHtml(e.message || 'Erro ao carregar') + '</p></div>';
  }
}

function renderHome() {
  const c = document.getElementById('conteudo');
  const desc = App.site && App.site.descricao ? App.site.descricao : '';
  let cards = '';
  App.arvore.forEach(no => {
    const total = contarConteudos(no);
    cards += `<a class="cartao-menu" href="#/menu/${no.id}">
      <div class="icone">${no.icone ? escHtml(no.icone) : '📁'}</div>
      <div class="nome">${escHtml(no.nome)}</div>
      <div class="contagem"><span class="pill">${total}</span> ${total === 1 ? 'item' : 'itens'}</div>
    </a>`;
  });
  c.innerHTML = `
    <div class="cartao" style="background:linear-gradient(135deg, var(--surface) 0%, var(--accent-soft) 100%); border:none; padding:30px 28px">
      <h2 style="font-size:30px">Bem-vindo 👋</h2>
      <p class="desc" style="font-size:15px">${escHtml(desc)}</p>
    </div>
    ${App.arvore.length ? '<div class="grade-menus" style="margin-top:6px">' + cards + '</div>'
      : '<div class="vazio"><div class="grande">🗂️</div><p>Nenhum menu publicado ainda.</p></div>'}`;
}

/* caminho da raiz até o menu (para breadcrumb) */
function acharCaminho(nos, id, trilha = []) {
  for (const no of nos) {
    const nova = [...trilha, no];
    if (no.id === id) return nova;
    const r = acharCaminho(no.children || [], id, nova);
    if (r) return r;
  }
  return null;
}
function breadcrumbHTML(trilha, fim) {
  const partes = ['<a href="#/">Início</a>'];
  (trilha || []).forEach((no, i) => {
    partes.push('<span class="sep">›</span>');
    if (i === (trilha.length - 1) && !fim) partes.push('<span>' + escHtml(no.nome) + '</span>');
    else partes.push('<a href="#/menu/' + no.id + '">' + escHtml(no.nome) + '</a>');
  });
  if (fim) {
    partes.push('<span class="sep">›</span>');
    partes.push('<span style="color:var(--ink); font-weight:600">' + escHtml(fim) + '</span>');
  }
  return '<div class="migalhas">' + partes.join('') + '</div>';
}

function contarConteudos(no) {
  let n = no.conteudos ? no.conteudos.length : 0;
  (no.children || []).forEach(c => n += contarConteudos(c));
  return n;
}

/* ---------------- view de menu ---------------- */
function renderMenuView(id) {
  const no = acharMenu(App.arvore, id);
  const c = document.getElementById('conteudo');
  if (!no) { c.innerHTML = '<div class="vazio"><div class="grande">🤷</div><p>Menu não encontrado.</p></div>'; return; }
  const trilha = acharCaminho(App.arvore, id);
  const conteudos = no.conteudos || [];
  c.innerHTML = `
    ${breadcrumbHTML(trilha)}
    <div class="cartao" style="background:linear-gradient(135deg, var(--surface) 0%, var(--accent-soft) 100%); border:none">
      <h2>${no.icone ? escHtml(no.icone) + ' ' : ''}${escHtml(no.nome)}</h2>
      ${conteudos.length ? '<p class="desc">' + conteudos.length + ' conteúdo(s) disponível(is).</p>' : ''}
    </div>
    ${conteudos.length ? '<div class="grade-menus" style="margin-top:6px">' + conteudos.map(ct =>
      `<a class="cartao-menu" href="#/c/${ct.id}">
        <div class="icone">${ICONE_TIPO[ct.tipo] || '📄'}</div>
        <div class="nome">${escHtml(ct.titulo)}</div>
        <div class="contagem">${nomeTipo(ct.tipo)}</div>
      </a>`).join('') + '</div>'
    : '<div class="vazio"><p>Este menu ainda não tem conteúdo.</p></div>'}`;
}

function acharMenu(nos, id) {
  for (const no of nos) {
    if (no.id === id) return no;
    const filho = acharMenu(no.children || [], id);
    if (filho) return filho;
  }
  return null;
}
function nomeTipo(t) {
  return { texto: 'Texto', pdf: 'PDF', imagem: 'Imagem', video: 'Vídeo', lista: 'Lista', checklist: 'Checklist', formulario: 'Formulário', arquivo: 'Arquivo' }[t] || 'Conteúdo';
}

/* ---------------- conteúdo ---------------- */
async function renderConteudo(ct) {
  App.conteudoAtual = ct;
  App.formularioDados = {};
  App.checklistEstado = {};

  // restaura preenchimentos/anotações salvos deste dispositivo
  let meus = [];
  try { meus = await api('/api/meus-envios?dispositivo=' + encodeURIComponent(getDispositivo())); } catch (e) {}
  const envioForm = meus.find(m => m.conteudo_id === ct.id && m.tipo_envio === 'formulario');
  const envioCheck = meus.find(m => m.conteudo_id === ct.id && m.tipo_envio === 'checklist');
  const envioNota = meus.find(m => m.conteudo_id === ct.id && m.tipo_envio === 'anotacao');

  const c = document.getElementById('conteudo');
  let corpo = '';

  // breadcrumb: Início > Menu > Conteúdo
  const noMenu = acharMenu(App.arvore, ct.menu_id);
  const trilha = noMenu ? acharCaminho(App.arvore, ct.menu_id) : null;
  corpo += breadcrumbHTML(trilha, ct.titulo);

  switch (ct.tipo) {
    case 'texto':
      corpo += `<div class="cartao"><h2>${escHtml(ct.titulo)}</h2><div class="texto-corpo">${ct.corpo || '<p></p>'}</div></div>`;
      break;
    case 'pdf':
      corpo += `<div class="cartao">
        <h2>${escHtml(ct.titulo)}</h2>
        ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
        ${ct.arquivo ? `<iframe class="pdf-visor" src="${escHtml(ct.arquivo)}"></iframe>
          <div style="margin-top:12px"><a class="btn btn-primario" href="${escHtml(ct.arquivo)}" download target="_blank">⬇ Baixar PDF</a></div>` : '<p>Arquivo não anexado.</p>'}
      </div>`;
      break;
    case 'imagem':
      corpo += `<div class="cartao">
        <h2>${escHtml(ct.titulo)}</h2>
        ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
        ${ct.arquivo ? `<img class="imagem-conteudo" src="${escHtml(ct.arquivo)}" alt="${escHtml(ct.titulo)}">` : '<p>Imagem não anexada.</p>'}
      </div>`;
      break;
    case 'video':
      corpo += `<div class="cartao">
        <h2>${escHtml(ct.titulo)}</h2>
        ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
        ${ct.arquivo ? (ct.arquivo.includes('youtube.com') || ct.arquivo.includes('youtu.be') || ct.arquivo.includes('vimeo.com')
          ? `<iframe class="pdf-visor" src="${escHtml(embedVideo(ct.arquivo))}" allowfullscreen></iframe>`
          : `<video class="video-player" controls preload="metadata" src="${escHtml(ct.arquivo)}"></video>`) : '<p>Vídeo não anexado.</p>'}
      </div>`;
      break;
    case 'lista':
      corpo += `<div class="cartao">
        <h2>${escHtml(ct.titulo)}</h2>
        ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
        ${(ct.dados || []).length ? `<ul class="lista-simples">${ct.dados.map(i => `<li>${escHtml(typeof i === 'string' ? i : i.texto)}</li>`).join('')}</ul>` : '<p>Lista vazia.</p>'}
      </div>`;
      break;
    case 'checklist':
      corpo += renderChecklist(ct, envioCheck);
      break;
    case 'formulario':
      corpo += renderFormulario(ct, envioForm);
      break;
    case 'arquivo':
      corpo += `<div class="cartao">
        <h2>${escHtml(ct.titulo)}</h2>
        ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
        ${ct.arquivo ? `<a class="btn btn-primario" href="${escHtml(ct.arquivo)}" download>⬇ Baixar arquivo</a>` : '<p>Arquivo não anexado.</p>'}
      </div>`;
      break;
  }

  // anotações (em todos os tipos)
  const notaSalva = envioNota ? (envioNota.dados.nota || '') : '';
  corpo += `<div class="cartao bloco-anotacao">
    <h3>📝 Minhas anotações</h3>
    <p class="desc">Escreva suas notas sobre este conteúdo. Elas ficam salvas e você pode baixar uma cópia em PDF.</p>
    <textarea id="notaTexto" placeholder="Escreva aqui...">${escHtml(notaSalva)}</textarea>
    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap">
      <button class="btn btn-escuro" onclick="salvarAnotacao()">💾 Salvar anotação</button>
      <button class="btn btn-primario" onclick="baixarCopia()">📄 Baixar minha cópia (PDF)</button>
    </div>
    ${envioNota ? '<p class="dica" style="color:var(--ink-soft); font-size:12.5px; margin-top:8px">Anotação salva em ' + dataBonita(envioNota.atualizado_em) + '</p>' : ''}
  </div>`;

  c.innerHTML = corpo;
  if (ct.tipo === 'checklist') montarChecklist(ct, envioCheck);
  if (ct.tipo === 'formulario') montarFormulario(ct, envioForm);
}

function embedVideo(url) {
  if (url.includes('youtu.be/')) return 'https://www.youtube.com/embed/' + url.split('youtu.be/')[1].split('?')[0];
  if (url.includes('youtube.com/watch')) return 'https://www.youtube.com/embed/' + (url.split('v=')[1] || '').split('&')[0];
  if (url.includes('vimeo.com/')) return 'https://player.vimeo.com/video/' + url.split('vimeo.com/')[1].split('?')[0];
  return url;
}

/* ---------------- checklist ---------------- */
function renderChecklist(ct, envio) {
  const itens = ct.dados || [];
  if (!itens.length) return `<div class="cartao"><h2>${escHtml(ct.titulo)}</h2><p>Checklist vazio.</p></div>`;
  return `<div class="cartao">
    <h2>${escHtml(ct.titulo)}</h2>
    ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
    <div class="barra-progresso"><div id="progressoCheck" style="width:0%"></div></div>
    <div id="listaCheck"></div>
    <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap">
      <button class="btn btn-escuro" onclick="salvarChecklist()">💾 Salvar e baixar PDF</button>
      <button class="btn btn-fantasma" onclick="limparChecklist()">Limpar</button>
    </div>
    ${envio ? '<p class="dica" style="color:var(--ink-soft); font-size:12.5px; margin-top:8px">Progresso salvo em ' + dataBonita(envio.atualizado_em) + '</p>' : ''}
  </div>`;
}

function montarChecklist(ct, envio) {
  const lista = document.getElementById('listaCheck');
  if (!lista) return;
  const itens = ct.dados || [];
  const estado = {};
  if (envio && envio.dados && envio.dados.marcados) {
    (envio.dados.marcados || []).forEach(id => estado[id] = true);
  }
  App.checklistEstado = estado;
  lista.innerHTML = itens.map((it, i) => {
    const id = String(it.id !== undefined ? it.id : i);
    return `<div class="check-item ${estado[id] ? 'feito' : ''}" data-id="${escHtml(id)}" onclick="toggleCheck(this)">
      <input type="checkbox" ${estado[id] ? 'checked' : ''} onchange="toggleCheck(this.closest('.check-item'))">
      <span class="texto">${escHtml(typeof it === 'string' ? it : it.texto)}</span>
    </div>`;
  }).join('');
  atualizarProgresso();
}

function toggleCheck(el) {
  const id = el.dataset.id;
  const estado = App.checklistEstado;
  if (el.classList.contains('feito')) { estado[id] = false; el.classList.remove('feito'); }
  else { estado[id] = true; el.classList.add('feito'); }
  const chk = el.querySelector('input[type=checkbox]');
  if (chk) chk.checked = estado[id];
  atualizarProgresso();
}

function atualizarProgresso() {
  const total = Object.keys(App.checklistEstado).length;
  if (!total) return;
  const feitos = Object.values(App.checklistEstado).filter(v => v).length;
  const bar = document.getElementById('progressoCheck');
  if (bar) bar.style.width = Math.round(feitos / total * 100) + '%';
}

async function salvarChecklist() {
  const ct = App.conteudoAtual;
  if (!ct) return;
  const marcados = Object.entries(App.checklistEstado).filter(([, v]) => v).map(([k]) => k);
  try {
    await api('/api/envio', { method: 'POST', json: { conteudo_id: ct.id, dispositivo: getDispositivo(), tipo_envio: 'checklist', dados: { marcados } } });
    toast('Checklist salvo! Gerando PDF...', 'ok');
    baixarCopia();
  } catch (e) { toast('Erro ao salvar: ' + e.message, 'erro'); }
}

function limparChecklist() {
  App.checklistEstado = {};
  document.querySelectorAll('#listaCheck .check-item').forEach(el => {
    el.classList.remove('feito');
    const chk = el.querySelector('input');
    if (chk) chk.checked = false;
  });
  atualizarProgresso();
}

/* ---------------- formulário ---------------- */
function renderFormulario(ct, envio) {
  return `<div class="cartao">
    <h2>${escHtml(ct.titulo)}</h2>
    ${ct.corpo ? '<p class="desc">' + escHtml(ct.corpo) + '</p>' : ''}
    <form id="formDinamico" onsubmit="return enviarFormulario(event)">
      <div id="camposForm"></div>
      <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap">
        <button type="submit" class="btn btn-verde" style="flex:1">📨 Enviar</button>
        <button type="button" class="btn btn-escuro" style="flex:1" onclick="gerarPdfFormulario()">🖨️ Gerar PDF</button>
      </div>
    </form>
    <p class="dica" style="color:var(--ink-soft); font-size:12.5px; margin-top:10px">Ao gerar o PDF, uma cópia das suas respostas é salva automaticamente na plataforma.</p>
  </div>`;
}

function montarFormulario(ct, envio) {
  const box = document.getElementById('camposForm');
  if (!box) return;
  const campos = ct.dados || [];
  const preenchidos = (envio && envio.dados) || {};
  App.formularioDados = { ...preenchidos };
  box.innerHTML = campos.map((f, i) => {
    const id = String(f.id !== undefined ? f.id : 'f' + i);
    const valor = preenchidos[id] !== undefined ? preenchidos[id] : (f.valor_default || '');
    const obrig = f.obrigatorio ? ' <span class="obrig">*</span>' : '';
    const rotulo = '<label>' + escHtml(f.rotulo || ('Campo ' + (i + 1))) + obrig + '</label>';
    const dica = f.placeholder ? '<div class="dica">' + escHtml(f.placeholder) + '</div>' : '';
    const link = f.link
      ? '<div class="dica"><a href="' + escHtml(f.link) + '" target="_blank" rel="noopener">🔗 ' + escHtml(f.link_texto || 'Link de referência') + '</a></div>'
      : '';
    switch (f.tipo) {
      case 'texto_longo':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<textarea placeholder="${escHtml(f.placeholder || '')}">${escHtml(valor)}</textarea>${dica}${link}</div>`;
      case 'numero':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<input type="number" step="0.01" placeholder="${escHtml(f.placeholder || '')}" value="${escHtml(valor)}">${dica}${link}</div>`;
      case 'selecao':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<select><option value="">Selecione...</option>${(f.opcoes || []).map(o => `<option value="${escHtml(o)}" ${String(valor) === String(o) ? 'selected' : ''}>${escHtml(o)}</option>`).join('')}</select>${dica}${link}</div>`;
      case 'check':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<label class="check-simples"><input type="checkbox" ${valor ? 'checked' : ''}> <span>${escHtml(f.placeholder || 'Marcar')}</span></label>${dica}${link}</div>`;
      case 'data':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<input type="date" value="${escHtml(valor)}">${dica}${link}</div>`;
      case 'whatsapp':
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<input type="tel" inputmode="numeric" placeholder="${escHtml(f.placeholder || '(00) 00000-0000')}" value="${escHtml(valor)}">${dica}${link}</div>`;
      default:
        return `<div class="campo" data-campo="${escHtml(id)}">${rotulo}<input type="text" placeholder="${escHtml(f.placeholder || '')}" value="${escHtml(valor)}">${dica}${link}</div>`;
    }
  }).join('');
}

function coletarFormulario() {
  const ct = App.conteudoAtual;
  const campos = ct.dados || [];
  const respostas = {};
  document.querySelectorAll('#camposForm .campo').forEach(campoEl => {
    const id = campoEl.dataset.campo;
    const campo = campos.find(f => String(f.id !== undefined ? f.id : 'f' + campos.indexOf(f)) === id) || { tipo: 'texto' };
    const input = campoEl.querySelector('input, textarea, select');
    if (!input) return;
    if (campo.tipo === 'check') respostas[id] = !!input.checked;
    else respostas[id] = input.value;
  });
  return respostas;
}

function validarObrigatorios(campos, respostas) {
  for (const f of campos) {
    const id = String(f.id !== undefined ? f.id : 'f' + campos.indexOf(f));
    const v = respostas[id];
    if (f.obrigatorio && (v === undefined || v === '' || v === false)) {
      toast('Preencha o campo obrigatório: ' + (f.rotulo || id), 'erro');
      return false;
    }
  }
  return true;
}

function nomeWhatsappDoForm(campos, respostas) {
  let nome = '', whatsapp = '';
  campos.forEach((f, i) => {
    const id = String(f.id !== undefined ? f.id : 'f' + i);
    const rotulo = (f.rotulo || '').toLowerCase();
    if (rotulo.includes('nome')) nome = respostas[id] || '';
    if (rotulo.includes('whats')) whatsapp = respostas[id] || '';
  });
  return { nome, whatsapp };
}

async function gerarPdfFormulario() {
  const ct = App.conteudoAtual;
  if (!ct) return;
  const campos = ct.dados || [];
  const respostas = coletarFormulario();
  if (!validarObrigatorios(campos, respostas)) return;
  const { nome, whatsapp } = nomeWhatsappDoForm(campos, respostas);
  try {
    await api('/api/envio', {
      method: 'POST',
      json: { conteudo_id: ct.id, dispositivo: getDispositivo(), tipo_envio: 'formulario', nome, whatsapp, dados: respostas },
    });
    toast('Cópia salva! Gerando PDF... 📄', 'ok');
    baixarCopia();
  } catch (e) { toast('Erro ao salvar: ' + e.message, 'erro'); }
}

async function enviarFormulario(ev) {
  ev.preventDefault();
  const ct = App.conteudoAtual;
  if (!ct) return;
  const campos = ct.dados || [];
  const respostas = coletarFormulario();

  if (!validarObrigatorios(campos, respostas)) return;
  const { nome, whatsapp } = nomeWhatsappDoForm(campos, respostas);

  try {
    await api('/api/envio', {
      method: 'POST',
      json: { conteudo_id: ct.id, dispositivo: getDispositivo(), tipo_envio: 'formulario', nome, whatsapp, dados: respostas },
    });
    toast('Formulário enviado! ✅', 'ok');
    const querPdf = confirm('Quer baixar uma cópia em PDF com suas respostas?');
    if (querPdf) baixarCopia();
  } catch (e) { toast('Erro ao enviar: ' + e.message, 'erro'); }
}

/* ---------------- anotação + cópia PDF ---------------- */
async function salvarAnotacao() {
  const ct = App.conteudoAtual;
  const nota = document.getElementById('notaTexto') ? document.getElementById('notaTexto').value : '';
  if (!ct) return;
  try {
    await api('/api/envio', { method: 'POST', json: { conteudo_id: ct.id, dispositivo: getDispositivo(), tipo_envio: 'anotacao', dados: { nota } } });
    toast('Anotação salva! 💾', 'ok');
  } catch (e) { toast('Erro: ' + e.message, 'erro'); }
}

async function baixarCopia() {
  const ct = App.conteudoAtual;
  if (!ct) return;
  const nota = document.getElementById('notaTexto') ? document.getElementById('notaTexto').value : '';
  let linhas = [];

  if (ct.tipo === 'formulario') {
    const respostas = coletarFormulario();
    const campos = ct.dados || [];
    linhas = campos.map((f, i) => {
      const id = String(f.id !== undefined ? f.id : 'f' + i);
      const v = respostas[id];
      return { rotulo: f.rotulo || id, valor: f.tipo === 'check' ? (v ? '✔ Sim' : '— Não') : (v !== undefined ? String(v) : '') };
    });
  } else if (ct.tipo === 'checklist') {
    const itens = ct.dados || [];
    linhas = itens.map((it, i) => {
      const id = String(it.id !== undefined ? it.id : i);
      return { rotulo: typeof it === 'string' ? it : it.texto, valor: App.checklistEstado[id] ? '✔ Sim' : '— Não' };
    });
  } else if (ct.tipo === 'lista') {
    linhas = (ct.dados || []).map((i, idx) => ({ rotulo: 'Item ' + (idx + 1), valor: typeof i === 'string' ? i : i.texto }));
  } else if (ct.tipo === 'texto') {
    // limpa tags para o PDF
    const div = document.createElement('div');
    div.innerHTML = ct.corpo || '';
    linhas = [{ rotulo: 'Conteúdo', valor: div.textContent }];
  } else {
    linhas = ct.arquivo ? [{ rotulo: 'Arquivo', valor: location.origin + ct.arquivo }] : [];
  }

  try {
    await gerarPDF({
      titulo: ct.titulo,
      subtitulo: (App.site && App.site.titulo) || 'Canivete',
      secaoTitulo: 'Cópia do conteúdo · ' + nomeTipo(ct.tipo),
      linhas,
      notas: nota || '',
      arquivo: 'copia-' + ct.titulo.replace(/[^\wà-úÀ-Ú]/g, '-').slice(0, 40) + '.pdf',
    });
    toast('PDF gerado! 📄', 'ok');
  } catch (e) { toast('Erro ao gerar PDF: ' + e.message, 'erro'); }
}

/* ---------------- ranking de produtos ---------------- */
async function carregarRanking() {
  const c = document.getElementById('conteudo');
  try {
    App.produtos = await api('/api/produtos?dispositivo=' + encodeURIComponent(getDispositivo()));
  } catch (e) { App.produtos = { aprovados: [], meus: [] }; }
  renderRanking();
}

function renderRanking() {
  const c = document.getElementById('conteudo');
  const { aprovados, meus } = App.produtos;
  const filtrados = App.filtroProduto === 'todos' ? aprovados : aprovados.filter(p => p.tipo === App.filtroProduto);

  c.innerHTML = `
    <div class="cartao">
      <h2>🏆 Ranking de Produtos</h2>
      <p class="desc">Valores de compra e venda reportados pela comunidade. Compare com a tabela de referência.</p>
      <div class="filtros">
        <button class="chip ${App.filtroProduto === 'todos' ? 'ativo' : ''}" onclick="filtrarProdutos('todos')">Todos</button>
        <button class="chip ${App.filtroProduto === 'compra' ? 'ativo' : ''}" onclick="filtrarProdutos('compra')">🛒 Compras</button>
        <button class="chip ${App.filtroProduto === 'venda' ? 'ativo' : ''}" onclick="filtrarProdutos('venda')">💰 Vendas</button>
      </div>
      <button class="btn btn-primario" onclick="abrirFormProduto()">➕ Adicionar produto ao ranking</button>
    </div>

    ${filtrados.length ? `<div class="grade-produtos">${filtrados.map(p => `
      <div class="cartao-produto">
        <img class="foto" src="${escHtml(p.foto)}" alt="${escHtml(p.nome)}" loading="lazy">
        <div class="info">
          <span class="etiqueta ${p.tipo}">${p.tipo === 'compra' ? '🛒 Compra' : '💰 Venda'}</span>
          <div class="nome">${escHtml(p.nome)}</div>
          <div class="vendedor">👤 ${escHtml(p.vendedor)}</div>
          <div class="preco">${fmtMoeda(p.preco)}</div>
          ${p.ref ? `<div class="ref">📊 Referência: compra mín. ${fmtMoeda(p.ref.preco_min_compra)} · venda máx. ${fmtMoeda(p.ref.preco_max_venda)}</div>` : ''}
          <a class="btn btn-pequeno" style="margin-top:10px" href="${waLink(p.whatsapp)}" target="_blank">💬 Falar com ${escHtml(p.vendedor)}</a>
        </div>
      </div>`).join('')}</div>`
    : '<div class="vazio"><div class="grande">📭</div><p>Nenhum produto aprovado ainda.</p></div>'}

    ${meus.length ? `<div class="cartao" style="margin-top:22px">
      <h3>Meus envios</h3>
      <p class="desc">Acompanhe o status dos produtos que você cadastrou.</p>
      ${meus.map(p => `<div class="linha-material">
        <div class="principal">
          <div class="titulo">${escHtml(p.nome)} · ${fmtMoeda(p.preco)}</div>
          <div class="meta">${p.tipo === 'compra' ? 'Compra' : 'Venda'} · enviado em ${dataBonita(p.criado_em)}</div>
          ${p.nota ? '<div class="meta">Motivo: ' + escHtml(p.nota) + '</div>' : ''}
        </div>
        <span class="etiqueta ${p.status}">${p.status === 'pendente' ? '⏳ Pendente' : p.status === 'aprovado' ? '✅ Aprovado' : '❌ Reprovado'}</span>
      </div>`).join('')}
    </div>` : ''}`;
}

function filtrarProdutos(f) {
  App.filtroProduto = f;
  renderRanking();
}

function abrirFormProduto() {
  const corpo = abrirModal(`
    <h3>➕ Adicionar produto ao ranking</h3>
    <p class="desc">Preencha os dados e anexe a foto comprovando a compra ou venda. A publicação passa por aprovação.</p>
    <form id="formProduto">
      <div class="campo"><label>Produto <span class="obrig">*</span></label><input type="text" id="pNome" required placeholder="Ex: iPhone 13 128GB"></div>
      <div class="campo"><label>Nome do vendedor <span class="obrig">*</span></label><input type="text" id="pVendedor" required placeholder="Quem vendeu/comprou"></div>
      <div class="campo"><label>WhatsApp <span class="obrig">*</span></label><input type="tel" id="pWhats" required placeholder="(00) 00000-0000"></div>
      <div class="campo"><label>Tipo <span class="obrig">*</span></label>
        <div class="campo-opcoes">
          <label><input type="radio" name="pTipo" value="compra" checked> 🛒 Compra</label>
          <label><input type="radio" name="pTipo" value="venda"> 💰 Venda</label>
        </div>
      </div>
      <div class="campo"><label>Valor (R$) <span class="obrig">*</span></label><input type="number" id="pPreco" required step="0.01" min="0" placeholder="0,00"></div>
      <div class="campo"><label>Foto comprovando ${'compra'}/venda <span class="obrig">*</span></label><input type="file" id="pFoto" accept="image/*" required></div>
      <button type="submit" class="btn btn-verde btn-bloco">📨 Enviar para aprovação</button>
    </form>
  `);
  document.getElementById('formProduto').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData();
    fd.append('nome', document.getElementById('pNome').value);
    fd.append('vendedor', document.getElementById('pVendedor').value);
    fd.append('whatsapp', soDigitos(document.getElementById('pWhats').value));
    fd.append('tipo', document.querySelector('input[name=pTipo]:checked').value);
    fd.append('preco', document.getElementById('pPreco').value);
    fd.append('foto', document.getElementById('pFoto').files[0]);
    fd.append('dispositivo', getDispositivo());
    try {
      await api('/api/produtos', { method: 'POST', body: fd });
      fecharModal();
      toast('Produto enviado para aprovação! 🎉', 'ok');
      carregarRanking();
    } catch (e) { toast('Erro: ' + e.message, 'erro'); }
  });
}

/* ---------------- meus materiais ---------------- */
async function renderMateriais() {
  const c = document.getElementById('conteudo');
  let envios = [];
  try { envios = await api('/api/meus-envios?dispositivo=' + encodeURIComponent(getDispositivo())); } catch (e) {}
  if (!envios.length) {
    c.innerHTML = `<div class="cartao"><h2>📥 Meus materiais</h2>
      <div class="vazio"><div class="grande">🗒️</div><p>Você ainda não salvou preenchimentos, checklists ou anotações.<br>Abra um conteúdo e use "Salvar" ou "Baixar minha cópia".</p></div></div>`;
    return;
  }
  c.innerHTML = `<div class="cartao"><h2>📥 Meus materiais</h2>
    <p class="desc">Cópias dos conteúdos com os seus preenchimentos e anotações.</p></div>
    ${envios.map(e => `
      <div class="linha-material">
        <div class="principal">
          <div class="titulo">${ICONE_TIPO[e.conteudo_tipo] || '📄'} ${escHtml(e.conteudo_titulo)}</div>
          <div class="meta">${nomeEnvio(e.tipo_envio)} · salvo em ${dataBonita(e.atualizado_em)}</div>
        </div>
        <button class="btn btn-primario btn-pequeno" onclick="baixarEnvioPDF(${e.id})">📄 Baixar PDF</button>
        <a class="btn btn-fantasma btn-pequeno" href="#/c/${e.conteudo_id}">Ver conteúdo</a>
      </div>`).join('')}`;
}

function nomeEnvio(t) {
  return t === 'formulario' ? 'Formulário preenchido' : t === 'checklist' ? 'Checklist' : 'Anotação';
}

async function baixarEnvioPDF(idEnvio) {
  try {
    const envios = await api('/api/meus-envios?dispositivo=' + encodeURIComponent(getDispositivo()));
    const envio = envios.find(e => e.id === idEnvio);
    if (!envio) throw new Error('Envio não encontrado');
    const ct = await api('/api/conteudo/' + envio.conteudo_id);
    let linhas = [];
    if (envio.tipo_envio === 'formulario') {
      const campos = ct.dados || [];
      linhas = campos.map((f, i) => {
        const id = String(f.id !== undefined ? f.id : 'f' + i);
        const v = envio.dados[id];
        return { rotulo: f.rotulo || id, valor: f.tipo === 'check' ? (v ? '✔ Sim' : '— Não') : (v !== undefined ? String(v) : '') };
      });
    } else if (envio.tipo_envio === 'checklist') {
      const marcados = envio.dados.marcados || [];
      linhas = (ct.dados || []).map((it, i) => {
        const id = String(it.id !== undefined ? it.id : i);
        return { rotulo: typeof it === 'string' ? it : it.texto, valor: marcados.includes(id) ? '✔ Sim' : '— Não' };
      });
    } else if (ct.tipo === 'texto') {
      const div = document.createElement('div');
      div.innerHTML = ct.corpo || '';
      linhas = [{ rotulo: 'Conteúdo', valor: div.textContent }];
    } else {
      linhas = ct.arquivo ? [{ rotulo: 'Arquivo', valor: location.origin + ct.arquivo }] : [];
    }
    const nota = envio.tipo_envio === 'anotacao' ? (envio.dados.nota || '') : (envio.dados.nota || '');
    await gerarPDF({
      titulo: ct.titulo,
      subtitulo: (App.site && App.site.titulo) || 'Canivete',
      secaoTitulo: 'Minha cópia · ' + nomeEnvio(envio.tipo_envio),
      linhas,
      notas: nota,
      arquivo: 'copia-' + ct.titulo.replace(/[^\wà-úÀ-Ú]/g, '-').slice(0, 40) + '.pdf',
    });
    toast('PDF gerado! 📄', 'ok');
  } catch (e) { toast('Erro ao gerar PDF: ' + e.message, 'erro'); }
}

document.addEventListener('DOMContentLoaded', init);

/* ---------------- popup doação (parte inferior) ---------------- */
const LINK_DOACAO = 'https://link.mercadopago.com.br/dtxzn';
const PIX_DOACAO = 'pix@arthvision.com';
const DOACAO_INTERVALO_MS = 24 * 60 * 60 * 1000; // reaparece após 24h

function podeMostrarDoacao() {
  try {
    const ultimo = Number(localStorage.getItem('cnv_doacao_ultimo') || 0);
    return Date.now() - ultimo > DOACAO_INTERVALO_MS;
  } catch (e) { return true; }
}
function marcarDoacaoVista() {
  try { localStorage.setItem('cnv_doacao_ultimo', String(Date.now())); } catch (e) {}
}
function mostrarPopupDoacao() {
  const el = document.getElementById('popupDoacao');
  if (!el || el.style.display !== 'none') return;
  if (!podeMostrarDoacao()) return;
  el.style.display = 'block';
}
function fecharPopupDoacao() {
  marcarDoacaoVista();
  const el = document.getElementById('popupDoacao');
  if (el) el.style.display = 'none';
}
function okPopupDoacao() {
  marcarDoacaoVista();
  window.location.href = LINK_DOACAO;
}
function copiarPixDoacao() {
  const chave = document.querySelector('.pix-chave');
  if (!chave) return;
  const texto = chave.textContent.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(() => toast('Chave Pix copiada! 💛', 'ok')).catch(() => {});
  }
  toast('Pix: ' + texto, 'ok');
}
document.addEventListener('DOMContentLoaded', () => {
  const btnNao = document.getElementById('btnDoacaoNao');
  const btnOk = document.getElementById('btnDoacaoOk');
  const chavePix = document.querySelector('.pix-chave');
  if (btnNao) btnNao.addEventListener('click', fecharPopupDoacao);
  if (btnOk) btnOk.addEventListener('click', okPopupDoacao);
  if (chavePix) chavePix.addEventListener('click', copiarPixDoacao);
});
