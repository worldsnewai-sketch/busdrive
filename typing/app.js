(() => {
  const SENTENCES_PER_ROUND = 10;
  const RANK_KEY = 'ssuk-typing-ranking-v1';
  const NAME_KEY = 'ssuk-typing-name';
  const RANK_LIMIT = 200; // 저장해 둘 최대 기록 수
  // 학년별 목표 점수(별 3개 기준). 점수 = 평균 타수 × 정확도
  const GRADE_GOAL = { 1: 40, 2: 60, 3: 90, 4: 120, 5: 150, 6: 180 };
  // 자소 단위 타수에 곱하는 보정값. 짧고 쉬운 문장이라 한컴타자연습보다 높게 나오는 것을 맞춤
  const SPEED_SCALE = 0.6;
  const perMinute = (strokes, secs) => Math.round((strokes / secs) * 60 * SPEED_SCALE);

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
    lastScreen: 'grade',
    lastEntryId: null,
  };

  // ---------- 한글 타수 계산 ----------
  // 한 글자를 치는 데 필요한 키 수. 겹모음(ㅘ 등)과 겹받침(ㄳ 등)은 2타
  const DOUBLE_VOWELS = new Set([9, 10, 11, 14, 15, 16, 19]);
  const DOUBLE_FINALS = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]);
  function keystrokes(text) {
    let n = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0) - 0xac00;
      if (code >= 0 && code < 11172) {
        const jung = Math.floor((code % 588) / 28);
        const jong = code % 28;
        n += 1; // 초성
        n += DOUBLE_VOWELS.has(jung) ? 2 : 1;
        if (jong) n += DOUBLE_FINALS.has(jong) ? 2 : 1;
      } else {
        n += 1;
      }
    }
    return n;
  }

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

  // 맞게 친 타수(정타수): 문장의 타수에서 틀린 글자 비율만큼 뺌
  function correctStrokes(target, typed) {
    const len = [...target].length;
    return len ? keystrokes(target) * (correctChars(target, typed) / len) : 0;
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
    if (name !== 'ranking') state.lastScreen = name;
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => show(btn.dataset.back));
  });
  $('go-home').addEventListener('click', () => show('grade'));

  // ---------- 1. 학년 ----------
  const nameInput = $('player-name');
  try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* 저장소를 못 쓰는 환경 */ }

  const gradeList = $('grade-list');
  for (let g = 1; g <= 6; g++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tile grade-${g}`;
    btn.innerHTML = `<b>${g}</b><span>학년</span>`;
    btn.addEventListener('click', () => chooseGrade(g));
    gradeList.appendChild(btn);
  }

  function chooseGrade(g) {
    const name = nameInput.value.trim();
    if (!name) {
      $('grade-hint').textContent = '먼저 이름을 써 주세요! ✏️';
      nameInput.focus();
      return;
    }
    $('grade-hint').textContent = '';
    state.name = name;
    state.grade = g;
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 무시 */ }
    $('topic-sub').textContent = `${name} 친구, ${g}학년에 맞는 문장이 나와요.`;
    show('topic');
  }

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
    $('play-topic').textContent = `${topic.icon} ${topic.name} · ${state.grade}학년`;
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
    const speed = secs > 1 && typed ? perMinute(correctStrokes(head, typed), secs) : 0;
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
    const strokes = correctStrokes(target, typed);
    state.results.push({
      target,
      typed,
      secs,
      strokes,
      correct: correctChars(target, typed),
      length: [...target].length,
      speed: perMinute(strokes, secs),
    });
    state.index++;
    if (state.index >= state.sentences.length) finishRound();
    else loadSentence();
  }

  $('quit').addEventListener('click', () => {
    if (confirm('연습을 그만할까요? 지금까지 한 기록은 저장되지 않아요.')) show('topic');
  });

  // ---------- 4. 결과 ----------
  function finishRound() {
    $('progress-bar').style.width = '100%';
    const r = state.results;
    const totalSecs = r.reduce((s, x) => s + x.secs, 0);
    const totalStrokes = r.reduce((s, x) => s + x.strokes, 0);
    const accuracy = r.reduce((s, x) => s + x.correct, 0) / r.reduce((s, x) => s + x.length, 0);
    const speed = perMinute(totalStrokes, totalSecs);
    const best = Math.max(...r.map((x) => x.speed));
    const score = Math.round(speed * accuracy);
    const accPct = Math.round(accuracy * 100);

    const goal = GRADE_GOAL[state.grade];
    let stars = score >= goal ? 3 : score >= goal * 0.6 ? 2 : 1;
    if (accPct < 70) stars = 1;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: state.name,
      grade: state.grade,
      topic: state.topic.id,
      score,
      speed,
      accuracy: accPct,
      date: new Date().toISOString(),
    };
    const rank = saveEntry(entry);
    state.lastEntryId = entry.id;

    $('result-title').textContent = ['', '잘했어요! 👍', '아주 잘했어요! 🎉', '최고예요! 🏅'][stars];
    $('result-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    $('res-score').textContent = score;
    $('res-speed').textContent = `${speed}타`;
    $('res-acc').textContent = `${accPct}%`;
    $('res-best').textContent = `${best}타`;
    $('res-time').textContent = formatTime(totalSecs);
    $('res-rank').textContent = `${state.grade}학년 · ${state.topic.name} 랭킹 ${rank}등!`;
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
      m.textContent = `${x.secs.toFixed(1)}초 · ${x.speed}타 · 정확도 ${pct}%`;
      li.append(t, y, m);
      list.appendChild(li);
    });

    show('result');
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

  $('again').addEventListener('click', () => startRound(state.topic));
  $('see-ranking').addEventListener('click', () => openRanking(String(state.grade), state.topic.id));

  // ---------- 5. 랭킹 ----------
  function loadRanking() {
    try { return JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch (e) { return []; }
  }

  function saveEntry(entry) {
    let list = loadRanking();
    list.push(entry);
    list.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
    list = list.slice(0, RANK_LIMIT);
    try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); } catch (e) { /* 무시 */ }
    const same = list.filter((x) => x.grade === entry.grade && x.topic === entry.topic);
    const pos = same.findIndex((x) => x.id === entry.id);
    return pos >= 0 ? pos + 1 : same.length + 1;
  }

  const rankGrade = $('rank-grade');
  const rankTopic = $('rank-topic');
  rankGrade.add(new Option('모든 학년', 'all'));
  for (let g = 1; g <= 6; g++) rankGrade.add(new Option(`${g}학년`, String(g)));
  rankTopic.add(new Option('모든 주제', 'all'));
  topics.forEach((t) => rankTopic.add(new Option(`${t.icon} ${t.name}`, t.id)));
  rankGrade.addEventListener('change', renderRanking);
  rankTopic.addEventListener('change', renderRanking);

  function openRanking(grade = 'all', topic = 'all') {
    rankGrade.value = grade;
    rankTopic.value = topic;
    renderRanking();
    show('ranking');
  }

  function renderRanking() {
    const g = rankGrade.value;
    const t = rankTopic.value;
    const rows = loadRanking()
      .filter((x) => (g === 'all' || String(x.grade) === g) && (t === 'all' || x.topic === t))
      .slice(0, 20);
    const body = $('rank-body');
    body.textContent = '';
    rows.forEach((x, i) => {
      const tr = document.createElement('tr');
      if (x.id === state.lastEntryId) tr.className = 'me';
      const topic = topicById(x.topic);
      const medal = ['🥇', '🥈', '🥉'][i] || String(i + 1);
      [medal, x.name, `${x.grade}학년`, topic ? `${topic.icon} ${topic.name}` : '-', x.score, `${x.speed}타`, `${x.accuracy}%`]
        .forEach((v) => {
          const td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        });
      body.appendChild(tr);
    });
    $('rank-empty').hidden = rows.length > 0;
  }

  $('go-ranking').addEventListener('click', () => {
    if (!$('screen-play').hidden && state.index > 0 && !confirm('연습 중이에요. 랭킹을 보러 갈까요?')) return;
    openRanking();
  });
  $('ranking-back').addEventListener('click', () => show(state.lastScreen === 'play' ? 'topic' : state.lastScreen));
  $('rank-clear').addEventListener('click', () => {
    if (!confirm('이 컴퓨터에 저장된 랭킹을 모두 지울까요?')) return;
    try { localStorage.removeItem(RANK_KEY); } catch (e) { /* 무시 */ }
    renderRanking();
  });

  show('grade');
})();
