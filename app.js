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
    const {done, remaining} = getCounts(idx, cat.palavras.length);
    const li = document.createElement('li');
    li.innerHTML = `<button data-idx="${idx}" class="ghost ${idx===state.idxCat?'active':''}">
      <strong>${cat.categoria}</strong>
      <span class="small muted">${done}/${cat.palavras.length} concluídas</span>
    </button>`;
    on(li.querySelector('button'), 'click', ()=>{
      state.idxCat = idx;
      state.idxWord = getFirstUnfinished(idx, cat.palavras.length);
      saveLast();
      closeModal($('#categoryPanel'));
      novaRodada();
    });
    ul.appendChild(li);
  });
}
function toggleCategory(open){ const dr=$('#categoryPanel'); if (!dr) return; if (open===undefined) open = !dr.classList.contains('open'); dr.classList.toggle('open', open); dr.setAttribute('aria-hidden', open?'false':'true'); $('#btnCategorias')?.setAttribute('aria-expanded', open?'true':'false'); if (open) updateCategoryChooserList(); }

// ===== Game Logic =====
let DATA = loadData();
function novaRodada(){
  const cat = DATA[state.idxCat];
  if (!cat) return;
  state.totalRodadas = cat.palavras.length;
  state.idxWord = getFirstUnfinished(state.idxCat, state.totalRodadas);
  if (state.idxWord >= state.totalRodadas){
    $('#feedback').textContent = `Parabéns! Você concluiu a categoria "${cat.categoria}"!`;
    $('#palpite').disabled = true; $('#enviar').disabled = true; $('#ajuda').disabled = true;
    return;
  }
  state.rodada = state.idxWord + 1;
  state.categoria = cat.categoria;
  state.answer = normalize(cat.palavras[state.idxWord]);
  state.rankMap = construirRankMap(cat.palavras);
  state.historico = getHistory(state.idxCat, state.idxWord).map(h=>h.guess);
  state.pontosRodada = 100;
  state.ajudas = 3;
  state.hintStep = 0;
  $('#rodadaAtual').textContent = state.rodada;
  $('#rodadasTot').textContent = state.totalRodadas;
  $('#categoria').textContent = state.categoria;
  $('#pontosRodada').textContent = state.pontosRodada;
  $('#ajudasRest').textContent = state.ajudas;
  $('#palpite').value = '';
  $('#palpite').disabled = false; $('#enviar').disabled = false; $('#ajuda').disabled = false;
  $('#historico').innerHTML = '';
  setProximity(0);
  renderHistorico();
  saveLast();
}

function renderHistorico(){
  const ul = $('#historico'); if (!ul) return; ul.innerHTML = '';
  const hist = getHistory(state.idxCat, state.idxWord);
  hist.forEach(h=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${h.guess}</strong> <span class="pill ${h.cls}">${h.icon} ${h.tip}</span>`;
    ul.appendChild(li);
  });
}

function checkGuess(guess){
  const guessNorm = primeiraPalavra(guess);
  if (!guessNorm) return;
  if (state.historico.includes(guessNorm)) return $('#feedback').textContent = `Você já tentou "${guessNorm}".`;
  
  const prox = proximidade(guessNorm, state.answer);
  pushHistory(state.idxCat, state.idxWord, {guess:guessNorm, ...prox});
  state.historico.unshift(guessNorm);
  renderHistorico();
  setProximity(prox.pct);
  
  if (guessNorm === state.answer){
    // Acertou
    $('#feedback').textContent = `🎉 Parabéns! Você acertou a palavra: "${DATA[state.idxCat].palavras[state.idxWord]}".`;
    markCompleted(state.idxCat, state.idxWord, state.totalRodadas);
    addSolved(state.idxCat, state.idxWord);
    
    // Atualiza pontuação total
    state.pontosTotal += state.pontosRodada;
    $('#pontosTotal').textContent = state.pontosTotal;
    
    // Salva no Firebase
    saveScoreToFirebase(state.nome, state.pontosTotal);
    
    // Atualiza estatísticas
    const s = loadStats(); s.rodadas++; s.ganhas++; saveStats(s);
    renderStatsGlobais();
    
    // Próxima rodada
    setTimeout(novaRodada, 2000);
    
  } else {
    // Errou
    $('#feedback').textContent = `Palpite "${guessNorm}" incorreto. Proximidade: ${prox.tip}.`;
    state.pontosRodada = Math.max(0, state.pontosRodada - 1);
    $('#pontosRodada').textContent = state.pontosRodada;
    
    // Penalidade por erro (a cada 10 erros)
    if (state.historico.length % 10 === 0 && state.pontosTotal > 0){
      state.pontosTotal = Math.max(0, state.pontosTotal - 1);
      $('#pontosTotal').textContent = state.pontosTotal;
      saveScoreToFirebase(state.nome, state.pontosTotal); // Salva penalidade
    }
    
    // Atualiza estatísticas
    const s = loadStats(); s.rodadas++; saveStats(s);
    renderStatsGlobais();
  }
  $('#palpite').value = '';
}

function useHint(){
  if (state.ajudas <= 0) return $('#feedback').textContent = 'Você não tem mais ajudas disponíveis.';
  if (state.pontosTotal < 10) return $('#feedback').textContent = 'Você precisa de pelo menos 10 pontos para pedir ajuda.';
  
  state.ajudas--;
  state.pontosTotal = Math.max(0, state.pontosTotal - 10);
  $('#pontosTotal').textContent = state.pontosTotal;
  $('#ajudasRest').textContent = state.ajudas;
  saveScoreToFirebase(state.nome, state.pontosTotal); // Salva custo da ajuda
  
  const word = DATA[state.idxCat].palavras[state.idxWord];
  let hint = '';
  switch(state.hintStep){
    case 0: hint = `A palavra tem ${word.length} letras.`; break;
    case 1: hint = `Começa com a letra "${word[0]}".`; break;
    case 2: hint = `Termina com a letra "${word[word.length-1]}".`; break;
    case 3: hint = `Uma palavra próxima é: "${getClosestWord()}".`; break;
    default: hint = `A palavra é: "${word}".`;
  }
  state.hintStep++;
  $('#feedback').textContent = `💡 Dica: ${hint}`;
}

// ===== Modals =====
function openModal(el){ el.hidden = false; el.classList.add('open'); }
function closeModal(el){ el.hidden = true; el.classList.remove('open'); }

// ===== Init =====
const DATA = loadData();
function init(){
  $('#appVersion').textContent = APP_VERSION;
  if (!localStorage.getItem(KEY_FIRST)){ openModal($('#onboarding')); }
  
  // Inicializa Firebase
  initFirebase();
  
  // Eventos
  on($('#btnCloseDrawer'), 'click', ()=> toggleDrawer(false));
  on($('#btnDrawer'), 'click', ()=> toggleDrawer());
  on($('#btnCloseSolved'), 'click', ()=> toggleSolved(false));
  on($('#btnSolved'), 'click', ()=> toggleSolved());
  on($('#btnCloseRanking'), 'click', ()=> toggleRanking(false));
  on($('#btnRanking'), 'click', ()=> toggleRanking());
  on($('#btnCloseCategory'), 'click', ()=> toggleCategory(false));
  on($('#btnCategorias'), 'click', ()=> toggleCategory());
  on($('#closeStats'), 'click', ()=> closeModal($('#statsPanel')));
  on($('#btnStats'), 'click', ()=> openModal($('#statsPanel')));
  on($('#btnOnboarding'), 'click', () => openModal($('#onboarding')));
  on($('#onStart'), 'click', () => { localStorage.setItem(KEY_FIRST, '1'); closeModal($('#onboarding')); $('#nome').focus(); });

  // Iniciar
  on($('#iniciar'), 'click', async ()=>{
    const nome=$('#nome').value.trim() || '—'; state.nome = nome; localStorage.setItem('dds-contexto-nome', nome);
    renderStatsGlobais();

    // 1. Recuperar pontuação do Firebase
    if (db && nome !== '—') {
      try {
        const doc = await db.collection('ranking').doc(nome).get();
        if (doc.exists) {
          state.pontosTotal = doc.data().pontosTotal || 0;
          console.log(`Pontuação de ${nome} recuperada do Firebase: ${state.pontosTotal}`);
        } else {
          state.pontosTotal = 0;
          console.log(`Jogador ${nome} não encontrado no Firebase. Iniciando com 0 pontos.`);
        }
      } catch (e) {
        console.error("Erro ao recuperar pontuação do Firebase:", e);
        state.pontosTotal = 0; // Fallback para 0 em caso de erro
      }
    } else {
      state.pontosTotal = 0;
    }

    // 2. Continuar com a lógica de rodada
    const last = (function(){ try{ return JSON.parse(localStorage.getItem(KEY_LAST)) || null; }catch{return null;} })();
    if (last && Number.isInteger(last.idxCat)){
      state.idxCat = Math.min(Math.max(0, last.idxCat), DATA.length-1);
    } else {
      state.idxCat = 0;
      for (let i=0;i<DATA.length;i++){ const total = DATA[i].palavras.length; if (getFirstUnfinished(i, total) < total){ state.idxCat = i; break; } }
    }
    
    // Recuperar o índice da palavra da última sessão
    const totalPalavras = DATA[state.idxCat].palavras.length;
    const lastWordIndex = getFirstUnfinished(state.idxCat, totalPalavras);
    state.idxWord = lastWordIndex;

    state.hintStep=0; $('#pontosTotal').textContent = state.pontosTotal;
    novaRodada();
  });

  // Palpite
  on($('#form'), 'submit', (e)=>{ e.preventDefault(); $('#enviar').click(); });
  on($('#enviar'), 'click', async ()=>{
    const palpite = $('#palpite').value;
    if (!palpite) return;
    checkGuess(palpite);
  });
  
  // Ajuda
  on($('#ajuda'), 'click', useHint);
  
  // Limpar
  on($('#limpar'), 'click', ()=>{ $('#palpite').value = ''; });
  
  // Atalhos de teclado
  on(document, 'keydown', (e)=>{
    if (e.key === 'Escape'){
      if ($('#palpite').value) $('#palpite').value = '';
      else if ($('#solvedDrawer').classList.contains('open')) toggleSolved(false);
      else if ($('#rankingDrawer').classList.contains('open')) toggleRanking(false);
      else if ($('#categoryPanel').classList.contains('open')) toggleCategory(false);
      else if ($('#statsPanel').hidden === false) closeModal($('#statsPanel'));
      else if ($('#onboarding').hidden === false) closeModal($('#onboarding'));
    } else if (e.key === '?'){
      if ($('#drawer').classList.contains('open')) toggleDrawer(false);
      else toggleDrawer(true);
    } else if (e.key === 'a' && document.activeElement !== $('#palpite')){
      e.preventDefault();
      useHint();
    }
  });
  
  // Renderização inicial
  renderStatsGlobais();
  if (state.nome !== '—'){
    $('#nome').value = state.nome;
    // Não chame $('#iniciar').click() aqui, pois ele redefine o estado.
    // Apenas renderize o nome e espere o usuário clicar em Iniciar.
    // $('#iniciar').click(); // REMOVIDO
  }
  
  // Se o nome já estiver preenchido, carregue o estado da categoria/rodada para exibição
  if (state.nome !== '—') {
    const last = loadLast();
    if (last && Number.isInteger(last.idxCat)){
      state.idxCat = Math.min(Math.max(0, last.idxCat), DATA.length-1);
    } else {
      state.idxCat = 0;
    }
    
    const totalPalavras = DATA[state.idxCat].palavras.length;
    state.idxWord = getFirstUnfinished(state.idxCat, totalPalavras);
    
    // Renderiza a categoria e rodada atual na tela de início
    $('#rodadaAtual').textContent = state.idxWord + 1;
    $('#rodadasTot').textContent = totalPalavras;
    $('#categoria').textContent = DATA[state.idxCat].categoria;
  }
}

// Inicia o app após o carregamento do DOM
on(document, 'DOMContentLoaded', init);
on(window, 'load', initFirebase); // Inicializa Firebase após o carregamento de todos os scripts
