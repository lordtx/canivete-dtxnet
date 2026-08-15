'use strict';
/* ============================================================
 * CANIVETE — helpers compartilhados (app usuário + admin)
 * ============================================================ */

/* ---------- API ---------- */
async function api(url, opts = {}) {
  const cfg = { method: opts.method || 'GET', headers: {} };
  if (opts.json !== undefined) {
    cfg.headers['Content-Type'] = 'application/json';
    cfg.body = JSON.stringify(opts.json);
  }
  if (opts.body) cfg.body = opts.body; // FormData
  if (opts.credentials !== false) cfg.credentials = 'same-origin';
  const resp = await fetch(url, cfg);
  let data = null;
  try { data = await resp.json(); } catch { /* resposta vazia */ }
  if (!resp.ok) {
    throw new Error((data && data.erro) || ('Erro ' + resp.status));
  }
  return data;
}

/* ---------- dispositivo (identifica o usuário no navegador) ---------- */
function getDispositivo() {
  let id = localStorage.getItem('cnv_dispositivo');
  if (!id) {
    id = 'dev-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    localStorage.setItem('cnv_dispositivo', id);
  }
  return id;
}

/* ---------- formatação ---------- */
function fmtMoeda(v) {
  const n = Number(v) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function dataBonita(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function waLink(numero) {
  let n = String(numero || '').replace(/\D/g, '');
  if (n && !n.startsWith('55')) n = '55' + n;
  return 'https://wa.me/' + n;
}
function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

/* ---------- UI ---------- */
function toast(msg, tipo = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function abrirModal(html, largo = false) {
  fecharModal();
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal ${largo ? 'largo' : ''}">
    <button class="fechar" onclick="fecharModal()">✕</button>
    <div class="modal-corpo">${html}</div>
  </div>`;
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fecharModal(); });
  document.body.appendChild(fundo);
  return fundo.querySelector('.modal-corpo');
}
function fecharModal() {
  document.querySelectorAll('.modal-fundo').forEach(m => m.remove());
}

function carregarJS(urls, done) {
  const pendentes = [...urls];
  const proximo = () => {
    if (!pendentes.length) return done && done();
    const s = document.createElement('script');
    s.src = pendentes.shift();
    s.onload = proximo;
    s.onerror = proximo;
    document.head.appendChild(s);
  };
  proximo();
}

const CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CDN_AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
let pdfCarregado = false;
function garantirPDF(cb) {
  if (pdfCarregado) return cb();
  carregarJS([CDN_JSPDF, CDN_AUTOTABLE], () => { pdfCarregado = true; cb(); });
}

/* ---------- gerador de PDF (cópia do conteúdo com preenchimentos) ---------- */
function gerarPDF({ titulo, subtitulo, secaoTitulo, linhas, notas, arquivo }) {
  return new Promise((resolve, reject) => {
    garantirPDF(() => {
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();
        let y = 60;

        // cabeçalho
        doc.setFillColor(46, 42, 36);
        doc.rect(0, 0, W, 52, 'F');
        doc.setTextColor(240, 230, 211);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text(titulo || 'Canivete', 40, 34);
        if (subtitulo) {
          doc.setFontSize(10.5);
          doc.text(subtitulo, 40, 20);
        }

        doc.setTextColor(46, 42, 36);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(secaoTitulo || 'Conteúdo', 40, 88);

        const linhasTab = linhas.map(l => ({
          rotulo: l.rotulo || '',
          valor: l.valor !== undefined ? l.valor : (l.marcado ? '✔ Sim' : '— Não'),
        }));

        if (linhasTab.length) {
          doc.autoTable({
            startY: 100,
            head: [['Campo', 'Resposta']],
            body: linhasTab.map(l => [l.rotulo, l.valor]),
            theme: 'grid',
            headStyles: { fillColor: [176, 141, 87], textColor: [255, 255, 255], fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 7, textColor: [46, 42, 36] },
            alternateRowStyles: { fillColor: [250, 246, 240] },
            margin: { left: 40, right: 40 },
          });
          y = doc.lastAutoTable.finalY + 24;
        } else {
          y = 100;
        }

        if (notas) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.text('Minhas anotações', 40, y);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          const linhasNota = doc.splitTextToSize(notas, W - 80);
          doc.text(linhasNota, 40, y + 18);
          y += 18 + linhasNota.length * 14;
        }

        // rodapé
        doc.setDrawColor(231, 221, 206);
        doc.line(40, 780, W - 40, 780);
        doc.setFontSize(9);
        doc.setTextColor(110, 101, 88);
        doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' · Canivete', 40, 800);

        doc.save(arquivo || 'canivete-' + Date.now() + '.pdf');
        resolve();
      } catch (e) { reject(e); }
    });
  });
}
