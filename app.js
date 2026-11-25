import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, reauthenticateWithPopup } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const fdb = getFirestore(fbApp);
const snapDocs = s => ({docs:s.docs.map(d => ({id:d.id, data:() => d.data()}))});
// adaptador com a mesma forma usada no restante do código
const fire = {
  // várias gravações de uma vez: ops = [{set:path, data} | {del:path}]
  lote: async ops => { const b = writeBatch(fdb); for (const o of ops){ if (o.del) b.delete(doc(fdb, o.del)); else b.set(doc(fdb, o.set), o.data); } await b.commit(); },
  doc: p => ({
    set: d => setDoc(doc(fdb, p), d),
    delete: () => deleteDoc(doc(fdb, p)),
    get: () => getDoc(doc(fdb, p)).then(x => ({exists:x.exists(), data:() => x.data()})),
    onSnapshot: (cb, err) => onSnapshot(doc(fdb, p), x => cb({exists:x.exists(), data:() => x.data()}), err)
  }),
  collection: p => ({
    onSnapshot: (cb, err) => onSnapshot(collection(fdb, p), x => cb(snapDocs(x)), err),
    where: (campo, valor) => ({
      onSnapshot: (cb, err) => onSnapshot(query(collection(fdb, p), where(campo, '==', valor)), x => cb(snapDocs(x)), err)
    })
  })
};

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
function el(tag, props, ...kids){
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)){
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()){
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const gid = p => p + Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s ?? '').trim().toLocaleLowerCase('pt-BR');
const fmtDH = iso => { try { return new Date(iso).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}); } catch { return ''; } };
const fmtD = d => { if (!d) return ''; const [y, m, dd] = String(d).split('-'); return dd && m && y ? `${dd}/${m}/${y}` : String(d); };
const fmtN = n => Number(n).toLocaleString('pt-BR', {maximumFractionDigits:2});
const vazio = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && !Number.isFinite(v));

/* ================= modelo ================= */
const TIPOS = {
  simples:'Opções simples (uma escolha)',
  multipla:'Opções múltiplas (várias escolhas)',
  texto:'Texto',
  numero:'Número',
  data:'Data'
};
const TEM_OPCOES = t => t === 'simples' || t === 'multipla';
const OPS = {
  simples:  [['igual','for'],['diferente','não for'],['respondida','for respondida (qualquer opção)']],
  multipla: [['contem','incluir'],['nao_contem','não incluir'],['respondida','for respondida (qualquer opção)']],
  numero:   [['>','for maior que'],['>=','for maior ou igual a'],['<','for menor que'],['<=','for menor ou igual a'],['=','for igual a'],['!=','for diferente de'],['respondida','for preenchida']],
  texto:    [['respondida','for preenchida'],['igual','for igual a'],['contem_txt','contiver']],
  data:     [['respondida','for preenchida'],['antes','for antes de'],['depois','for depois de'],['igual','for igual a']]
};
const precisaValor = op => op !== 'respondida';

function novaPergunta(){
  return {id:gid('p'), texto:'', tipo:'simples', obrigatoria:true, ajuda:'',
    opcoes:[{id:gid('o'), rotulo:'Sim'}, {id:gid('o'), rotulo:'Não'}], filhas:[]};
}
function condPadrao(pai){
  const op = OPS[pai.tipo][0][0];
  return {op, valor: TEM_OPCOES(pai.tipo) ? (pai.opcoes[0] ? pai.opcoes[0].id : '') : ''};
}
function novaFilha(pai){
  const f = novaPergunta();
  f.tipo = 'numero'; f.opcoes = [];
  f.cond = condPadrao(pai);
  return f;
}
function condOk(pai, c, val){
  if (!c || vazio(val)) return false;
  const v = c.valor;
  switch (c.op){
    case 'respondida': return true;
    case 'igual':
      if (pai.tipo === 'texto') return norm(val) === norm(v);
      return val === v;
    case 'diferente': return val !== v;
    case 'contem': return Array.isArray(val) && val.includes(v);
    case 'nao_contem': return Array.isArray(val) && !val.includes(v);
    case 'contem_txt': return norm(val).includes(norm(v));
    case 'antes': return !!v && val < v;
    case 'depois': return !!v && val > v;
  }
  const a = Number(val), b = Number(v);
  if (v === '' || v == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  switch (c.op){
    case '>': return a > b; case '>=': return a >= b;
    case '<': return a < b; case '<=': return a <= b;
    case '=': return a === b; case '!=': return a !== b;
  }
  return false;
}
function rotuloOpcao(q, id){ const o = (q.opcoes || []).find(o => o.id === id); return o ? (o.rotulo || '(opção sem texto)') : '(opção removida)'; }
function descreveCond(pai, c){
  const opTxt = (OPS[pai.tipo].find(o => o[0] === c.op) || ['', '?'])[1];
  if (!precisaValor(c.op)) return `Abre quando a resposta ${opTxt}`;
  let v = c.valor;
  if (TEM_OPCOES(pai.tipo)) v = `“${rotuloOpcao(pai, v)}”`;
  else if (pai.tipo === 'data') v = fmtD(v);
  else if (pai.tipo === 'texto') v = `“${v}”`;
  return `Abre quando a resposta ${opTxt} ${v}`;
}
function novoBloco(){ return {id:gid('b'), titulo:'', descricao:'', perguntas:[novaPergunta()]}; }
// questionários antigos (sem blocos) viram um bloco único sem título
function blocosDe(d){
  if (d && Array.isArray(d.blocos) && d.blocos.length) return d.blocos;
  return [{id:'b0', titulo:'', descricao:'', perguntas:(d && d.perguntas) || []}];
}
const todasDe = d => blocosDe(d).flatMap(b => b.perguntas || []);
function contar(lista){ return lista.reduce((n, q) => n + 1 + contar(q.filhas || []), 0); }
function achatar(lista, pre = '', pai = null, out = [], ini = 0){
  lista.forEach((q, i) => {
    const num = pre ? `${pre}.${i + 1}` : String(ini + i + 1);
    out.push({q, num, pai, nivel: pre ? pre.split('.').length : 0});
    achatar(q.filhas || [], num, q, out);
  });
  return out;
}
function visiveis(lista, vals, out = []){
  for (const q of lista){
    out.push(q);
    for (const c of q.filhas || []) if (condOk(q, c.cond, vals[q.id])) visiveis([c], vals, out);
  }
  return out;
}
function textoResposta(q, v){
  if (vazio(v)) return '';
  if (q.tipo === 'simples') return rotuloOpcao(q, v);
  if (q.tipo === 'multipla') return v.map(id => rotuloOpcao(q, id)).join('; ');
  if (q.tipo === 'data') return fmtD(v);
  if (q.tipo === 'numero') return fmtN(v);
  return String(v);
}

/* ================= estado ================= */
let db = null, uid = null, isAdmin = false, pronto = false;
let questionarios = {};          // id -> dados
let meuDoc = null;               // {porQ:{qid:{respostas, enviadoEm}}} montado das minhas respostas
let eu = null;                   // {uid, nome, email}
let todasRespostas = [];         // somente admin
let edit = null, editDirty = false;
let respSel = null;              // questionário aberto em "Responder"
let relSel = null;               // questionário em "Respostas"
const nomes = {}, emailsDe = {};
let convites = {};               // qid -> {emails:[{email, enviadoEm}], assunto, mensagem}
let convSel = null;              // questionário em "Convidados"
const APP_URL = location.origin + location.pathname;
const linkDe = token => APP_URL + '#r-' + token;
// token secreto do convite: 32 caracteres hexadecimais (128 bits)
const novoToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

// nome e e-mail vêm gravados em cada resposta (login Google)
async function carregarNomes(){}
const nomeDe = id => nomes[id] || emailsDe[id] || (id === uid ? 'Você' : 'Participante');
const lista = () => Object.entries(questionarios).map(([id, d]) => ({id, ...d}))
  .sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
const respostasDe = qid => todasRespostas
  .filter(r => r.qid === qid && r.respostas)
  .sort((a, b) => String(b.enviadoEm || '').localeCompare(String(a.enviadoEm || '')));

/* ================= navegação ================= */
const VIEWS = ['questionarios', 'editor', 'responder', 'respostas', 'convidados'];
let viewAtual = null;
function route(){
  let h = location.hash.slice(1);
  if (modoConvidado || !eu || !isAdmin) return;
  if (!VIEWS.includes(h) || h === 'responder') h = 'questionarios';
  if (h === 'editor' && !edit) h = 'questionarios';
  viewAtual = h;
  for (const v of VIEWS) $('#v-' + v).hidden = v !== h;
  const tabAtiva = h === 'editor' || h === 'convidados' ? 'questionarios' : h;
  for (const t of ['questionarios', 'responder', 'respostas']){
    const a = $('#tab-' + t);
    if (t === tabAtiva) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  render();
}
function ir(h){ if (location.hash === '#' + h) route(); else location.hash = h; }
window.addEventListener('hashchange', route);
function render(){
  if (!pronto) return;
  if (viewAtual === 'questionarios') renderLista();
  else if (viewAtual === 'editor') renderEditor();
  else if (viewAtual === 'responder') renderResponder();
  else if (viewAtual === 'respostas') renderRelatorio();
  else if (viewAtual === 'convidados') renderConvidados();
}
function armar(btn, rotulo, acao){
  // confirmação em dois cliques (o sandbox não permite confirm())
  let t = null; const orig = btn.textContent;
  btn.addEventListener('click', () => {
    if (btn.classList.contains('armed')){ clearTimeout(t); acao(); return; }
    btn.classList.add('armed'); btn.textContent = rotulo;
    t = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = orig; }, 4000);
  });
  return btn;
}

/* ================= lista de questionários (admin) ================= */
function renderLista(){
  const v = $('#v-questionarios');
  v.replaceChildren();
  const qs = lista();
  v.append(el('div', {class:'bar-top'},
    el('div', null, el('h2', {text:'Questionários'}),
      el('p', {class:'muted small', style:'margin:2px 0 0', text:'Cadastre perguntas, escolha o tipo de resposta e defina sub-perguntas que abrem conforme a resposta.'})),
    el('div', {style:'display:flex;gap:8px;flex-wrap:wrap'},
      el('button', {class:'btn primary', type:'button', onclick:() => abrirEditor(null)}, '+ Novo questionário'))));
  if (edit && editDirty){
    v.append(el('p', {class:'notice'}, `Há alterações não salvas em “${edit.titulo || 'Sem título'}”. `,
      el('button', {class:'link', type:'button', onclick:() => ir('editor')}, 'Voltar ao editor')));
  }
  if (!qs.length){
    v.append(el('div', {class:'empty'}, el('h2', {text:'Nenhum questionário ainda'}),
      el('p', {text:'Crie o primeiro questionário e depois cadastre os e-mails em Convidados para enviar o link.'})));
    return;
  }
  const grid = el('div', {class:'cards'});
  for (const q of qs){
    const n = contar(todasDe(q));
    const nb = blocosDe(q).length;
    const nr = respostasDe(q.id).length;
    const del = el('button', {class:'btn sm danger', type:'button'}, 'Excluir');
    armar(del, 'Confirmar exclusão', async () => {
      try { await db.doc('questionarios/' + q.id).delete(); } catch { del.textContent = 'Não foi possível excluir'; }
    });
    grid.append(el('article', {class:'card'},
      el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:start'},
        el('h3', {text:q.titulo || 'Sem título'}),
        el('span', {class:'pill ' + (q.ativo ? 'ok' : 'off'), text:q.ativo ? 'Aberto' : 'Fechado'})),
      q.descricao ? el('p', {class:'muted small', text:q.descricao}) : null,
      el('p', {class:'small muted'}, (nb > 1 ? `${nb} blocos · ` : '') + `${n} ${n === 1 ? 'pergunta' : 'perguntas'} · ${nr} ${nr === 1 ? 'resposta' : 'respostas'}`,
        q.atualizadoEm ? ` · alterado em ${fmtDH(q.atualizadoEm)}` : ''),
      el('div', {class:'acts'},
        el('button', {class:'btn sm primary', type:'button', onclick:() => abrirEditor(q.id)}, 'Editar'),
        el('button', {class:'btn sm', type:'button', onclick:() => { convSel = q.id; ir('convidados'); }}, 'Convidados'),
        el('button', {class:'btn sm', type:'button', onclick:() => { relSel = q.id; ir('respostas'); }}, 'Respostas'),
        el('button', {class:'btn sm', type:'button', onclick:() => duplicar(q)}, 'Duplicar'),
        del)));
  }
  v.append(grid);
}
async function duplicar(q){
  const id = gid('q'), agora = new Date().toISOString();
  try {
    await db.doc('questionarios/' + id).set({id, titulo:(q.titulo || 'Sem título') + ' (cópia)', descricao:q.descricao || '',
      ativo:false, blocos:clone(blocosDe(q)), criadoEm:agora, atualizadoEm:agora});
  } catch {}
}

/* ================= editor ================= */
let previewVals = {}, previewTimer = null;
// perguntas recolhidas no editor (mostram só os dados principais)
const recolhidas = new Set();
const todasPerguntasEdit = () => achatar(edit.blocos.flatMap(b => b.perguntas));
function abrirEditor(id){
  if (edit && editDirty && edit.id === id){ ir('editor'); return; }
  if (id && questionarios[id]){
    const d = questionarios[id];
    edit = {id, titulo:d.titulo || '', descricao:d.descricao || '', ativo:!!d.ativo, somenteConvidados:!!d.somenteConvidados, criadoEm:d.criadoEm || null,
      blocos:clone(blocosDe(d)), novo:false};
  } else {
    edit = {id:gid('q'), titulo:'', descricao:'', ativo:true, somenteConvidados:false, criadoEm:null, blocos:[novoBloco()], novo:true};
  }
  editDirty = !id;
  previewVals = {};
  recolhidas.clear();
  // ao abrir um questionário existente, as perguntas começam recolhidas
  if (id) for (const x of todasPerguntasEdit()) recolhidas.add(x.q.id);
  ir('editor');
}
function sujo(){
  editDirty = true;
  const s = $('#ed-status');
  if (s){ s.textContent = 'Alterações não salvas.'; s.className = 'msg'; }
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 250);
}
function renderEditor(){
  const v = $('#v-editor');
  v.replaceChildren();
  const titulo = el('input', {type:'text', maxlength:'120', placeholder:'Ex.: Levantamento técnico de campo 2026'});
  titulo.value = edit.titulo;
  titulo.addEventListener('input', () => { edit.titulo = titulo.value; sujo(); });
  const desc = el('textarea', {rows:'2', maxlength:'500', placeholder:'Orientação para quem vai responder (opcional)'});
  desc.value = edit.descricao;
  desc.addEventListener('input', () => { edit.descricao = desc.value; sujo(); });
  const ativo = el('input', {type:'checkbox'});
  ativo.checked = edit.ativo;
  ativo.addEventListener('change', () => { edit.ativo = ativo.checked; sujo(); });
  const soConv = el('input', {type:'checkbox'});
  soConv.checked = !!edit.somenteConvidados;
  soConv.addEventListener('change', () => { edit.somenteConvidados = soConv.checked; sujo(); });

  const tools = el('div', {class:'b-tools'},
    el('span', {class:'muted small', text:'Detalhes das perguntas:'}),
    el('button', {class:'btn sm', type:'button', onclick:() => { for (const x of todasPerguntasEdit()) recolhidas.add(x.q.id); renderArvore(); }}, 'Recolher todas'),
    el('button', {class:'btn sm', type:'button', onclick:() => { recolhidas.clear(); renderArvore(); }}, 'Expandir todas'));
  const tree = el('div', {class:'b-tree', id:'b-tree'});
  const builder = el('div', null,
    el('div', {class:'bar-top'},
      el('button', {class:'link', type:'button', onclick:() => ir('questionarios')}, '← Questionários'),
      el('span', {class:'muted small', text:edit.novo ? 'Novo questionário' : 'Editando questionário'})),
    el('div', {class:'panel ed-head'},
      el('label', {class:'f'}, 'Título do questionário', titulo),
      el('label', {class:'f'}, 'Descrição', desc),
      el('label', {class:'chk'}, ativo, 'Ativo')),
    tools,
    tree,
    el('div', {style:'margin-top:12px'},
      el('button', {class:'btn', type:'button', onclick:() => { edit.blocos.push(novoBloco()); sujo(); renderArvore(); }}, '+ Novo bloco'),
      el('span', {class:'muted small', style:'margin-left:10px', text:'Blocos separam assuntos dentro do mesmo questionário.'})),
    el('div', {id:'ed-errs'}),
    el('div', {class:'ed-save'},
      el('button', {class:'btn primary', type:'button', id:'ed-salvar', onclick:salvar}, 'Salvar questionário'),
      el('span', {class:'msg', id:'ed-status', role:'status', 'aria-live':'polite', text:editDirty ? 'Alterações não salvas.' : 'Tudo salvo.'}),
      el('span', {style:'margin-left:auto'},
        el('button', {class:'btn sm', type:'button', onclick:descartar}, editDirty ? 'Descartar alterações' : 'Fechar'))));

  const prev = el('aside', {class:'panel ed-preview', 'aria-label':'Pré-visualização'},
    el('div', {style:'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px'},
      el('h2', {text:'Pré-visualização'}),
      el('button', {class:'btn sm', type:'button', onclick:() => { previewVals = {}; renderPreview(); }}, 'Limpar respostas')),
    el('p', {class:'muted small', style:'margin:0 0 10px', text:'Responda aqui para testar as sub-perguntas. Nada é salvo.'}),
    el('div', {id:'preview'}));
  v.append(el('div', {class:'ed-grid'}, builder, prev));
  renderArvore();
  renderPreview();
}
function descartar(){
  edit = null; editDirty = false;
  ir('questionarios');
}
function renderArvore(){
  const tree = $('#b-tree');
  if (!tree) return;
  const y = window.scrollY;
  let off = 0;
  tree.replaceChildren(...edit.blocos.map((b, bi) => { const n = bBloco(b, bi, off); off += b.perguntas.length; return n; }));
  window.scrollTo(0, y);
}
function renderPreview(){
  const host = $('#preview');
  if (!host || !edit) return;
  if (!edit.blocos.some(b => b.perguntas.length)){ host.replaceChildren(el('p', {class:'muted small', text:'Adicione perguntas para ver a prévia.'})); return; }
  host.replaceChildren(renderForm(edit.blocos, previewVals, 'pv').el);
}
function mover(lista, i, d){
  const j = i + d;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  sujo(); renderArvore();
}
function bBloco(b, bi, off){
  const total = edit.blocos.length;
  const tit = el('input', {type:'text', class:'blk-titulo', maxlength:'120', placeholder:'Título do bloco (ex.: Programas técnicos)', 'aria-label':`Título do bloco ${bi + 1}`});
  tit.value = b.titulo;
  tit.addEventListener('input', () => {
    b.titulo = tit.value; sujo();
    for (const o of document.querySelectorAll(`#b-tree select.sel-bloco option[value="${bi}"]`)) o.textContent = b.titulo.trim() || `Bloco ${bi + 1}`;
  });
  const desc = el('input', {type:'text', maxlength:'300', placeholder:'Descrição do bloco (opcional)', 'aria-label':`Descrição do bloco ${bi + 1}`});
  desc.value = b.descricao;
  desc.addEventListener('input', () => { b.descricao = desc.value; sujo(); });
  const btns = el('div', {class:'bq-btns'},
    el('button', {class:'icon', type:'button', title:'Mover bloco para cima', 'aria-label':`Mover bloco ${bi + 1} para cima`, disabled:bi === 0, onclick:() => mover(edit.blocos, bi, -1)}, '↑'),
    el('button', {class:'icon', type:'button', title:'Mover bloco para baixo', 'aria-label':`Mover bloco ${bi + 1} para baixo`, disabled:bi === total - 1, onclick:() => mover(edit.blocos, bi, 1)}, '↓'));
  if (total > 1){
    const n = b.perguntas.length;
    const del = el('button', {class:'icon del', type:'button', 'aria-label':`Excluir bloco ${bi + 1}`}, 'Excluir bloco');
    armar(del, n ? `Excluir com ${n} ${n === 1 ? 'pergunta' : 'perguntas'}` : 'Confirmar', () => { edit.blocos.splice(bi, 1); sujo(); renderArvore(); });
    btns.append(del);
  }
  const body = el('div', {class:'blk-body'}, b.perguntas.map((q, i) => bCard(q, String(off + i + 1), null, b.perguntas, i, bi)));
  if (!b.perguntas.length) body.append(el('p', {class:'muted small', style:'margin:0', text:'Bloco sem perguntas.'}));
  return el('section', {class:'blk', 'aria-label':`Bloco ${bi + 1}`},
    el('div', {class:'blk-head'}, el('span', {class:'blk-tag', text:`Bloco ${bi + 1}`}),
      el('div', {style:'display:grid;gap:6px'}, tit, desc), btns),
    body,
    el('div', {style:'margin-top:12px'},
      el('button', {class:'btn sm', type:'button', onclick:() => { b.perguntas.push(novaPergunta()); sujo(); renderArvore(); }}, '+ Pergunta neste bloco')));
}
function bCard(q, num, pai, irmas, idx, bi){
  const card = el('div', {class:'bq' + (pai ? ' sub' : '')});

  // condição (só sub-perguntas)
  if (pai){
    if (!q.cond || !OPS[pai.tipo].some(o => o[0] === q.cond.op)) q.cond = condPadrao(pai);
    card.append(recolhidas.has(q.id)
      ? el('p', {class:'sq-cond', style:'margin:0 0 8px', text:descreveCond(pai, q.cond)})
      : condEditor(q, pai, num.split('.').slice(0, -1).join('.')));
  }

  const txt = el('textarea', {rows:'1', maxlength:'300', placeholder:pai ? 'Texto da sub-pergunta' : 'Texto da pergunta', 'aria-label':`Texto da pergunta ${num}`});
  txt.value = q.texto;
  txt.addEventListener('input', () => { q.texto = txt.value; sujo(); });
  const btns = el('div', {class:'bq-btns'},
    el('button', {class:'icon', type:'button', title:'Mover para cima', 'aria-label':`Mover pergunta ${num} para cima`, disabled:idx === 0, onclick:() => mover(irmas, idx, -1)}, '↑'),
    el('button', {class:'icon', type:'button', title:'Mover para baixo', 'aria-label':`Mover pergunta ${num} para baixo`, disabled:idx === irmas.length - 1, onclick:() => mover(irmas, idx, 1)}, '↓'));
  const del = el('button', {class:'icon del', type:'button', title:'Excluir pergunta', 'aria-label':`Excluir pergunta ${num}`}, 'Excluir');
  armar(del, 'Confirmar', () => { irmas.splice(idx, 1); sujo(); renderArvore(); });
  btns.append(del);
  const fechado = recolhidas.has(q.id);
  const tog = el('button', {class:'icon tog', type:'button', 'aria-expanded':String(!fechado),
    title:fechado ? 'Mostrar detalhes' : 'Ocultar detalhes', 'aria-label':(fechado ? 'Mostrar' : 'Ocultar') + ` detalhes da pergunta ${num}`,
    onclick:() => { if (fechado) recolhidas.delete(q.id); else recolhidas.add(q.id); renderArvore(); }}, fechado ? '▸' : '▾');
  card.append(el('div', {class:'bq-top'}, tog, el('span', {class:'num', text:num}), txt, btns));
  if (fechado){
    // versão compacta: número, texto e um resumo do restante
    card.classList.add('fechado');
    const chip = t => el('span', {class:'chip-res', text:t});
    const nSub = contar(q.filhas);
    const ops = TEM_OPCOES(q.tipo) ? q.opcoes.map(o => o.rotulo.trim() || '(sem texto)') : [];
    card.append(el('div', {class:'bq-resumo'},
      chip(TIPOS[q.tipo]),
      q.obrigatoria ? chip('Obrigatória') : null,
      ops.length ? chip(ops.length <= 4 ? ops.join(' · ') : `${ops.length} opções`) : null,
      nSub ? chip(nSub === 1 ? '1 sub-pergunta' : `${nSub} sub-perguntas`) : null));
    return card;
  }

  // tipo e obrigatoriedade
  const tipo = el('select', {'aria-label':`Tipo de resposta da pergunta ${num}`},
    Object.entries(TIPOS).map(([k, t]) => el('option', {value:k, text:t})));
  tipo.value = q.tipo;
  tipo.addEventListener('change', () => {
    q.tipo = tipo.value;
    if (TEM_OPCOES(q.tipo) && !(q.opcoes && q.opcoes.length))
      q.opcoes = q.tipo === 'simples'
        ? [{id:gid('o'), rotulo:'Sim'}, {id:gid('o'), rotulo:'Não'}]
        : [{id:gid('o'), rotulo:'Opção 1'}, {id:gid('o'), rotulo:'Opção 2'}];
    for (const f of q.filhas) f.cond = condPadrao(q);
    sujo(); renderArvore();
  });
  const obr = el('input', {type:'checkbox'});
  obr.checked = !!q.obrigatoria;
  obr.addEventListener('change', () => { q.obrigatoria = obr.checked; sujo(); });
  const ajuda = el('input', {type:'text', maxlength:'200', placeholder:'Texto de ajuda (opcional)', 'aria-label':`Texto de ajuda da pergunta ${num}`});
  ajuda.value = q.ajuda || '';
  ajuda.addEventListener('input', () => { q.ajuda = ajuda.value; sujo(); });
  let moverBloco = null;
  if (!pai && edit.blocos.length > 1){
    moverBloco = el('select', {class:'sel-bloco', 'aria-label':`Bloco da pergunta ${num}`, style:'min-width:10rem'},
      edit.blocos.map((b, i) => el('option', {value:String(i), text:b.titulo.trim() || `Bloco ${i + 1}`})));
    moverBloco.value = String(bi);
    moverBloco.addEventListener('change', () => {
      const [q2] = irmas.splice(idx, 1);
      edit.blocos[Number(moverBloco.value)].perguntas.push(q2);
      sujo(); renderArvore();
    });
  }
  card.append(el('div', {class:'bq-row'},
    el('label', {class:'f', style:'flex-direction:row;align-items:center;gap:8px'}, 'Resposta:', tipo),
    el('label', {class:'chk'}, obr, 'Obrigatória'),
    moverBloco ? el('label', {class:'f', style:'flex-direction:row;align-items:center;gap:8px'}, 'Bloco:', moverBloco) : null));
  card.append(el('div', {style:'margin-top:8px'}, ajuda));

  // opções
  if (TEM_OPCOES(q.tipo)){
    const box = el('div', {class:'opts'});
    q.opcoes.forEach((o, i) => {
      const inp = el('input', {type:'text', maxlength:'120', placeholder:`Opção ${i + 1}`, 'aria-label':`Opção ${i + 1} da pergunta ${num}`});
      inp.value = o.rotulo;
      inp.addEventListener('input', () => {
        o.rotulo = inp.value; sujo();
        for (const op of document.querySelectorAll(`#b-tree .cond option[value="${o.id}"]`)) op.textContent = o.rotulo || '(opção sem texto)';
      });
      const rm = el('button', {class:'icon del', type:'button', title:'Remover opção', 'aria-label':`Remover opção ${i + 1}`, disabled:q.opcoes.length <= 1,
        onclick:() => {
          q.opcoes.splice(i, 1);
          for (const f of q.filhas) if (f.cond && f.cond.valor === o.id) f.cond.valor = '';
          sujo(); renderArvore();
        }}, '×');
      box.append(el('div', {class:'opt'}, el('span', {class:'dot' + (q.tipo === 'multipla' ? ' sq' : '')}), inp, rm));
    });
    box.append(el('div', null, el('button', {class:'btn sm', type:'button', onclick:() => {
      q.opcoes.push({id:gid('o'), rotulo:''}); sujo(); renderArvore();
    }}, '+ Opção')));
    card.append(box);
  }

  // sub-perguntas
  if (q.filhas.length){
    card.append(el('div', {class:'kids'}, q.filhas.map((f, i) => bCard(f, `${num}.${i + 1}`, q, q.filhas, i, bi))));
  }
  card.append(el('div', {class:'add-sub'},
    el('button', {class:'btn sm', type:'button', onclick:() => { q.filhas.push(novaFilha(q)); sujo(); renderArvore(); }},
      `+ Sub-pergunta condicional`)));
  return card;
}
function condEditor(q, pai, numPai){
  const c = q.cond;
  const box = el('div', {class:'cond'});
  const opSel = el('select', {'aria-label':'Condição'}, OPS[pai.tipo].map(([k, t]) => el('option', {value:k, text:t})));
  opSel.value = c.op;
  let valCtrl = null;
  if (TEM_OPCOES(pai.tipo)){
    valCtrl = el('select', {'aria-label':'Opção'},
      el('option', {value:'', text:'(escolha a opção)'}),
      pai.opcoes.map(o => el('option', {value:o.id, text:o.rotulo || '(opção sem texto)'})));
    valCtrl.value = pai.opcoes.some(o => o.id === c.valor) ? c.valor : '';
    valCtrl.addEventListener('change', () => { c.valor = valCtrl.value; box.classList.toggle('bad', !c.valor); sujo(); });
  } else {
    valCtrl = el('input', {type:pai.tipo === 'numero' ? 'number' : pai.tipo === 'data' ? 'date' : 'text', step:'any', 'aria-label':'Valor'});
    valCtrl.value = c.valor ?? '';
    valCtrl.addEventListener('input', () => { c.valor = valCtrl.value; box.classList.toggle('bad', !c.valor); sujo(); });
  }
  const sync = () => {
    valCtrl.hidden = !precisaValor(c.op);
    box.classList.toggle('bad', precisaValor(c.op) && (c.valor === '' || c.valor == null));
  };
  opSel.addEventListener('change', () => { c.op = opSel.value; sync(); sujo(); });
  box.append(el('span', {text:`Abre quando a resposta da pergunta ${numPai}`}), opSel, valCtrl);
  sync();
  return box;
}
function validarEdicao(){
  const errs = [];
  if (!edit.titulo.trim()) errs.push('Informe o título do questionário.');
  const varios = edit.blocos.length > 1;
  edit.blocos.forEach((b, i) => {
    const nome = b.titulo.trim() || `Bloco ${i + 1}`;
    if (varios && !b.titulo.trim()) errs.push(`Bloco ${i + 1}: falta o título.`);
    if (!b.perguntas.length) errs.push(`${nome}: o bloco está sem perguntas.`);
  });
  const lista = achatar(edit.blocos.flatMap(b => b.perguntas));
  const paiDe = new Map(lista.map(x => [x.q.id, x.pai]));
  const abrir = q => { for (let x = q; x; x = paiDe.get(x.id)) recolhidas.delete(x.id); };
  for (const {q, num, pai} of lista){
    const antes = errs.length;
    if (!q.texto.trim()) errs.push(`Pergunta ${num}: falta o texto.`);
    if (TEM_OPCOES(q.tipo)){
      const vals = q.opcoes.map(o => o.rotulo.trim());
      if (vals.filter(Boolean).length < q.opcoes.length) errs.push(`Pergunta ${num}: há opção sem texto.`);
      if (q.opcoes.length < 2 && q.tipo === 'simples') errs.push(`Pergunta ${num}: opções simples precisam de pelo menos 2 opções.`);
    }
    if (pai && precisaValor(q.cond.op) && (q.cond.valor === '' || q.cond.valor == null))
      errs.push(`Pergunta ${num}: escolha o valor que abre esta sub-pergunta.`);
    if (errs.length > antes) abrir(q);
  }
  return errs;
}
function limpar(lista){
  return lista.map(q => {
    const o = {id:q.id, texto:q.texto.trim(), tipo:q.tipo, obrigatoria:!!q.obrigatoria, ajuda:(q.ajuda || '').trim(),
      opcoes:TEM_OPCOES(q.tipo) ? q.opcoes.map(x => ({id:x.id, rotulo:x.rotulo.trim()})) : [],
      filhas:limpar(q.filhas || [])};
    if (q.cond) o.cond = {op:q.cond.op, valor:precisaValor(q.cond.op) ? q.cond.valor : ''};
    return o;
  });
}
async function salvar(){
  const errBox = $('#ed-errs'), st = $('#ed-status'), btn = $('#ed-salvar');
  const errs = validarEdicao();
  errBox.replaceChildren();
  if (errs.length){
    errBox.append(el('ul', {class:'errs', style:'margin-top:12px'}, errs.map(e => el('li', {text:e}))));
    st.textContent = 'Corrija os itens acima para salvar.'; st.className = 'msg err';
    renderArvore();   // perguntas com erro são expandidas
    return;
  }
  if (!db){ st.textContent = 'Entre com a sua conta para salvar.'; st.className = 'msg err'; return; }
  btn.disabled = true; st.textContent = 'Salvando…'; st.className = 'msg';
  const agora = new Date().toISOString();
  try {
    await db.doc('questionarios/' + edit.id).set({id:edit.id, titulo:edit.titulo.trim(), descricao:edit.descricao.trim(),
      ativo:edit.ativo, somenteConvidados:!!edit.somenteConvidados, blocos:edit.blocos.map(b => ({id:b.id, titulo:b.titulo.trim(), descricao:b.descricao.trim(), perguntas:limpar(b.perguntas)})), criadoEm:edit.criadoEm || agora, atualizadoEm:agora});
    edit.criadoEm = edit.criadoEm || agora; edit.novo = false; editDirty = false;
    st.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) + '.'; st.className = 'msg ok';
  } catch {
    st.textContent = 'Não foi possível salvar agora. Tente novamente.'; st.className = 'msg err';
  } finally { btn.disabled = false; }
}

/* ================= formulário de resposta ================= */
function renderForm(secoes, vals, prefixo){
  const perguntas = secoes.flatMap(b => b.perguntas || []);
  const blocos = [];
  function controle(q, aoMudar){
    const nm = `${prefixo}-${q.id}`;
    if (TEM_OPCOES(q.tipo)){
      const box = el('div', {class:'fq-ctrl choices', role:q.tipo === 'simples' ? 'radiogroup' : 'group', 'aria-labelledby':nm + '-lb'});
      const inps = [];
      for (const o of q.opcoes){
        const inp = el('input', {type:q.tipo === 'simples' ? 'radio' : 'checkbox', name:nm, value:o.id});
        if (q.tipo === 'simples') inp.checked = vals[q.id] === o.id;
        else inp.checked = Array.isArray(vals[q.id]) && vals[q.id].includes(o.id);
        inp.addEventListener('change', () => {
          if (q.tipo === 'simples') vals[q.id] = o.id;
          else vals[q.id] = inps.filter(i => i.checked).map(i => i.value);
          aoMudar();
        });
        inps.push(inp);
        box.append(el('label', {class:'choice'}, inp, el('span', {text:o.rotulo || '(opção sem texto)'})));
      }
      return {el:box, focar:() => inps[0] && inps[0].focus()};
    }
    let inp;
    if (q.tipo === 'texto'){
      inp = el('textarea', {rows:'2', maxlength:'2000', id:nm});
      inp.value = vals[q.id] ?? '';
      inp.addEventListener('input', () => { vals[q.id] = inp.value; aoMudar(); });
    } else if (q.tipo === 'numero'){
      inp = el('input', {type:'number', step:'any', inputmode:'decimal', id:nm});
      inp.value = vals[q.id] ?? '';
      inp.addEventListener('input', () => { const n = parseFloat(inp.value); if (Number.isFinite(n)) vals[q.id] = n; else delete vals[q.id]; aoMudar(); });
    } else {
      inp = el('input', {type:'date', id:nm});
      inp.value = vals[q.id] ?? '';
      const f = () => { if (inp.value) vals[q.id] = inp.value; else delete vals[q.id]; aoMudar(); };
      inp.addEventListener('change', f); inp.addEventListener('input', f);
    }
    return {el:el('div', {class:'fq-ctrl'}, inp), focar:() => inp.focus()};
  }
  function bloco(q, num, sub){
    const nm = `${prefixo}-${q.id}`;
    const err = el('p', {class:'fq-err', hidden:true});
    const kids = [];
    let wrap;
    const refresh = () => { for (const [c, w] of kids) w.hidden = !condOk(q, c.cond, vals[q.id]); };
    const ctrl = controle(q, () => { err.hidden = true; wrap.classList.remove('has-err'); refresh(); });
    const head = TEM_OPCOES(q.tipo)
      ? el('div', {class:'fq-head', id:nm + '-lb'}, el('span', {class:'num', text:num}), el('span', {class:'fq-txt', text:q.texto || '(pergunta sem texto)'}),
          q.obrigatoria ? el('span', {class:'req', title:'Obrigatória', text:'*'}) : null)
      : el('label', {class:'fq-head', for:nm, id:nm + '-lb'}, el('span', {class:'num', text:num}), el('span', {class:'fq-txt', text:q.texto || '(pergunta sem texto)'}),
          q.obrigatoria ? el('span', {class:'req', title:'Obrigatória', text:'*'}) : null);
    wrap = el('div', {class:'fq' + (sub ? ' sub' : '')}, head,
      q.ajuda ? el('p', {class:'fq-help', text:q.ajuda}) : null, ctrl.el, err);
    (q.filhas || []).forEach((c, i) => { const w = bloco(c, `${num}.${i + 1}`, true); kids.push([c, w]); wrap.append(w); });
    refresh();
    blocos.push({q, wrap, err, focar:ctrl.focar});
    return wrap;
  }
  let off = 0;
  const comTitulo = secoes.length > 1 || secoes.some(b => b.titulo);
  const root = el('div', null, secoes.map(b => {
    const ini = off; off += (b.perguntas || []).length;
    return el('section', {class:'fb'},
      comTitulo ? el('div', {class:'fb-head'}, el('h3', {text:b.titulo || 'Sem título'}),
        b.descricao ? el('p', {class:'fb-desc', text:b.descricao}) : null) : null,
      el('div', null, (b.perguntas || []).map((q, i) => bloco(q, String(ini + i + 1), false))));
  }));
  function validar(){
    const vis = new Set(visiveis(perguntas, vals).map(q => q.id));
    let primeiro = null, n = 0;
    for (const b of blocos){
      const falta = vis.has(b.q.id) && b.q.obrigatoria && vazio(vals[b.q.id]);
      b.err.hidden = !falta; b.err.textContent = falta ? 'Responda esta pergunta.' : '';
      b.wrap.classList.toggle('has-err', falta);
      if (falta){ n++; if (!primeiro) primeiro = b; }
    }
    // blocos foram empilhados em pós-ordem; o primeiro visual é o de menor posição no documento
    const erros = blocos.filter(b => !b.err.hidden).sort((a, b) => a.wrap.compareDocumentPosition(b.wrap) & 4 ? -1 : 1);
    if (erros[0]){ erros[0].wrap.scrollIntoView({block:'center', behavior:'smooth'}); erros[0].focar(); }
    return n;
  }
  function podadas(){
    const out = {};
    for (const q of visiveis(perguntas, vals)) if (!vazio(vals[q.id])) out[q.id] = vals[q.id];
    return out;
  }
  return {el:root, validar, podadas};
}

/* ================= responder ================= */
function renderResponder(){
  const v = $('#v-responder');
  v.replaceChildren();
  if (respSel && questionarios[respSel]) return renderFormResposta(v, respSel);
  respSel = null;
  const abertos = lista().filter(q => q.ativo);
  v.append(el('div', {class:'bar-top'}, el('div', null, el('h2', {text:'Questionários para responder'}),
    el('p', {class:'muted small', style:'margin:2px 0 0', text:'Escolha um questionário. Você pode voltar e alterar suas respostas enquanto ele estiver aberto.'}))));
  if (!abertos.length){
    v.append(el('div', {class:'empty'}, el('h2', {text:'Nenhum questionário aberto'}),
      el('p', {text:isAdmin ? 'Crie um questionário na aba Questionários e marque “Ativo”.' : 'Quando houver um questionário aberto, ele aparece aqui.'})));
    return;
  }
  const grid = el('div', {class:'cards'});
  for (const q of abertos){
    const minha = meuDoc && meuDoc.porQ && meuDoc.porQ[q.id];
    grid.append(el('article', {class:'card'},
      el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:start'},
        el('h3', {text:q.titulo || 'Sem título'}),
        el('span', {class:'pill ' + (minha ? 'ok' : 'warn'), text:minha ? 'Respondido' : 'Pendente'})),
      q.descricao ? el('p', {class:'muted small', text:q.descricao}) : null,
      minha && minha.enviadoEm ? el('p', {class:'small muted', text:'Enviado em ' + fmtDH(minha.enviadoEm)}) : null,
      el('div', {class:'acts'}, el('button', {class:'btn sm primary', type:'button', onclick:() => { respSel = q.id; renderResponder(); window.scrollTo(0, 0); }},
        minha ? 'Ver ou alterar' : 'Responder'))));
  }
  v.append(grid);
}
function renderFormResposta(v, qid){
  const q = questionarios[qid];
  const minha = meuDoc && meuDoc.porQ && meuDoc.porQ[qid];
  const vals = clone((minha && minha.respostas) || {});
  const form = renderForm(blocosDe(q), vals, 'r');
  const st = el('p', {class:'msg', role:'status', 'aria-live':'polite'});
  const btn = el('button', {class:'btn primary', type:'submit'}, minha ? 'Atualizar resposta' : 'Enviar resposta');
  const f = el('form', {novalidate:true, class:'panel'}, form.el,
    el('div', {style:'display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--line)'}, btn, st));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!q.ativo){ st.textContent = 'Este questionário foi fechado para respostas.'; st.className = 'msg err'; return; }
    const n = form.validar();
    if (n){ st.textContent = n === 1 ? 'Falta responder 1 pergunta obrigatória.' : `Faltam ${n} perguntas obrigatórias.`; st.className = 'msg err'; return; }
    if (!db || !uid){ st.textContent = 'Entre com a sua conta para enviar.'; st.className = 'msg err'; return; }
    btn.disabled = true; st.textContent = 'Enviando…'; st.className = 'msg';
    const agora = new Date().toISOString();
    const respostas = form.podadas();
    try {
      await db.doc('respostas/' + qid + '_' + uid).set({qid, uid, nome:eu.nome, email:eu.email, respostas, enviadoEm:agora});
      meuDoc = meuDoc || {porQ:{}};
      meuDoc.porQ[qid] = {respostas, enviadoEm:agora};
      st.textContent = 'Resposta enviada. Obrigado!'; st.className = 'msg ok';
      btn.textContent = 'Atualizar resposta';
    } catch (e) {
      st.textContent = e && e.code === 'permission-denied'
        ? (q.somenteConvidados ? 'Seu e-mail (' + eu.email + ') não está na lista de convidados deste questionário.' : 'Este questionário não aceita mais respostas.')
        : 'Não foi possível enviar agora. Verifique a conexão e tente novamente.';
      st.className = 'msg err';
    } finally { btn.disabled = false; }
  });
  v.append(
    el('div', {class:'bar-top'}, el('button', {class:'link', type:'button', onclick:() => { respSel = null; renderResponder(); }}, '← Todos os questionários')),
    el('div', {style:'margin-bottom:14px'}, el('h2', {text:q.titulo || 'Sem título'}),
      q.descricao ? el('p', {class:'muted', style:'margin:4px 0 0;max-width:70ch', text:q.descricao}) : null,
      minha && minha.enviadoEm ? el('p', {class:'small muted', style:'margin:4px 0 0', text:'Sua última resposta foi enviada em ' + fmtDH(minha.enviadoEm) + '.'}) : null,
      !q.ativo ? el('p', {class:'notice', style:'margin-top:10px', text:'Este questionário está fechado para novas respostas.'}) : null,
      el('p', {class:'small muted', style:'margin:6px 0 0'}, el('span', {class:'req', text:'*'}), ' obrigatória')),
    f);
}

/* ================= convidados ================= */
const MSG_PADRAO = {
  assunto:'Questionário: {titulo}',
  mensagem:'Olá,\n\nVocê foi convidado(a) a responder o questionário “{titulo}”.\n\nPara responder, abra o seu link pessoal abaixo. Não precisa de login nem senha:\n{link}\n\nEste link é só seu, não o encaminhe.\n\nObrigado!'
};
let enviando = false, msgEnvio = null;   // {qid, texto, tipo}
const RE_EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
function preencher(txt, q, token){ return String(txt || '').split('{titulo}').join(q.titulo || '').split('{link}').join(token ? linkDe(token) : '{link}'); }
function convDe(qid){
  const c = convites[qid] || {};
  return {emails:Array.isArray(c.emails) ? c.emails : [], assunto:c.assunto ?? MSG_PADRAO.assunto, mensagem:c.mensagem ?? MSG_PADRAO.mensagem};
}
async function salvarConv(qid, c, extra = []){
  // "lista" (só os endereços) facilita consultas; cada convidado tem um token em tokens/{token}
  const dados = {qid, emails:c.emails, lista:c.emails.map(x => x.email), assunto:c.assunto, mensagem:c.mensagem, atualizadoEm:new Date().toISOString()};
  await db.lote([{set:'convites/' + qid, data:dados}, ...extra]);
  convites[qid] = clone(dados);
}
// convidados antigos, cadastrados antes dos links pessoais, ganham token aqui
async function garantirTokens(qid){
  const c = clone(convDe(qid));
  const faltam = c.emails.filter(x => !x.token);
  if (!faltam.length) return c;
  const agora = new Date().toISOString();
  const ops = faltam.map(x => { x.token = novoToken(); return {set:'tokens/' + x.token, data:{qid, email:x.email, criadoEm:agora}}; });
  await salvarConv(qid, c, ops);
  return c;
}
async function copiar(btn, texto, rotulo){
  try { await navigator.clipboard.writeText(texto); btn.textContent = 'Copiado'; }
  catch { btn.textContent = 'Não foi possível copiar'; }
  setTimeout(() => { btn.textContent = rotulo; }, 2500);
}

const nomeServico = () => 'Gmail';
const tokenEnvio = () => tokenGmail();
const enviarEmail = (para, assunto, corpo) => enviarGmail(para, assunto, corpo);

/* Envio pelo Gmail do administrador: pede a permissão gmail.send no login Google
   e chama a API do Gmail direto do navegador, com a conta de quem está logado. */
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
let gmailToken = null, gmailExp = 0;
async function tokenGmail(){
  if (gmailToken && Date.now() < gmailExp) return gmailToken;
  const prov = new GoogleAuthProvider();
  prov.addScope(GMAIL_SCOPE);
  prov.setCustomParameters({login_hint:eu.email});
  const r = await reauthenticateWithPopup(auth.currentUser, prov);
  const cred = GoogleAuthProvider.credentialFromResult(r);
  if (!cred || !cred.accessToken) throw {code:'sem_token'};
  gmailToken = cred.accessToken;
  gmailExp = Date.now() + 50 * 60 * 1000;
  return gmailToken;
}
function b64utf8(txt){
  const bytes = new TextEncoder().encode(txt);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function mensagemMime(para, assunto, corpo){
  const linhas = [
    'To: ' + para,
    'Subject: =?UTF-8?B?' + b64utf8(assunto) + '?=',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    (b64utf8(corpo).match(/.{1,76}/g) || []).join('\r\n')
  ];
  return b64utf8(linhas.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function enviarGmail(para, assunto, corpo){
  const token = await tokenGmail();
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:'POST',
    headers:{'Authorization':'Bearer ' + token, 'Content-Type':'application/json'},
    body:JSON.stringify({raw:mensagemMime(para, assunto, corpo)})
  });
  if (r.ok) return r.json();
  let det = '';
  try { const j = await r.json(); det = j && j.error && j.error.message || ''; } catch {}
  if (r.status === 401){ gmailToken = null; throw {code:'expirou'}; }
  throw {code:'gmail_' + r.status, message:det};
}
function erroGmail(e){
  const c = e && e.code, sv = nomeServico(), conta = 'Google';
  if (c === 'auth/popup-blocked') return 'O navegador bloqueou a janela de autorização. Permita pop-ups para este site e clique de novo.';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'A janela de autorização foi fechada antes de liberar o envio.';
  if (c === 'auth/user-mismatch') return 'Autorize com a mesma conta ' + conta + ' com que você entrou no app.';
  if (c === 'expirou') return 'A autorização do ' + sv + ' expirou. Clique de novo para continuar os envios.';
  if (c === 'sem_token') return 'A ' + conta + ' não devolveu a permissão de envio. Clique de novo e aceite enviar e-mail em seu nome.';
  if (c === 'gmail_403') return 'O ' + sv + ' recusou o envio (' + (e.message || 'sem permissão') + ').';
  if (c === 'gmail_429') return 'Limite de envios do ' + sv + ' atingido. Espere alguns minutos e use “Enviar para quem ainda não recebeu”.';
  if (String(c || '').startsWith('gmail_')) return 'O ' + sv + ' recusou o envio: ' + (e.message || c) + '.';
  if (e instanceof TypeError) return 'Sem conexão com o ' + sv + '. Verifique a internet e tente de novo.';
  return 'Não foi possível enviar (' + (c || 'erro') + '). Os demais envios foram interrompidos.';
}

async function renderConvidados(){
  const v = $('#v-convidados');
  const qs = lista();
  if (!convSel || !questionarios[convSel]) convSel = qs[0] ? qs[0].id : null;
  if (!convSel){
    v.replaceChildren(el('div', {class:'empty'}, el('h2', {text:'Nenhum questionário'}), el('p', {text:'Crie um questionário para convidar pessoas.'})));
    return;
  }
  const q = {id:convSel, ...questionarios[convSel]};
  const rs = respostasDe(convSel);
  await carregarNomes(rs.map(r => r.uid));
  if (viewAtual !== 'convidados') return;
  const respondeu = {};
  for (const r of rs){ const em = emailsDe[r.uid]; if (em) respondeu[em] = r.enviadoEm; }
  const c = convDe(convSel);
  const emails = c.emails;
  const nResp = emails.filter(x => respondeu[x.email]).length;
  const naoEnviados = emails.filter(x => !x.enviadoEm);
  const pendentes = emails.filter(x => !respondeu[x.email]);
  v.replaceChildren();

  const sel = el('select', {'aria-label':'Questionário', style:'width:auto;min-width:16rem'}, qs.map(x => el('option', {value:x.id, text:x.titulo || 'Sem título'})));
  sel.value = convSel;
  sel.addEventListener('change', () => { convSel = sel.value; renderConvidados(); });
  v.append(el('div', {class:'bar-top'},
    el('div', {style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'},
      el('button', {class:'link', type:'button', onclick:() => ir('questionarios')}, '← Questionários'),
      el('h2', {text:'Convidados de'}), sel)));
  if (!q.ativo) v.append(el('p', {class:'notice', text:'Este questionário está fechado. Marque “Ativo” no editor antes de enviar os convites.'}));

  // adicionar e-mails
  const ta = el('textarea', {rows:'4', placeholder:'Cole os e-mails aqui, separados por vírgula, ponto e vírgula ou um por linha', 'aria-label':'E-mails para adicionar'});
  const stAdd = el('p', {class:'msg', role:'status', 'aria-live':'polite'});
  const bAdd = el('button', {class:'btn primary', type:'button'}, 'Adicionar à lista');
  bAdd.addEventListener('click', async () => {
    const achados = [...new Set((ta.value.match(RE_EMAIL) || []).map(e => e.toLowerCase()))];
    if (!achados.length){ stAdd.textContent = 'Nenhum e-mail válido encontrado no texto.'; stAdd.className = 'msg err'; return; }
    const ja = new Set(emails.map(x => x.email));
    const novos = achados.filter(e => !ja.has(e));
    if (!novos.length){ stAdd.textContent = 'Todos esses e-mails já estão na lista.'; stAdd.className = 'msg'; return; }
    bAdd.disabled = true;
    try {
      const agora = new Date().toISOString();
      const itens = novos.map(e => ({email:e, token:novoToken(), enviadoEm:null}));
      await salvarConv(q.id, {...c, emails:[...emails, ...itens]}, itens.map(x => ({set:'tokens/' + x.token, data:{qid:q.id, email:x.email, criadoEm:agora}})));
      ta.value = '';
      renderConvidados();
    } catch { stAdd.textContent = 'Não foi possível salvar a lista. Tente novamente.'; stAdd.className = 'msg err'; bAdd.disabled = false; }
  });
  v.append(el('div', {class:'grid2'},
    el('div', {class:'panel'}, el('h3', {text:'Adicionar e-mails'}),
      el('p', {class:'muted small', style:'margin:0 0 8px', text:'Pode colar uma lista do Excel ou do Outlook: o app separa os endereços e ignora repetidos.'}),
      ta, el('div', {class:'row-acts'}, bAdd), stAdd),
    el('div', {class:'panel'}, el('h3', {text:'Links pessoais'}),
      el('p', {class:'muted small', style:'margin:0 0 8px', text:'Cada convidado recebe um link só dele, que abre o questionário sem login. O link entra no e-mail no lugar de {link}.'}),
      el('p', {class:'muted small', style:'margin:0', text:'A resposta fica ligada ao e-mail do convite. Quem abrir o mesmo link de novo vê e pode alterar a resposta enquanto o questionário estiver aberto. Se um link vazar, remova o convidado e adicione de novo: o link antigo deixa de funcionar.'}))));

  // números
  v.append(el('div', {class:'tiles', style:'margin-top:16px'},
    el('div', {class:'tile'}, el('p', {text:'Convidados'}), el('strong', {text:String(emails.length)})),
    el('div', {class:'tile'}, el('p', {text:'Já responderam'}), el('strong', {text:String(nResp)})),
    el('div', {class:'tile'}, el('p', {text:'Pendentes'}), el('strong', {text:String(pendentes.length)})),
    el('div', {class:'tile'}, el('p', {text:'Convite não enviado'}), el('strong', {text:String(naoEnviados.length)}))));

  // mensagem + envio
  const assunto = el('input', {type:'text', maxlength:'150'});
  assunto.value = c.assunto;
  const msg = el('textarea', {rows:'8', maxlength:'3000'});
  msg.value = c.mensagem;
  const stMsg = el('p', {class:'msg', role:'status', 'aria-live':'polite'});
  const bSalvarMsg = el('button', {class:'btn sm', type:'button'}, 'Salvar mensagem');
  bSalvarMsg.addEventListener('click', async () => {
    try { await salvarConv(q.id, {...convDe(q.id), assunto:assunto.value, mensagem:msg.value}); stMsg.textContent = 'Mensagem salva.'; stMsg.className = 'msg ok'; }
    catch { stMsg.textContent = 'Não foi possível salvar.'; stMsg.className = 'msg err'; }
  });
  const bPadrao = el('button', {class:'btn sm', type:'button', onclick:() => { assunto.value = MSG_PADRAO.assunto; msg.value = MSG_PADRAO.mensagem; }}, 'Restaurar texto padrão');

  const stEnv = el('p', {class:'msg', role:'status', 'aria-live':'polite'});
  const enviarPara = async (lista, btn) => {
    if (!lista.length) return;
    if (!msg.value.includes('{link}')){ stEnv.textContent = 'A mensagem precisa ter {link} para levar o link do questionário.'; stEnv.className = 'msg err'; return; }
    enviando = true;
    for (const b of v.querySelectorAll('button')) b.disabled = true;
    // a janela de autorização precisa abrir direto do clique
    try { await tokenEnvio(); }
    catch (e){
      enviando = false;
      for (const b of v.querySelectorAll('button')) b.disabled = false;
      stEnv.textContent = erroGmail(e); stEnv.className = 'msg err st-env';
      return;
    }
    let atual;
    try { atual = await garantirTokens(q.id); }
    catch { enviando = false; for (const b of v.querySelectorAll('button')) b.disabled = false; stEnv.textContent = 'Não foi possível gerar os links pessoais. Tente novamente.'; stEnv.className = 'msg err st-env'; return; }
    atual.assunto = assunto.value; atual.mensagem = msg.value;
    const sub = preencher(assunto.value, q);
    let ok = 0, erro = null;
    for (const item of lista){
      stEnv.textContent = `Enviando ${ok + 1} de ${lista.length}: ${item.email}…`; stEnv.className = 'msg';
      try {
        const tk = (atual.emails.find(x => x.email === item.email) || {}).token;
        await enviarEmail(item.email, sub, preencher(msg.value, q, tk));
        ok++;
        const alvo = atual.emails.find(x => x.email === item.email);
        if (alvo) alvo.enviadoEm = new Date().toISOString();
      } catch (e) { erro = e; break; }
    }
    try { if (ok) await salvarConv(q.id, atual); } catch {}
    enviando = false;
    msgEnvio = erro
      ? {qid:q.id, tipo:'err', texto:(ok ? `${ok} enviado(s). ` : '') + erroGmail(erro)}
      : {qid:q.id, tipo:'ok', texto:`${ok} convite(s) enviado(s) por ${eu.email}.`};
    renderConvidados();
  };
  stEnv.classList.add('st-env');
  if (msgEnvio && msgEnvio.qid === q.id){ stEnv.textContent = msgEnvio.texto; stEnv.className = 'msg st-env ' + msgEnvio.tipo; }
  const bNovos = el('button', {class:'btn primary', type:'button', disabled:!naoEnviados.length}, `Enviar para quem ainda não recebeu (${naoEnviados.length})`);
  bNovos.addEventListener('click', () => enviarPara(naoEnviados, bNovos));
  const reenviar = pendentes.filter(x => x.enviadoEm);
  const bLembrar = el('button', {class:'btn', type:'button', disabled:!reenviar.length}, `Reenviar aos pendentes (${reenviar.length})`);
  bLembrar.addEventListener('click', () => enviarPara(reenviar, bLembrar));
  const bCopEm = el('button', {class:'btn sm', type:'button', disabled:!pendentes.length}, 'Copiar e-mails e links dos pendentes');
  bCopEm.addEventListener('click', async () => {
    const c2 = await garantirTokens(q.id).catch(() => convDe(q.id));
    const pend = c2.emails.filter(x => !respondeu[x.email] && x.token);
    copiar(bCopEm, 'E-mail;Link\n' + pend.map(x => x.email + ';' + linkDe(x.token)).join('\n'), 'Copiar e-mails e links dos pendentes');
  });
  const bCopMsg = null;

  v.append(el('div', {class:'panel'},
    el('h3', {text:'E-mail do convite'}),
    el('p', {class:'muted small', style:'margin:0 0 10px', text:'Use {titulo} para o nome do questionário e {link} para o link. Cada pessoa recebe um e-mail separado, enviado da sua conta (' + eu.email + ', pelo ' + nomeServico() + '). No primeiro envio é pedida a sua autorização.'}),
    el('label', {class:'f'}, 'Assunto', assunto),
    el('label', {class:'f', style:'margin-top:10px'}, 'Mensagem', msg),
    el('div', {class:'row-acts'}, bSalvarMsg, bPadrao, stMsg),
    el('div', {class:'row-acts', style:'padding-top:12px;border-top:1px solid var(--line);margin-top:14px'}, bNovos, bLembrar),
    stEnv,
    el('div', {class:'row-acts'}, el('span', {class:'muted small', text:'Sem ' + nomeServico() + '?'}), bCopEm)));

  // tabela
  if (!emails.length){
    v.append(el('div', {class:'empty', style:'margin-top:16px'}, el('h2', {text:'Nenhum convidado ainda'}), el('p', {text:'Adicione os e-mails de quem deve responder.'})));
    return;
  }
  const ordem = [...emails].sort((a, b) => (!!respondeu[a.email] - !!respondeu[b.email]) || a.email.localeCompare(b.email));
  const tb = el('tbody');
  for (const x of ordem){
    const r = respondeu[x.email];
    const del = el('button', {class:'btn sm danger', type:'button', 'aria-label':'Remover ' + x.email}, 'Remover');
    armar(del, 'Confirmar', async () => {
      try { await salvarConv(q.id, {...convDe(q.id), emails:convDe(q.id).emails.filter(y => y.email !== x.email)}, x.token ? [{del:'tokens/' + x.token}] : []); renderConvidados(); } catch {}
    });
    tb.append(el('tr', null,
      el('td', {class:'mail', text:x.email}),
      el('td', null, el('span', {class:'pill ' + (r ? 'ok' : 'warn'), text:r ? 'Respondeu' : 'Pendente'}),
        r ? el('span', {class:'muted small', text:' ' + fmtDH(r)}) : null),
      el('td', {text:x.enviadoEm ? fmtDH(x.enviadoEm) : 'Não enviado'}),
      el('td', null, x.token ? (() => { const b = el('button', {class:'btn sm', type:'button'}, 'Copiar link'); b.addEventListener('click', () => copiar(b, linkDe(x.token), 'Copiar link')); return b; })() : el('span', {class:'muted small', text:'gerado no envio'})),
      el('td', null, del)));
  }
  v.append(el('div', {class:'sec'}, el('h2', {text:'Lista de convidados'}),
    el('div', {class:'scroll'}, el('table', null,
      el('thead', null, el('tr', null, ['E-mail', 'Situação', 'Convite enviado', 'Link pessoal', ''].map(t => el('th', {text:t})))), tb)),
    el('p', {class:'hint muted small', text:'A situação vem do link pessoal: a resposta enviada por um link conta para o e-mail desse convite.'})));
}

/* ================= relatório ================= */
let relGen = 0;
async function renderRelatorio(){
  const v = $('#v-respostas');
  const qs = lista();
  if (!relSel || !questionarios[relSel]) relSel = qs[0] ? qs[0].id : null;
  const gen = ++relGen;
  if (!relSel){
    v.replaceChildren(el('div', {class:'empty'}, el('h2', {text:'Nenhum questionário'}), el('p', {text:'Crie um questionário para acompanhar as respostas aqui.'})));
    return;
  }
  const rs = respostasDe(relSel);
  await carregarNomes(rs.map(r => r.uid));
  if (gen !== relGen) return;
  const q = questionarios[relSel];
  v.replaceChildren();

  const sel = el('select', {'aria-label':'Questionário', style:'width:auto;min-width:16rem'}, qs.map(x => el('option', {value:x.id, text:x.titulo || 'Sem título'})));
  sel.value = relSel;
  sel.addEventListener('change', () => { relSel = sel.value; renderRelatorio(); });
  const copiar = el('button', {class:'btn sm', type:'button'}, 'Copiar tabela (CSV)');
  copiar.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(csv(q, rs)); copiar.textContent = 'Copiado'; }
    catch { copiar.textContent = 'Não foi possível copiar'; }
    setTimeout(() => { copiar.textContent = 'Copiar tabela (CSV)'; }, 2500);
  });
  v.append(el('div', {class:'bar-top'}, el('div', {style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'}, el('h2', {text:'Respostas de'}), sel), copiar));

  const ult = rs[0] && rs[0].enviadoEm;
  v.append(el('div', {class:'tiles'},
    el('div', {class:'tile'}, el('p', {text:'Respostas recebidas'}), el('strong', {text:String(rs.length)})),
    el('div', {class:'tile'}, el('p', {text:'Perguntas principais'}), el('strong', {text:String(todasDe(q).length)})),
    el('div', {class:'tile'}, el('p', {text:'Última resposta'}), el('strong', {style:'font-size:1.05rem', text:ult ? fmtDH(ult) : '—'})),
    el('div', {class:'tile'}, el('p', {text:'Situação'}), el('strong', {style:'font-size:1.05rem', text:q.ativo ? 'Aberto' : 'Fechado'}))));

  if (!rs.length){
    v.append(el('div', {class:'empty'}, el('h2', {text:'Nenhuma resposta ainda'}),
      el('p', {text:'Compartilhe o link desta página com quem vai responder, com acesso de colaborador. As respostas aparecem aqui assim que forem enviadas.'})));
    return;
  }

  // resumo por pergunta
  const sum = el('div', {class:'sum'});
  const secs = blocosDe(q);
  const comTitulo = secs.length > 1 || secs.some(b => b.titulo);
  let off = 0;
  const itensRel = [];
  for (const b of secs){
    if (comTitulo) itensRel.push({bloco:b});
    achatar(b.perguntas || [], '', null, itensRel, off);
    off += (b.perguntas || []).length;
  }
  for (const it of itensRel){
    if (it.bloco){
      sum.append(el('div', {class:'fb-head', style:'margin-top:14px'}, el('h3', {text:it.bloco.titulo || 'Sem título'}),
        it.bloco.descricao ? el('p', {class:'fb-desc', text:it.bloco.descricao}) : null));
      continue;
    }
    const {q:p, num, pai, nivel} = it;
    const vs = rs.map(r => ({uid:r.uid, v:r.respostas[p.id]})).filter(x => !vazio(x.v));
    const card = el('div', {class:'sq' + (nivel ? ' sub' : ''), style:nivel > 1 ? `margin-left:${22 * nivel}px` : null});
    if (pai) card.append(el('p', {class:'sq-cond', text:descreveCond(pai, p.cond)}));
    card.append(el('div', {class:'fq-head'}, el('span', {class:'num', text:num}), el('span', {class:'fq-txt', text:p.texto})),
      el('p', {class:'sq-meta', text:`${vs.length} ${vs.length === 1 ? 'resposta' : 'respostas'} · ${TIPOS[p.tipo]}`}));
    if (vs.length){
      if (TEM_OPCOES(p.tipo)){
        for (const o of p.opcoes){
          const n = vs.filter(x => p.tipo === 'simples' ? x.v === o.id : Array.isArray(x.v) && x.v.includes(o.id)).length;
          const pct = vs.length ? n / vs.length * 100 : 0;
          const tr = el('div', {class:'track'}, el('i'));
          tr.firstChild.style.width = pct + '%';
          card.append(el('div', {class:'hbar'}, el('span', {text:o.rotulo}), tr, el('span', {class:'v', text:`${n} · ${Math.round(pct)}%`})));
        }
      } else if (p.tipo === 'numero'){
        const ns = vs.map(x => Number(x.v));
        const soma = ns.reduce((a, b) => a + b, 0);
        card.append(el('div', {class:'stats'},
          el('span', null, 'Soma ', el('b', {text:fmtN(soma)})),
          el('span', null, 'Média ', el('b', {text:fmtN(soma / ns.length)})),
          el('span', null, 'Mínimo ', el('b', {text:fmtN(Math.min(...ns))})),
          el('span', null, 'Máximo ', el('b', {text:fmtN(Math.max(...ns))}))));
      } else if (p.tipo === 'data'){
        const ds = vs.map(x => x.v).sort();
        card.append(el('div', {class:'stats'},
          el('span', null, 'Mais antiga ', el('b', {text:fmtD(ds[0])})),
          el('span', null, 'Mais recente ', el('b', {text:fmtD(ds[ds.length - 1])}))));
      } else {
        const ul = el('ul', {class:'txtlist'});
        for (const x of vs.slice(0, 8)) ul.append(el('li', null, el('span', {class:'muted', text:nomeDe(x.uid) + ': '}), String(x.v)));
        if (vs.length > 8) ul.append(el('li', {class:'muted', text:`e mais ${vs.length - 8} na tabela abaixo`}));
        card.append(ul);
      }
    }
    sum.append(card);
  }
  v.append(el('div', {class:'sec'}, el('h2', {text:'Resumo por pergunta'}), sum));

  // respostas individuais
  const flat = achatar(todasDe(q));
  const tb = el('tbody');
  for (const r of rs){
    const n = todasDe(q).filter(p => !vazio(r.respostas[p.id])).length;
    const det = el('tr', {class:'det', hidden:true}, el('td', {colspan:'4'},
      el('dl', {class:'det-list'}, flat.filter(x => !vazio(r.respostas[x.q.id])).flatMap(x => [
        el('dt', {text:x.num}), el('dd', null, el('span', {class:'muted', text:x.q.texto + ' — '}), el('b', {text:textoResposta(x.q, r.respostas[x.q.id])}))]))));
    const b = el('button', {class:'btn sm', type:'button', 'aria-expanded':'false'}, 'Ver respostas');
    b.addEventListener('click', () => { det.hidden = !det.hidden; b.setAttribute('aria-expanded', String(!det.hidden)); b.textContent = det.hidden ? 'Ver respostas' : 'Ocultar'; });
    tb.append(el('tr', null,
      el('td', null, el('b', {text:nomeDe(r.uid)})),
      el('td', {text:r.enviadoEm ? fmtDH(r.enviadoEm) : '—'}),
      el('td', {text:String(n)}),
      el('td', null, b)), det);
  }
  v.append(el('div', {class:'sec'}, el('h2', {text:'Respostas individuais'}),
    el('div', {class:'scroll'}, el('table', null,
      el('thead', null, el('tr', null, ['Participante', 'Enviado em', 'Perguntas respondidas', ''].map(t => el('th', {text:t})))), tb))));
}
function csv(q, rs){
  const flat = achatar(todasDe(q));
  const esc = s => { s = String(s ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const linhas = [['Participante', 'Enviado em', ...flat.map(x => `${x.num} ${x.q.texto}`)].map(esc).join(';')];
  for (const r of rs) linhas.push([nomeDe(r.uid), r.enviadoEm ? fmtDH(r.enviadoEm) : '', ...flat.map(x => textoResposta(x.q, r.respostas[x.q.id]))].map(esc).join(';'));
  return linhas.join('\n');
}

/* ================= login e inicialização ================= */
function mostrarLogin(msg){
  for (const v of VIEWS) $('#v-' + v).hidden = true;
  $('#nav').hidden = true; $('#quem').hidden = true;
  $('#v-login').hidden = false;
  $('#login-msg').textContent = msg || '';
}
async function entrar(){
  const prov = new GoogleAuthProvider();
  prov.setCustomParameters({prompt:'select_account'});
  $('#login-msg').textContent = '';
  try { await signInWithPopup(auth, prov); }
  catch (e){
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return signInWithRedirect(auth, prov);
    if (e && e.code === 'auth/popup-closed-by-user') return;
    $('#login-msg').textContent = e && e.code === 'auth/unauthorized-domain'
      ? 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).'
      : 'Não foi possível entrar agora. Tente novamente.';
  }
}
$('#btn-entrar').addEventListener('click', entrar);
$('#btn-sair').addEventListener('click', async () => {
  if (editDirty && !$('#btn-sair').classList.contains('armed')){
    const b = $('#btn-sair'); b.classList.add('armed'); b.textContent = 'Sair sem salvar?';
    setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Sair'; }, 4000);
    return;
  }
  await signOut(auth);
  location.replace(location.pathname);
});
getRedirectResult(auth).catch(() => {});

/* ---------- convidado: responde pelo link pessoal, sem login ---------- */
const MATCH_TOKEN = /^#r-([0-9a-f]{32})$/.exec(location.hash);
const modoConvidado = !!MATCH_TOKEN;
async function abrirConvite(token){
  db = fire;
  for (const v of VIEWS) $('#v-' + v).hidden = true;
  $('#nav').hidden = true; $('#quem').hidden = true; $('#v-login').hidden = true;
  const v = $('#v-responder');
  v.hidden = false;
  v.replaceChildren(el('p', {class:'muted', text:'Carregando o questionário…'}));
  const falha = (titulo, texto) => v.replaceChildren(el('div', {class:'empty'}, el('h2', {text:titulo}), el('p', {text:texto})));
  let tk, q, anterior = null;
  try {
    const t = await db.doc('tokens/' + token).get();
    if (!t.exists) return falha('Link inválido', 'Este link não é mais válido. Peça um novo convite a quem enviou o questionário.');
    tk = t.data();
    const qd = await db.doc('questionarios/' + tk.qid).get();
    if (!qd.exists) return falha('Questionário não encontrado', 'Este questionário foi removido.');
    q = {id:tk.qid, ...qd.data()};
    const rd = await db.doc('respostas/' + tk.qid + '_' + token).get();
    if (rd.exists) anterior = rd.data();
  } catch {
    return falha('Não foi possível abrir', 'Verifique a sua conexão com a internet e recarregue a página.');
  }
  const vals = clone((anterior && anterior.respostas) || {});
  const form = renderForm(blocosDe(q), vals, 'r');
  const st = el('p', {class:'msg', role:'status', 'aria-live':'polite'});
  const btn = el('button', {class:'btn primary', type:'submit', disabled:!q.ativo}, anterior ? 'Atualizar resposta' : 'Enviar resposta');
  const f = el('form', {novalidate:true, class:'panel'}, form.el,
    el('div', {style:'display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid var(--line)'}, btn, st));
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const n = form.validar();
    if (n){ st.textContent = n === 1 ? 'Falta responder 1 pergunta obrigatória.' : `Faltam ${n} perguntas obrigatórias.`; st.className = 'msg err'; return; }
    btn.disabled = true; st.textContent = 'Enviando…'; st.className = 'msg';
    try {
      await db.doc('respostas/' + q.id + '_' + token).set({qid:q.id, token, email:tk.email, respostas:form.podadas(), enviadoEm:new Date().toISOString()});
      st.textContent = 'Resposta enviada. Obrigado! Você pode voltar a este link para alterar enquanto o questionário estiver aberto.'; st.className = 'msg ok';
      btn.textContent = 'Atualizar resposta';
    } catch (err) {
      st.textContent = err && err.code === 'permission-denied'
        ? 'Este questionário não aceita mais respostas ou o link deixou de valer.'
        : 'Não foi possível enviar agora. Verifique a conexão e tente novamente.';
      st.className = 'msg err';
    } finally { btn.disabled = !q.ativo; }
  });
  v.replaceChildren(
    el('div', {style:'margin-bottom:14px'}, el('h2', {text:q.titulo || 'Questionário'}),
      q.descricao ? el('p', {class:'muted', style:'margin:4px 0 0;max-width:70ch', text:q.descricao}) : null,
      el('p', {class:'small muted', style:'margin:6px 0 0', text:'Convite para ' + tk.email + (anterior && anterior.enviadoEm ? ' · última resposta enviada em ' + fmtDH(anterior.enviadoEm) : '')}),
      !q.ativo ? el('p', {class:'notice', style:'margin-top:10px', text:'Este questionário está fechado para respostas.'}) : null,
      el('p', {class:'small muted', style:'margin:6px 0 0'}, el('span', {class:'req', text:'*'}), ' obrigatória')),
    f);
}

/* ---------- dados enviados ao assistente de IA ---------- */
function contextoIA(){
  const out = [];
  const qs = lista();
  out.push(`Administrador logado: ${eu.nome || ''} <${eu.email}>. Total de questionários: ${qs.length}.`);
  for (const q of qs){
    const flat = achatar(todasDe(q));
    const rs = respostasDe(q.id);
    out.push(`\n## Questionário "${q.titulo || 'Sem título'}" (id ${q.id})`);
    out.push(`Situação: ${q.ativo ? 'Ativo (aberto para respostas)' : 'Inativo (fechado para respostas)'}. Criado: ${q.criadoEm ? fmtDH(q.criadoEm) : '?'}. Alterado: ${q.atualizadoEm ? fmtDH(q.atualizadoEm) : '?'}.`);
    if (q.descricao) out.push(`Descrição: ${q.descricao}`);
    out.push(`Perguntas principais: ${todasDe(q).length}; total com sub-perguntas: ${flat.length}; respostas recebidas: ${rs.length}.`);
    out.push('### Estrutura');
    const blocoDe = new Map();
    for (const b of blocosDe(q)) for (const p of b.perguntas || []) blocoDe.set(p, b);
    let blocoAtual = null;
    for (const x of flat){
      const p = x.q;
      const b = x.nivel === 0 ? blocoDe.get(p) : null;
      if (b && b !== blocoAtual){ blocoAtual = b; if (b.titulo) out.push(`Bloco: ${b.titulo}${b.descricao ? ' — ' + b.descricao : ''}`); }
      {
        let l = `${'  '.repeat(x.nivel)}${x.num}. ${p.texto || '(sem texto)'} [${TIPOS[p.tipo] || p.tipo}${p.obrigatoria ? ', obrigatória' : ''}]`;
        if (TEM_OPCOES(p.tipo)) l += ` Opções: ${(p.opcoes || []).map(o => o.rotulo).join(' | ')}.`;
        if (x.pai && p.cond) l += ` (sub-pergunta da ${x.num.split('.').slice(0, -1).join('.')}: ${descreveCond(x.pai, p.cond)})`;
        if (p.ajuda) l += ` Ajuda: ${p.ajuda}`;
        out.push(l);
      }
    }
    const conv = (convites[q.id] && convites[q.id].emails) || [];
    const respondeu = {};
    for (const r of rs) respondeu[String(r.email || '').toLowerCase()] = r.enviadoEm;
    out.push(`### Convidados (${conv.length})`);
    for (const c of conv){
      const r = respondeu[c.email];
      out.push(`- ${c.email}: convite ${c.enviadoEm ? 'enviado em ' + fmtDH(c.enviadoEm) : 'não enviado'}; ${r ? 'respondeu em ' + fmtDH(r) : 'não respondeu'}`);
    }
    out.push(`### Respostas (${rs.length})`);
    for (const r of rs){
      const itens = flat.filter(x => !vazio(r.respostas[x.q.id])).map(x => `${x.num}=${textoResposta(x.q, r.respostas[x.q.id])}`);
      out.push(`- ${r.email || nomeDe(r.uid)} (${r.enviadoEm ? fmtDH(r.enviadoEm) : '?'}): ${itens.join('; ')}`);
    }
  }
  return out.join('\n');
}

/* ---------- administrador: login Google ---------- */
let iniciado = false;
if (modoConvidado) abrirConvite(MATCH_TOKEN[1]);
else onAuthStateChanged(auth, async u => {
  if (!u){ mostrarLogin(); return; }
  if (iniciado) return;
  iniciado = true;
  db = fire;
  uid = u.uid;
  eu = {uid:u.uid, nome:u.displayName || '', email:String(u.email || (u.providerData.find(x => x.email) || {}).email || '').toLowerCase()};
  $('#v-login').hidden = true;
  $('#quem').hidden = false;
  $('#quem-nome').textContent = eu.nome || eu.email;
  $('#quem-email').textContent = eu.nome ? eu.email : '';

  // administradores: config/admins.emails
  isAdmin = await db.doc('config/admins').get()
    .then(s => !!(s.exists && Array.isArray(s.data().emails) && s.data().emails.map(x => String(x).toLowerCase()).includes(eu.email)))
    .catch(() => false);
  if (!isAdmin){
    for (const v of VIEWS) $('#v-' + v).hidden = true;
    const v = $('#v-responder'); v.hidden = false;
    v.replaceChildren(el('div', {class:'empty'}, el('h2', {text:'Acesso restrito'}),
      el('p', {text:'Esta área é só para administradores (' + eu.email + ' não está na lista). Se você recebeu um convite, abra o link pessoal que veio no e-mail: ele não precisa de login.'})));
    return;
  }
  $('#nav').hidden = false;
  $('#tab-questionarios').hidden = false;
  $('#tab-respostas').hidden = false;
  route();
  import('./assistente.js?v=20261126e')
    .then(m => m.montarAssistente({app:fbApp, contexto:contextoIA, quem:eu.nome}))
    .catch(e => console.error('[assistente]', e));

  const esperando = {q:true, todas:true, conv:true};
  const timer = setTimeout(() => { const c = $('#carregando'); if (c) c.textContent = 'Os dados ainda não responderam. Se demorar, recarregue a página.'; }, 10000);
  const talvezPronto = () => {
    if (pronto || esperando.q || esperando.todas || esperando.conv) return;
    clearTimeout(timer); pronto = true; route();
  };

  db.collection('questionarios').onSnapshot(snap => {
    const novo = {};
    for (const d of snap.docs){ const x = d.data(); novo[d.id || x.id] = x; }
    questionarios = novo;
    esperando.q = false;
    if (!pronto) return talvezPronto();
    if (viewAtual !== 'editor') render();
  }, () => { esperando.q = false; talvezPronto(); });

  db.collection('respostas').onSnapshot(snap => {
    // respostas por link pessoal usam o token como identificador do participante
    todasRespostas = snap.docs.map(d => { const x = d.data(); return {...x, uid:x.token || x.uid}; });
    for (const r of todasRespostas){ emailsDe[r.uid] = String(r.email || '').toLowerCase(); nomes[r.uid] = r.nome || r.email || ''; }
    esperando.todas = false;
    if (!pronto) return talvezPronto();
    if (viewAtual === 'respostas' || viewAtual === 'questionarios' || viewAtual === 'convidados') render();
  }, () => { esperando.todas = false; talvezPronto(); });
  db.collection('convites').onSnapshot(snap => {
    const novo = {};
    for (const d of snap.docs){ const x = d.data(); novo[d.id || x.qid] = x; }
    convites = novo;
    esperando.conv = false;
    if (!pronto) return talvezPronto();
    if (viewAtual === 'convidados' && !enviando) render();
  }, () => { esperando.conv = false; talvezPronto(); });
});
