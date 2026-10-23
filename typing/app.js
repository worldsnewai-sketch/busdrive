(() => {
  const SENTENCES_PER_ROUND = 5;
  const RANK_KEY = 'mosan-typing-ranking-v1';
  const PLAYER_KEY = 'mosan-typing-player'; // 마지막으로 고른 학년과 이름
  const RANK_LIMIT = 3000; // 저장해 둘 최대 기록 수 (이름·학년·주제마다 최고 기록 하나)
  const TOP_N = 20;
  // 학년별 목표 점수(별 3개 기준). 점수 = 1분에 친 글자 수 × 정확도
  const GRADE_GOAL = { 1: 20, 2: 30, 3: 40, 4: 55, 5: 70, 6: 80, 7: 100 };
  // 교직원은 학년 7로 저장하고 5~6학년 문장을 씀
  const STAFF = 7;
  const GRADES = [1, 2, 3, 4, 5, 6, STAFF];
  const gradeLabel = (g) => (Number(g) === STAFF ? '교직원' : `${g}학년`);
  const perMinute = (letters, secs) => Math.round((letters / secs) * 60);

  const $ = (id) => document.getElementById(id);
  const topics = window.TOPICS;

  const state = {
    name: '',
    grade: 0,
    topic: null,
    sentences: [],
    index: 0,
    startedAt: 0, // 현재 문장의 시간을 재기 시작한 시각
    composing: false,
    results: [],
    rankTab: 'all',
    rankSel: '',
  };

  // ---------- 글자 수 계산 ----------
  // 띄어쓰기는 글자로 세지 않음 (문장부호는 셈)
  const letterCount = (text) => [...text].filter((ch) => ch.trim()).length;

  // 글자 단위 편집 거리 (빠뜨리거나 더 쓴 글자도 한 글자 실수로 셈)
  function editDistance(a, b) {
    const A = [...a], B = [...b];
    let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
    for (let i = 1; i <= A.length; i++) {
      const cur = [i];
      for (let j = 1; j <= B.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[B.length];
  }

  function correctChars(target, typed) {
    const len = [...target].length;
    return Math.max(0, len - editDistance(target, typed));
  }

  // 맞게 친 글자 수: 문장의 글자 수에서 틀린 글자 비율만큼 뺌
  function correctLetters(target, typed) {
    const len = [...target].length;
    return len ? letterCount(target) * (correctChars(target, typed) / len) : 0;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const band = (grade) => (grade <= 2 ? 'low' : grade <= 4 ? 'mid' : 'high');
  const topicById = (id) => topics.find((t) => t.id === id);

  // ---------- 화면 전환 ----------
  function show(name) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== `screen-${name}`; });
    if (name === 'grade') { renderHall(); refresh(); }
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => show(btn.dataset.back));
  });
  $('go-home').addEventListener('click', () => show('grade'));

  // ---------- 1. 학년과 이름 ----------
  const nameInput = $('player-name');
  const gradeList = $('grade-list');
  const nameChips = $('name-chips');

  GRADES.forEach((g) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tile grade-${g}`;
    btn.dataset.grade = g;
    btn.innerHTML = g === STAFF ? '<b>🧑‍🏫</b><span>교직원</span>' : `<b>${g}</b><span>학년</span>`;
    btn.addEventListener('click', () => selectGrade(g));
    gradeList.appendChild(btn);
  });

  function selectGrade(g) {
    state.grade = g;
    gradeList.querySelectorAll('.tile').forEach((el) => el.classList.toggle('selected', Number(el.dataset.grade) === g));
    renderNameChips();
  }

  // 이 컴퓨터에서 그 학년으로 연습했던 이름을 고를 수 있게 보여 줌
  function renderNameChips() {
    const names = [...new Set(loadRanking().filter((x) => x.grade === state.grade).map((x) => x.name))]
      .sort((a, b) => a.localeCompare(b, 'ko'));
    nameChips.textContent = '';
    names.forEach((name) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = name;
      chip.addEventListener('click', () => {
        nameInput.value = name;
        markChip();
      });
      nameChips.appendChild(chip);
    });
    nameChips.hidden = names.length === 0;
    markChip();
  }

  function markChip() {
    const name = nameInput.value.trim();
    nameChips.querySelectorAll('.chip').forEach((el) => el.classList.toggle('selected', el.textContent === name));
  }
  nameInput.addEventListener('input', markChip);

  $('to-topic').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const hint = $('grade-hint');
    if (!state.grade) { hint.textContent = '먼저 학년을 골라 주세요! 🙌'; return; }
    if (!name) { hint.textContent = '이름을 고르거나 써 주세요! ✏️'; nameInput.focus(); return; }
    hint.textContent = '';
    state.name = name;
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify({ grade: state.grade, name })); } catch (e) { /* 무시 */ }
    $('topic-sub').textContent = state.grade === STAFF
      ? `${name} 선생님, 5~6학년 문장으로 도전해 보세요!`
      : `${name} 친구, ${state.grade}학년에 맞는 문장이 나와요.`;
    show('topic');
  });

  // ---------- 2. 주제 ----------
  const topicList = $('topic-list');
  topics.forEach((t) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile topic';
    btn.innerHTML = `<i>${t.icon}</i><span>${t.name}</span>`;
    btn.addEventListener('click', () => startRound(t));
    topicList.appendChild(btn);
  });

  // ---------- 3. 타자 연습 ----------
  const input = $('typing-input');
  const targetEl = $('target');

  function startRound(topic) {
    state.topic = topic;
    state.sentences = shuffle(topic[band(state.grade)]).slice(0, SENTENCES_PER_ROUND);
    state.index = 0;
    state.results = [];
    $('play-topic').textContent = `${topic.icon} ${topic.name} · ${gradeLabel(state.grade)}`;
    show('play');
    loadSentence();
  }

  function loadSentence() {
    const i = state.index;
    const total = state.sentences.length;
    $('play-count').textContent = `${i + 1} / ${total}`;
    $('progress-bar').style.width = `${(i / total) * 100}%`;
    const next = state.sentences[i + 1];
    $('next-sentence').textContent = next ? `다음: ${next}` : '마지막 문장이에요! 💪';
    input.value = '';
    // 첫 문장은 첫 키를 누를 때부터, 그다음 문장은 미리 보여 줬으니 나타난 순간부터 잰다
    state.startedAt = i > 0 ? performance.now() : 0;
    renderTarget();
    updateLive();
    input.focus();
  }

  function renderTarget() {
    const target = [...state.sentences[state.index]];
    const typed = [...input.value];
    targetEl.textContent = '';
    target.forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      if (i < typed.length) {
        const isLast = i === typed.length - 1;
        if (typed[i] === ch) span.className = 'ok';
        // 조합 중인 마지막 글자는 아직 틀렸다고 하지 않음
        else span.className = isLast && state.composing ? 'typing' : 'bad';
      }
      if (i === typed.length) span.classList.add('cursor');
      targetEl.appendChild(span);
    });
    input.classList.toggle('over', typed.length > target.length);
  }

  function updateLive() {
    const typed = input.value;
    const secs = state.startedAt ? (performance.now() - state.startedAt) / 1000 : 0;
    const target = state.sentences[state.index];
    const head = [...target].slice(0, [...typed].length).join('');
    const speed = secs > 1 && typed ? perMinute(correctLetters(head, typed), secs) : 0;
    const acc = typed ? Math.round((correctChars(head, typed) / Math.max(1, [...head].length)) * 100) : 100;
    $('live-speed').textContent = speed;
    $('live-acc').textContent = `${acc}%`;
  }

  input.addEventListener('keydown', (e) => {
    if (!state.startedAt && e.key !== 'Enter' && e.key !== 'Tab') state.startedAt = performance.now();
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submitSentence();
    }
  });
  // 휴대폰 키보드는 keydown이 늦게 오기도 해서 input 때도 시작 시각을 잡음
  input.addEventListener('input', () => {
    if (!state.startedAt) state.startedAt = performance.now();
    renderTarget();
    updateLive();
  });
  input.addEventListener('compositionstart', () => { state.composing = true; });
  input.addEventListener('compositionend', () => { state.composing = false; renderTarget(); });
  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('drop', (e) => e.preventDefault());
  setInterval(() => { if (!$('screen-play').hidden) updateLive(); }, 300);

  function submitSentence() {
    const typed = input.value.trim();
    if (!typed) return;
    const target = state.sentences[state.index];
    const secs = Math.max(0.5, (performance.now() - (state.startedAt || performance.now())) / 1000);
    const letters = correctLetters(target, typed);
    state.results.push({
      target,
      typed,
      secs,
      letters,
      correct: correctChars(target, typed),
      length: [...target].length,
      speed: perMinute(letters, secs),
    });
    state.index++;
    if (state.index >= state.sentences.length) finishRound();
    else loadSentence();
  }

  // 중간에 그만두면 기록 없이 랭킹 화면으로
  $('quit').addEventListener('click', () => openRanking('all', '', 'quit'));

  // ---------- 4. 결과 ----------
  async function finishRound() {
    $('progress-bar').style.width = '100%';
    const r = state.results;
    const totalSecs = r.reduce((s, x) => s + x.secs, 0);
    const totalLetters = r.reduce((s, x) => s + x.letters, 0);
    const accuracy = r.reduce((s, x) => s + x.correct, 0) / r.reduce((s, x) => s + x.length, 0);
    const speed = perMinute(totalLetters, totalSecs);
    const best = Math.max(...r.map((x) => x.speed));
    const score = Math.round(speed * accuracy);
    const accPct = Math.round(accuracy * 100);

    const goal = GRADE_GOAL[state.grade];
    let stars = score >= goal ? 3 : score >= goal * 0.6 ? 2 : 1;
    if (accPct < 70) stars = 1;

    const entry = {
      name: state.name,
      grade: state.grade,
      topic: state.topic.id,
      score,
      speed,
      accuracy: accPct,
    };

    $('result-title').textContent = ['', '잘했어요! 👍', '아주 잘했어요! 🎉', '최고예요! 🏅'][stars];
    $('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    $('res-score').textContent = score;
    $('res-speed').textContent = `${speed}자`;
    $('res-acc').textContent = `${accPct}%`;
    $('res-best').textContent = `${best}자`;
    $('res-time').textContent = formatTime(totalSecs);
    $('res-rank').textContent = '랭킹에 등록하는 중… ⏳';
    $('res-tip').textContent = tipFor(accPct, score, goal);

    const list = $('res-list');
    list.textContent = '';
    r.forEach((x) => {
      const li = document.createElement('li');
      const pct = Math.round((x.correct / x.length) * 100);
      li.className = pct === 100 ? 'perfect' : '';
      const t = document.createElement('div');
      t.className = 'r-target';
      t.textContent = x.target;
      const y = document.createElement('div');
      y.className = 'r-typed';
      y.textContent = x.typed;
      const m = document.createElement('div');
      m.className = 'r-meta';
      m.textContent = `${x.secs.toFixed(1)}초 · 1분에 ${x.speed}자 · 정확도 ${pct}%`;
      li.append(t, y, m);
      list.appendChild(li);
    });

    openRanking('grade', String(state.grade), 'result');

    const saved = await saveEntry(entry);
    const board = rankRows('grade', String(state.grade));
    const rank = board.findIndex((x) => x.name === state.name) + 1;
    const myBest = board[rank - 1];
    $('res-rank').textContent = !saved
      ? '인터넷 연결이 불안정해서 랭킹에 등록하지 못했어요. 😢'
      : myBest && myBest.score > score
        ? `${gradeLabel(state.grade)} 랭킹 ${rank}등 (내 최고 기록 ${myBest.score}점)`
        : `${gradeLabel(state.grade)} 랭킹 ${rank}등!`;
    renderRanking();
  }

  function tipFor(acc, score, goal) {
    if (acc < 80) return '천천히, 정확하게 쓰는 연습부터 해 봐요. 속도는 저절로 빨라져요!';
    if (score < goal * 0.6) return '정확하게 잘 썼어요! 손가락 자리를 기억하면 더 빨라질 거예요.';
    if (score < goal) return '조금만 더 하면 별 세 개! 화면만 보고 쳐 보세요.';
    return '대단해요! 다른 주제에도 도전해 보세요.';
  }

  function formatTime(secs) {
    const s = Math.round(secs);
    return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
  }


  // ---------- 5. 랭킹 ----------
  // Vercel에 올리면 api/scores로 학교 전체가 같은 랭킹을 씀.
  // 서버가 없으면(파일로 열었거나 미리보기) 이 컴퓨터(localStorage)에 저장
  const API = 'api/scores';
  let shared = null; // 서버에서 받은 랭킹. null이면 이 컴퓨터에만 저장
  let saves = 0; // 저장한 횟수. 저장보다 먼저 출발한 불러오기 결과는 버림
  // 서버가 랭킹을 몇 초 동안 재사용하므로, 방금 저장한 기록은 잠깐 동안 직접 끼워 넣음
  let justSaved = null; // { entry, at }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch (e) { return []; }
  }
  const loadRanking = () => shared || loadLocal();

  const byScore = (a, b) => b.score - a.score || b.accuracy - a.accuracy;

  // 이름·학년·주제마다 가장 높은 기록만 남김
  function keepBest(list) {
    const key = (x) => `${x.name}|${x.grade}|${x.topic}`;
    const best = new Map();
    list.slice().sort(byScore).forEach((x) => { if (!best.has(key(x))) best.set(key(x), x); });
    return [...best.values()].slice(0, RANK_LIMIT);
  }

  function saveLocal(list) {
    try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); } catch (e) { /* 무시 */ }
  }

  async function fetchRanking() {
    const started = saves;
    try {
      const res = await fetch(API, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const { entries } = await res.json();
      if (started !== saves) return;
      shared = justSaved && Date.now() - justSaved.at < 20000 ? keepBest([...entries, justSaved.entry]) : entries;
    } catch (e) { /* 서버가 없으면 이 컴퓨터 기록을 씀 */ }
    $('storage-hint').textContent = shared
      ? '랭킹은 모산초등학교 모두가 함께 봐요.'
      : '랭킹은 이 컴퓨터(브라우저)에 저장돼요.';
  }

  async function saveEntry(entry) {
    saves++;
    if (!shared) {
      saveLocal(keepBest([...loadLocal(), { ...entry, date: new Date().toISOString() }]));
      return true;
    }
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      if (!res.ok) return false;
      shared = (await res.json()).entries;
      justSaved = { entry: { ...entry, date: new Date().toISOString() }, at: Date.now() };
      return true;
    } catch (e) {
      return false;
    }
  }

  // 화면을 바꾼 뒤 최신 랭킹을 받아 다시 그림
  function refresh() {
    fetchRanking().then(() => {
      if (!$('screen-grade').hidden) { renderHall(); renderNameChips(); }
      if (!$('screen-ranking').hidden) renderRanking();
    });
  }

  // 같은 이름은 가장 높은 기록 하나만. 전체 랭킹은 학생끼리만 겨루도록 교직원을 빼고 보여 줌
  // (교직원 기록은 지우지 않고 학년별 '교직원'에서 볼 수 있음)
  function rankRows(tab, sel) {
    const seen = new Set();
    return loadRanking()
      .filter((x) => (tab === 'all' ? x.grade !== STAFF : tab === 'grade' ? String(x.grade) === sel : x.topic === sel))
      .sort(byScore)
      .filter((x) => !seen.has(x.name) && seen.add(x.name));
  }

  const rankChips = $('rank-chips');
  const tabs = document.querySelectorAll('.tabs [data-tab]');
  tabs.forEach((btn) => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    const sel = tab === 'grade' ? String(state.grade || 1) : tab === 'topic' ? (state.topic || topics[0]).id : '';
    openRanking(tab, sel, currentMode());
  }));
  const currentMode = () => (!$('my-result').hidden ? 'result' : !$('quit-msg').hidden ? 'quit' : '');

  // mode: 'result' = 5문장을 끝낸 뒤, 'quit' = 중간에 그만둔 뒤
  function openRanking(tab = 'all', sel = '', mode = '') {
    state.rankTab = tab;
    state.rankSel = sel;
    $('my-result').hidden = mode !== 'result';
    $('quit-msg').hidden = mode !== 'quit';
    renderRanking();
    show('ranking');
    if (mode !== 'result') refresh();
  }

  function renderRanking() {
    const { rankTab: tab, rankSel: sel } = state;
    tabs.forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));

    const options = tab === 'grade'
      ? GRADES.map((g) => [String(g), gradeLabel(g)])
      : tab === 'topic' ? topics.map((t) => [t.id, `${t.icon} ${t.name}`]) : [];
    rankChips.textContent = '';
    options.forEach(([value, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${value === sel ? ' selected' : ''}`;
      chip.textContent = label;
      chip.addEventListener('click', () => openRanking(tab, value, currentMode()));
      rankChips.appendChild(chip);
    });
    rankChips.hidden = options.length === 0;

    const rows = rankRows(tab, sel).slice(0, TOP_N);
    const body = $('rank-body');
    body.textContent = '';
    rows.forEach((x, i) => {
      const tr = document.createElement('tr');
      if (x.name === state.name) tr.className = 'me';
      const topic = topicById(x.topic);
      const medal = ['🥇', '🥈', '🥉'][i] || String(i + 1);
      [medal, x.name, gradeLabel(x.grade), topic ? `${topic.icon} ${topic.name}` : '-', x.score, `${x.speed}자`, `${x.accuracy}%`]
        .forEach((v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        });
      body.appendChild(tr);
    });
    $('rank-empty').hidden = rows.length > 0;
  }

  $('go-ranking').addEventListener('click', () => openRanking('all', '', $('screen-play').hidden ? '' : 'quit'));
  $('restart').addEventListener('click', () => show('grade'));

  // ---------- 관리자: 기록 지우기 ----------
  // 학교 랭킹은 관리자 비밀번호가 있어야 지울 수 있음. 이름을 비우면 전체를 지움
  // (확인 창 confirm은 앱 페이지 안에서 막히므로 전체 삭제는 두 번 눌러야 함)
  $('admin-toggle').addEventListener('click', () => { $('admin').hidden = !$('admin').hidden; });
  const adminBtn = $('admin-delete');
  const adminMsg = $('admin-msg');
  let wipeTimer = 0;
  adminBtn.addEventListener('click', async () => {
    const name = $('admin-name').value.trim();
    if (!name && !wipeTimer) {
      adminMsg.textContent = '이름을 비우면 모든 기록이 지워져요. 정말 지우려면 한 번 더 누르세요.';
      wipeTimer = setTimeout(() => { wipeTimer = 0; adminMsg.textContent = ''; }, 4000);
      return;
    }
    clearTimeout(wipeTimer);
    wipeTimer = 0;
    saves++;
    if (shared) {
      try {
        const res = await fetch(API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: $('admin-pass').value, name }),
        });
        const data = await res.json();
        if (!res.ok) { adminMsg.textContent = data.error || '지우지 못했어요.'; return; }
        shared = data.entries;
        justSaved = null;
      } catch (e) {
        adminMsg.textContent = '인터넷 연결을 확인해 주세요.';
        return;
      }
    } else {
      saveLocal(name ? loadLocal().filter((x) => x.name !== name) : []);
    }
    adminMsg.textContent = name ? `'${name}' 기록을 지웠어요.` : '모든 기록을 지웠어요.';
    $('admin-name').value = '';
    renderRanking();
  });

  // ---------- 첫 화면 명예의 전당: 전체 1위와 학년별 1위 ----------
  function renderHall() {
    const hall = $('hall');
    hall.textContent = '';
    const boards = [['all', '', '전체 1위']].concat(GRADES.map((g) => ['grade', String(g), gradeLabel(g)]));
    boards.forEach(([tab, sel, label]) => {
      const top = rankRows(tab, sel)[0];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `hall-card${tab === 'all' ? ' champion' : ''}${top ? '' : ' empty'}`;
      const head = document.createElement('span');
      head.className = 'hall-label';
      head.textContent = tab === 'all' ? `👑 ${label}` : label;
      const who = document.createElement('b');
      who.textContent = top ? top.name : '도전!';
      const score = document.createElement('small');
      score.textContent = top ? `${top.score}점` : '비어 있어요';
      card.append(head, who, score);
      card.addEventListener('click', () => openRanking(tab, sel));
      hall.appendChild(card);
    });
  }

  // 지난번에 고른 학년과 이름을 미리 골라 둠
  try {
    const last = JSON.parse(localStorage.getItem(PLAYER_KEY));
    if (last) { nameInput.value = last.name || ''; if (last.grade) selectGrade(last.grade); }
  } catch (e) { /* 무시 */ }
  if (!state.grade) renderNameChips();

  show('grade');
})();
