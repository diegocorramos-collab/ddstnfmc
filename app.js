// ===== Versão =====
const APP_VERSION = 'v3.5.1';

// ===== Config =====
const SERVERLESS_URL = '';

// ===== Firebase =====
let db;
let unsubscribeRanking;

function initFirebase() {
  if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined') {
    console.error("Firebase SDK ou firebaseConfig não carregados.");
    return;
  }
  try {
    const app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase inicializado com sucesso.");
  } catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
  }
}

async function saveScoreToFirebase(playerName, totalPoints) {
  if (!db) return;
  const playerRef = db.collection('ranking').doc(playerName);
  try {
    await playerRef.set({
      nome: playerName,
      pontosTotal: totalPoints,
      ultimaAtualizacao: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log("Pontuação salva no Firebase para:", playerName);
  } catch (e) {
    console.error("Erro ao salvar pontuação no Firebase:", e);
  }
}

function renderRanking(ranking) {
  const list = $('#rankingList');
  if (!list) return;
  list.innerHTML = '';
  if (ranking.length === 0) {
    list.innerHTML = '<li>Nenhum jogador no ranking ainda.</li>';
    return;
  }

  ranking.forEach((player, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>#${index + 1}</strong> ${player.nome} <span class="pill">${player.pontosTotal} pontos</span>`;
    list.appendChild(li);
  });
}

function startRankingListener() {
  if (!db) return;
  if (unsubscribeRanking) unsubscribeRanking(); // Limpa listener anterior, se houver

  const rankingRef = db.collection('ranking')
    .orderBy('pontosTotal', 'desc')
    .limit(10);

  unsubscribeRanking = rankingRef.onSnapshot(snapshot => {
    const ranking = [];
    snapshot.forEach(doc => {
      ranking.push(doc.data());
    });
    renderRanking(ranking);
  }, error => {
    console.error("Erro ao ouvir o ranking:", error);
    $('#rankingList').innerHTML = '<li>Erro ao carregar o ranking.</li>';
  });
  console.log("Listener do ranking iniciado.");
}

function stopRankingListener() {
  if (unsubscribeRanking) {
    unsubscribeRanking();
    unsubscribeRanking = null;
    console.log("Listener do ranking parado.");
  }
}

function toggleRanking(open){
  const dr=$('#rankingDrawer');
  if (!dr) return;
  if (open===undefined) open = !dr.classList.contains('open');
  dr.classList.toggle('open', open);
  dr.setAttribute('aria-hidden', open?'false':'true');
  $('#btnRanking')?.setAttribute('aria-expanded', open?'true':'false');
  if (open) startRankingListener(); else stopRankingListener();
}

// Adicionar um estilo básico para a lista de ranking
const style = document.createElement('style');
style.textContent = `
.ranking-list {
  list-style: none;
  padding: 0;
}
.ranking-list li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ranking-list li:last-child {
  border-bottom: none;
}
`;
document.head.appendChild(style);


// ===== Util =====
const $ = (sel) => document.querySelector(sel);
const on = (el, ev, fn) => el.addEventListener(ev, fn);
const removeDiacritics = (s) => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const normalize = (s) => removeDiacritics((s||'').toLowerCase()).replace(/[^\p{L}\s-]/gu,'').trim();
const primeiraPalavra = (s) => normalize(s).split(/\s+/)[0] || '';

// ===== Estado =====
const state = {
  nome: localStorage.getItem('dds-contexto-nome') || '—',
  rodada: 0,
  totalRodadas: 0,
  pontosTotal: 0,
  pontosRodada: 100,
  ajudas: 3,
  categoria: '—',
  answer: '',
  rankMap: new Map(),
  historico: [],
  idxCat: 0,
  idxWord: 0,
  hintStep: 0
};

// ===== Chaves =====
const KEY_STATS = 'dds-contexto-stats';
const KEY_FIRST = 'dds-contexto-first-run';
const KEY_PROGRESS = 'dds-contexto-progress'; // { [idxCat]: { completed: [bool] } }
const KEY_LAST = 'dds-contexto-last';        // { idxCat }
const KEY_SOLVED = 'dds-contexto-solved';    // [{c,w,ts}]
const KEY_CAT_HISTORY = 'dds-contexto-cat-history'; // { [catIdx]: { [wordIdx]: [ {g, prox} ] } }

// ===== Data =====
function loadData(){ return window.DEFAULT_DATA || []; }

// ===== Persistência =====
function loadStats(){ try { return JSON.parse(localStorage.getItem(KEY_STATS)) || {rodadas:0, ganhas:0}; } catch { return {rodadas:0, ganhas:0}; } }
function saveStats(s){ localStorage.setItem(KEY_STATS, JSON.stringify(s)); }
function loadProgress(){ try{ return JSON.parse(localStorage.getItem(KEY_PROGRESS)) || {}; }catch{ return {}; } }
function saveProgress(p){ localStorage.setItem(KEY_PROGRESS, JSON.stringify(p)); }
function loadLast(){ try{ return JSON.parse(localStorage.getItem(KEY_LAST)) || null; }catch{ return null; } }
function saveLast(){ localStorage.setItem(KEY_LAST, JSON.stringify({ idxCat: state.idxCat })); }
function loadSolved(){ try{ return JSON.parse(localStorage.getItem(KEY_SOLVED)) || []; }catch{ return []; } }
function saveSolved(arr){ localStorage.setItem(KEY_SOLVED, JSON.stringify(arr)); }
function loadCatHistory(){ try{ return JSON.parse(localStorage.getItem(KEY_CAT_HISTORY)) || {}; }catch{ return {}; } }
function saveCatHistory(h){ localStorage.setItem(KEY_CAT_HISTORY, JSON.stringify(h)); }
function pushHistory(catIdx, wordIdx, entry){
  const h = loadCatHistory();
  if (!h[catIdx]) h[catIdx] = {};
  if (!Array.isArray(h[catIdx][wordIdx])) h[catIdx][wordIdx] = [];
  h[catIdx][wordIdx].unshift(entry); // mais recente no topo
  saveCatHistory(h);
}
function getHistory(catIdx, wordIdx){
  const h = loadCatHistory();
  return (h[catIdx] && Array.isArray(h[catIdx][wordIdx])) ? h[catIdx][wordIdx] : [];
}

function ensureCatProgress(idxCat, total){
  const prog = loadProgress();
  if (!prog[idxCat] || !Array.isArray(prog[idxCat].completed) || prog[idxCat].completed.length !== total){
    prog[idxCat] = { completed: Array(total).fill(false) };
    saveProgress(prog);
  }
  return prog;
}
function getFirstUnfinished(idxCat, total){
  const prog = ensureCatProgress(idxCat, total);
  const arr = prog[idxCat].completed;
  const i = arr.findIndex(v => !v);
  return i === -1 ? total : i; // total = concluída
}
function markCompleted(idxCat, idxWord, total){
  const prog = ensureCatProgress(idxCat, total);
  prog[idxCat].completed[idxWord] = true;
  saveProgress(prog);
}
function getCounts(idxCat, total){
  const prog = ensureCatProgress(idxCat, total);
  const done = prog[idxCat].completed.filter(Boolean).length;
  return { done, remaining: total - done };
}
function getGlobalCounts(){
  let done=0, total=0;
  for (let i=0;i<DATA.length;i++){
    const t = DATA[i].palavras.length; total += t;
    const p = ensureCatProgress(i, t);
    done += p[i].completed.filter(Boolean).length;
  }
  return { done, total };
}

// ===== Proximidade =====
function construirRankMap(lista){ const m = new Map(); lista.forEach((w,i)=> m.set(normalize(w), i+1)); return m; }
function proximidade(guess, answer){
  const gr = state.rankMap.get(guess); const ar = state.rankMap.get(answer); const n = state.rankMap.size || 0;
  if (!gr || !ar || n <= 1) return {dist:Infinity, icon:'❄️', cls:'snow', tip:'fora da lista', pct:0};
  const d = Math.abs(gr - ar); const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - d/Math.max(1,(n-1))))));
  if (d <= 10) return {dist:d, icon:'🚀', cls:'rocket', tip:'muito perto', pct};
  if (d <= 20) return {dist:d, icon:'✨', cls:'spark', tip:'perto', pct};
  if (d <= 100) return {dist:d, icon:'🔥', cls:'fire', tip:'longe', pct};
  return {dist:d, icon:'❄️', cls:'snow', tip:'muito longe', pct};
}

// ===== UI helpers =====
function renderStatsGlobais(){
  const s = loadStats();
  $('#sgJogador').textContent = `Jogador: ${state.nome}`;
  $('#sgRodadas').textContent = `Rodadas: ${s.rodadas||0}`;
  $('#sgGanhas').textContent = `Ganhas: ${s.ganhas||0}`;
  const taxa = (s.rodadas>0)? Math.round(100*(s.ganhas/s.rodadas)) : 0;
  $('#sgTaxa').textContent = `Taxa: ${taxa}%`;
  $('#mRodadas').textContent = s.rodadas||0; $('#mGanhas').textContent = s.ganhas||0;
  const gc = getGlobalCounts();
  $('#sgGlobalDone').textContent = `Concluídas (Geral): ${gc.done}/${gc.total}`;
  $('#mGlobalDone').textContent = `${gc.done}/${gc.total}`;
  const pct = gc.total? Math.round(100*gc.done/gc.total) : 0;
  const gpf = $('#globalProgressFill'); if (gpf) gpf.style.width = pct + '%';
  $('#jogador').textContent = state.nome;
}
function setProximity(pct){ pct = Math.max(0, Math.min(100, Math.round(pct||0))); const fill=$('#progressFill'); const lbl=$('#progressPct'); if (fill){ fill.style.width = pct + '%'; fill.style.backgroundColor = `hsl(${Math.round(pct*1.2)},85%,50%)`; } if (lbl){ lbl.textContent = pct + '%'; } }
function absoluteRound(DATA){ let sum=0; for (let i=0;i<state.idxCat;i++){ sum += (DATA[i].palavras||[]).length; } return sum + state.idxWord + 1; }
function getClosestWord(){ const ar=state.rankMap.get(state.answer); const guesses=new Set(state.historico.map(x=>x)); let best=null, bestDist=Infinity; for(const [w,r] of state.rankMap.entries()){ if(w===state.answer) continue; if(guesses.has(w)) continue; const d=Math.abs(r-ar); if(d<bestDist){bestDist=d; best=w;} } return best; }

// ===== Drawer de Acertos =====
function addSolved(catIdx, wordIdx){
  const arr = loadSolved();
  if (!arr.some(e => e.c===catIdx && e.w===wordIdx)){
    arr.push({c:catIdx, w:wordIdx, ts: Date.now()});
    saveSolved(arr);
  }
}
function renderSolvedDrawer(){
  const list = $('#solvedList'); const sum = $('#solvedSummary'); if (!list || !sum) return;
  const arr = loadSolved();
  arr.sort((a,b)=> a.ts - b.ts);
  list.innerHTML = '';
  let total = 0;
  const groups = new Map();
  arr.forEach(it=>{ const g = groups.get(it.c) || []; g.push(it); groups.set(it.c, g); });
  for (const [catIdx, items] of groups){
    const catName = (DATA[catIdx] && DATA[catIdx].categoria) ? DATA[catIdx].categoria : `Categoria ${catIdx+1}`;
    const liSep = document.createElement('li'); liSep.className='sep'; liSep.textContent = `${catName} — ${items.length}`; list.appendChild(liSep);
    items.forEach(it=>{
      const word = (DATA[catIdx] && DATA[catIdx].palavras[it.w]) ? DATA[catIdx].palavras[it.w] : '(?)';
      const li = document.createElement('li');
      li.innerHTML = `<strong>${word}</strong> <span class="muted small">#${it.w+1}</span>`;
      list.appendChild(li);
      total++;
    });
  }
  sum.textContent = `Total de acertos: ${total}`;
}
function toggleSolved(open){ const dr=$('#solvedDrawer'); if (!dr) return; if (open===undefined) open = !dr.classList.contains('open'); dr.classList.toggle('open', open); dr.setAttribute('aria-hidden', open?'false':'true'); $('#btnSolved')?.setAttribute('aria-expanded', open?'true':'false'); if (open) renderSolvedDrawer(); }

// ===== Category chooser =====
function updateCategoryChooserList(){
  const ul = $('#categoryList'); if (!ul) return; ul.innerHTML = '';
  DATA.forEach((cat, idx)=>{
    const total = cat.palavras.length; const {done} = getCounts(idx, total);
    const li = document.createElement('li');
    const left = document.createElement('div'); left.className='catrow';
    const title = document.createElement('div'); title.innerHTML = `<strong>${cat.categoria}</strong> <span class=\"muted small\">(${done}/${total})</span>`;
    const bar = document.createElement('div'); bar.className='catbar'; const fill = document.createElement('span'); fill.style.width = (total? (100*done/total):0) + '%'; bar.appendChild(fill);
    left.append(title, bar);
    const btn = document.createElement('button'); btn.textContent='Jogar'; btn.className='primary'; btn.dataset.idx = idx;
    btn.addEventListener('click', ()=>{ state.idxCat = idx; const t = DATA[idx].palavras.length; state.idxWord = getFirstUnfinished(idx, t); state.hintStep=0; closeModal($('#categoryPanel')); novaRodada(); });
    li.append(left, btn); ul.appendChild(li);
  });
}

async function logEvent(evt){ try{ if(!SERVERLESS_URL) return; await fetch(SERVERLESS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evt)}); }catch(e){} }

// ===== Fluxo =====
let DATA = [];
function novaRodada(){
  saveLast();
  while (state.idxCat < DATA.length && state.idxWord >= (DATA[state.idxCat].palavras||[]).length){ state.idxCat++; state.idxWord = 0; }
  if (state.idxCat >= DATA.length){ $('#feedback').textContent = '🎉 Parabéns! Todas as palavras concluídas.'; setProximity(100); renderStatsGlobais(); return; }

  const cat = DATA[state.idxCat]; const total = cat.palavras.length;
  state.idxWord = getFirstUnfinished(state.idxCat, total);
  if (state.idxWord >= total){ state.idxCat++; state.idxWord = 0; return novaRodada(); }

  state.pontosRodada = 100; state.ajudas = 3; state.historico = []; state.hintStep = 0;
  state.categoria = cat.categoria; state.rankMap = construirRankMap(cat.palavras); state.answer = normalize(cat.palavras[state.idxWord]);

  $('#rodadaAtual').textContent = absoluteRound(DATA); $('#rodadasTot').textContent = state.totalRodadas; $('#categoria').textContent = state.categoria; $('#pontosRodada').textContent = state.pontosRodada; $('#ajudasRest').textContent = state.ajudas; $('#feedback').textContent = 'Nenhum palpite ainda.'; setProximity(0); $('#palpite').value=''; $('#palpite').focus();
  renderStatsGlobais();
  renderHistory(); // <— exibe histórico persistente desta palavra
}

// ===== Modais & Drawer =====
function openModal(el){ el.hidden = false; }
function closeModal(el){ el.hidden = true; }
function toggleDrawer(open){ const drawer=$('#drawer'); if (open===undefined) open = !drawer.classList.contains('open'); drawer.classList.toggle('open', open); drawer.setAttribute('aria-hidden', open?'false':'true'); $('#btnDrawer').setAttribute('aria-expanded', open?'true':'false'); }

function registerShortcuts(){ on(document, 'keydown', (e)=>{ const key=e.key; const lower=key.toLowerCase(); const ae=document.activeElement; const typing=ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable); if (key==='?'){ e.preventDefault(); toggleDrawer(); return; } if (typing && (lower==='a')) return; if (lower==='a'){ e.preventDefault(); $('#ajuda').click(); return; } if (key==='Escape'){ e.preventDefault(); $('#limpar').click(); return; } }); }

// ===== Zerar =====
function zerarTudo(){ localStorage.removeItem(KEY_STATS); localStorage.removeItem(KEY_FIRST); localStorage.removeItem(KEY_PROGRESS); localStorage.removeItem(KEY_LAST); localStorage.removeItem(KEY_SOLVED); localStorage.removeItem(KEY_CAT_HISTORY); state.pontosTotal=0; state.rodada=0; state.historico=[]; state.idxCat=0; state.idxWord=0; state.hintStep=0; $('#historico').innerHTML=''; $('#pontosTotal').textContent='0'; DATA=loadData(); state.totalRodadas = DATA.reduce((a,c)=> a + c.palavras.length, 0); $('#rodadasTot').textContent=state.totalRodadas; renderStatsGlobais(); openModal($('#onboarding')); }

// ===== Main =====
async function main(){
  initFirebase(); // Inicializa o Firebase no início
  $('#appVersion').textContent = APP_VERSION; DATA = loadData(); state.totalRodadas = DATA.reduce((a,c)=> a + c.palavras.length, 0); $('#rodadasTot').textContent = state.totalRodadas; renderStatsGlobais(); if (!localStorage.getItem(KEY_FIRST)){ openModal($('#onboarding')); }

  // Topbar
  on($('#btnSolved'), 'click', () => toggleSolved());
  on($('#btnRanking'), 'click', () => toggleRanking());
  on($('#btnCloseRanking'), 'click', () => toggleRanking(false));
  on($('#btnCloseSolved'), 'click', () => toggleSolved());
  on($('#btnDrawer'), 'click', () => toggleDrawer());
  on($('#btnCloseDrawer'), 'click', () => toggleDrawer());
  on($('#btnStats'), 'click', () => { renderStatsGlobais(); openModal($('#statsPanel')); });
  on($('#closeStats'), 'click', () => closeModal($('#statsPanel')));
  on($('#btnCategorias'), 'click', () => { updateCategoryChooserList(); openModal($('#categoryPanel')); });
  on($('#closeCategory'), 'click', () => closeModal($('#categoryPanel')));
  on($('#btnOnboarding'), 'click', () => openModal($('#onboarding')));
  on($('#onStart'), 'click', () => { localStorage.setItem(KEY_FIRST, '1'); closeModal($('#onboarding')); $('#nome').focus(); });

  // Iniciar
  on($('#iniciar'), 'click', ()=>{
    const nome=$('#nome').value.trim() || '—'; state.nome = nome; localStorage.setItem('dds-contexto-nome', nome);
    renderStatsGlobais();
    const last = (function(){ try{ return JSON.parse(localStorage.getItem(KEY_LAST)) || null; }catch{return null;} })();
    if (last && Number.isInteger(last.idxCat)){
      state.idxCat = Math.min(Math.max(0, last.idxCat), DATA.length-1);
    } else {
      state.idxCat = 0;
      for (let i=0;i<DATA.length;i++){ const total = DATA[i].palavras.length; if (getFirstUnfinished(i, total) < total){ state.idxCat = i; break; } }
    }
    state.idxWord = 0; state.hintStep=0; state.pontosTotal = state.pontosTotal || 0; $('#pontosTotal').textContent = state.pontosTotal;
    novaRodada();
  });

  // Palpite
  on($('#form'), 'submit', (e)=>{ e.preventDefault(); $('#enviar').click(); });
  on($('#enviar'), 'click', async ()=>{
    const raw = $('#palpite').value; const guess = primeiraPalavra(raw); if (!guess){ $('#feedback').textContent = 'Digite um palpite.'; return; }
    const prox = proximidade(guess, state.answer); setProximity(prox.pct);

    const erros = state.historico.push(guess);
    const li = document.createElement('li');
    li.innerHTML = `<span class="badge ${prox.cls}">${prox.icon} ${prox.dist===Infinity?'—':prox.dist}</span> <strong>${guess}</strong> <span class="muted small">(${prox.tip} — ${prox.pct}%)</span>`;
    $('#historico').prepend(li);
    // Salva no histórico persistente desta categoria/palavra
    pushHistory(state.idxCat, state.idxWord, { g: guess, prox });

    if (erros % 10 === 0){ state.pontosRodada = Math.max(0, state.pontosRodada - 1); $('#pontosRodada').textContent = state.pontosRodada; }

    if (guess === state.answer){
	      $('#feedback').textContent = '🎉 Parabéns! Próxima palavra…'; state.pontosTotal += state.pontosRodada; $('#pontosTotal').textContent = state.pontosTotal; const w=state.answer; setProximity(100);
	      // Salva a pontuação total no Firebase
	      if (state.nome && state.nome !== '—') {
	        saveScoreToFirebase(state.nome, state.pontosTotal);
	      }
      const s = loadStats(); s.rodadas = (s.rodadas||0) + 1; s.ganhas = (s.ganhas||0) + 1; saveStats(s);
      markCompleted(state.idxCat, state.idxWord, (DATA[state.idxCat].palavras||[]).length);
      addSolved(state.idxCat, state.idxWord);
      renderStatsGlobais(); await logEvent({ action:'solve', player:state.nome, ts:new Date().toISOString(), category:state.categoria, word:w, attempts: state.historico.length, points: state.pontosRodada });
      const total = DATA[state.idxCat].palavras.length; let next = getFirstUnfinished(state.idxCat, total);
      if (next >= total){
        let moved = false;
        for (let i=state.idxCat+1; i<DATA.length; i++){
          const t = DATA[i].palavras.length; if (getFirstUnfinished(i, t) < t){ state.idxCat = i; state.idxWord = 0; moved = true; break; }
        }
        if (!moved){ /* todas concluídas */ }
      } else {
        state.idxWord = next;
      }
      setTimeout(()=> novaRodada(), 600);
      if (document.querySelector('#solvedDrawer.open')) renderSolvedDrawer();
    } else {
      $('#feedback').textContent = `Proximidade: ${prox.icon} — ${prox.pct}%`;
    }
    $('#palpite').value=''; $('#palpite').focus();
  });

  // Dicas
  on($('#ajuda'), 'click', async ()=>{
    if (state.ajudas <= 0) { $('#feedback').textContent = 'Sem mais dicas nesta rodada.'; return; }
    let msg=''; if (state.hintStep === 0){ const letras=state.answer.length; msg=`A resposta tem ${letras} letras.`; } else if (state.hintStep === 1){ msg=`Começa com "${state.answer[0].toUpperCase()}".`; } else { const w=getClosestWord(); msg = w ? `Uma palavra bem próxima é "${w}".` : 'Sem palavra próxima disponível.'; }
    state.ajudas--; state.hintStep++; $('#ajudasRest').textContent = state.ajudas; state.pontosRodada = Math.max(0, state.pontosRodada - 10); $('#pontosRodada').textContent = state.pontosRodada; $('#feedback').textContent = '\uD83D\uDCA1 ' + msg; await logEvent({ action:'hint', player:state.nome, ts:new Date().toISOString(), category:state.categoria, wordIndex: state.idxWord, hintStep: state.hintStep });
  });

  // Limpar & Zerar
  on($('#limpar'), 'click', ()=>{ $('#palpite').value=''; $('#palpite').focus(); });
  on($('#zerar'), 'click', zerarTudo);

  registerShortcuts();
  if ('serviceWorker' in navigator){ try{ navigator.serviceWorker.register('./sw.js'); }catch(e){ console.warn('SW falhou', e); } }
}

window.addEventListener('DOMContentLoaded', main);
