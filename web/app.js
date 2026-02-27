const TOTAL_QUESTIONS = 5;

const categoryLabel = {
  basics: '기초',
  arrays: '배열',
  pointers: '포인터',
  functions: '함수',
  structs: '구조체',
};

const state = {
  index: 0,
  current: null,
  questions: [],
  answers: [],
  outputAnswer: '',
  code: '',
  showHint: false,
  loading: false,
  checking: false,
  feedback: null,
  result: null,
};

const progressEl = document.getElementById('progress');
const mainEl = document.getElementById('main');
const footerEl = document.getElementById('footer');
const feedbackEl = document.getElementById('feedback');

/**
 * Escapes HTML special characters.
 *
 * @param {string} value - Raw text.
 * @return {string} Escaped text.
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Converts text to a single-line preview.
 *
 * @param {string} value - Raw text.
 * @return {string} Preview text.
 */
function preview(value) {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const escaped = normalized.replaceAll('\n', '\\n').replaceAll('\t', '\\t');
  return escaped.length > 0 ? escaped : '(empty)';
}

/**
 * Calls JSON API endpoint.
 *
 * @param {string} path - API path.
 * @param {unknown} payload - JSON body.
 * @return {Promise<any>} Parsed response data.
 */
async function post(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '요청 실패');
  }
  return data;
}

/**
 * Updates top progress text.
 *
 * @return {void}
 */
function updateProgress() {
  progressEl.textContent = `${Math.min(state.index + 1, TOTAL_QUESTIONS)}/${TOTAL_QUESTIONS}`;
}

/**
 * Renders feedback banner.
 *
 * @return {void}
 */
function renderFeedback() {
  if (!state.feedback) {
    feedbackEl.className = 'feedback hidden';
    feedbackEl.innerHTML = '';
    return;
  }

  const cls = state.feedback.isCorrect ? 'ok' : 'bad';
  const details = (state.feedback.details || [])
    .map((item) => (
      `<li>[${item.index}] ${item.passed ? '통과' : '실패'} | 입력=${escapeHtml(preview(item.input))} | 실제=${escapeHtml(preview(item.actual))}</li>`
    ))
    .join('');

  feedbackEl.className = `feedback ${cls}`;
  feedbackEl.innerHTML = `
    <div>${state.feedback.isCorrect ? '정답입니다.' : '오답입니다.'}</div>
    <div>내 답안: ${escapeHtml(state.feedback.submittedAnswer || '')}</div>
    ${state.feedback.isCorrect ? '' : `<div>정답: ${escapeHtml(state.feedback.expectedAnswer || '')}</div>`}
    ${details ? `<ul class="list">${details}</ul>` : ''}
    <div class="buttons">
      <button class="primary" id="nextBtn">다음 문제</button>
    </div>
  `;

  const nextBtn = document.getElementById('nextBtn');
  nextBtn?.addEventListener('click', () => {
    void advanceAfterFeedback();
  });
}

/**
 * Loads one question from server by current index.
 *
 * @return {Promise<void>}
 */
async function loadQuestion() {
  state.loading = true;
  state.feedback = null;
  state.showHint = false;
  state.outputAnswer = '';
  state.code = '';
  render();

  try {
    const data = await post('/api/assessment/question', { index: state.index });
    state.current = data.question;
    state.code = data.question.code || '';
  } catch (error) {
    state.current = null;
    state.feedback = {
      isCorrect: false,
      submittedAnswer: '',
      expectedAnswer: '',
      details: [],
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    state.loading = false;
    render();
  }
}

/**
 * Submits output-answer question.
 *
 * @return {Promise<void>}
 */
async function submitOutputAnswer() {
  if (!state.current || state.current.type !== 'output' || state.checking) {
    return;
  }

  state.checking = true;
  render();
  try {
    const data = await post('/api/assessment/evaluate', {
      question: state.current,
      answer: state.outputAnswer,
    });
    state.feedback = data;
  } catch (error) {
    state.feedback = {
      isCorrect: false,
      submittedAnswer: '',
      expectedAnswer: '',
      details: [],
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    state.checking = false;
    render();
  }
}

/**
 * Submits coding question with current code editor value.
 *
 * @return {Promise<void>}
 */
async function submitCode() {
  if (!state.current || state.current.type !== 'coding' || state.checking) {
    return;
  }

  state.checking = true;
  render();
  try {
    const data = await post('/api/assessment/evaluate', {
      question: state.current,
      code: state.code,
    });
    state.feedback = data;
  } catch (error) {
    state.feedback = {
      isCorrect: false,
      submittedAnswer: '',
      expectedAnswer: '',
      details: [],
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    state.checking = false;
    render();
  }
}

/**
 * Moves to next question or finishes assessment result.
 *
 * @return {Promise<void>}
 */
async function advanceAfterFeedback() {
  if (!state.current || !state.feedback) {
    return;
  }

  state.questions.push(state.current);
  state.answers.push(state.feedback.answerToken || '');
  state.feedback = null;

  if (state.index + 1 >= TOTAL_QUESTIONS) {
    const data = await post('/api/assessment/result', {
      questions: state.questions,
      answers: state.answers,
    });
    state.result = data.result;
    render();
    return;
  }

  state.index += 1;
  await loadQuestion();
}

/**
 * Renders final result screen.
 *
 * @return {string} Result HTML.
 */
function renderResult() {
  if (!state.result) {
    return '<div class="center">결과가 없습니다.</div>';
  }

  const scores = state.result.scores;
  const rows = Object.entries(scores).map(([key, score]) => (
    `<div class="result-row">
      <div>${escapeHtml(categoryLabel[key] || key)}</div>
      <div class="bar"><div class="bar-fill" style="width:${score}%"></div></div>
      <div>${score}%</div>
    </div>`
  )).join('');

  return `
    <div class="panel">
      <h2>진단 결과</h2>
      <p>레벨: <strong>${escapeHtml(state.result.skillLevel)}</strong></p>
      <div class="result-grid">${rows}</div>
      <p class="muted">보완 필요: ${escapeHtml((state.result.recommendedTopics || []).join(', ') || '없음')}</p>
    </div>
  `;
}

/**
 * Renders assessment question layout.
 *
 * @return {string} Question HTML.
 */
function renderQuestion() {
  if (!state.current) {
    return '<div class="center">문제를 불러올 수 없습니다.</div>';
  }

  const q = state.current;
  const hint = state.showHint && q.hints?.[0]
    ? `<p class="muted">힌트: ${escapeHtml(q.hints[0])}</p>`
    : '';

  if (q.type === 'output') {
    return `
      <div class="layout">
        <section class="panel">
          <h2>${escapeHtml(categoryLabel[q.category] || q.category)} · 출력 예측형</h2>
          <p>${escapeHtml(q.question || '')}</p>
          <pre class="code">${escapeHtml(q.code || '')}</pre>
          ${hint}
        </section>
        <section class="panel">
          <h2>답안 입력</h2>
          <input id="outputInput" type="text" value="${escapeHtml(state.outputAnswer)}" placeholder="정답 입력" />
          <div class="buttons">
            <button class="primary" id="submitOutputBtn">${state.checking ? '채점 중...' : '제출'}</button>
          </div>
        </section>
      </div>
    `;
  }

  const cases = (q.testCases || [])
    .map((testCase, index) => `<li>[${index + 1}] 입력: ${escapeHtml(preview(testCase.input))}</li>`)
    .join('');

  return `
    <div class="layout two">
      <section class="panel">
        <h2>${escapeHtml(categoryLabel[q.category] || q.category)} · 코드 작성형</h2>
        <p>${escapeHtml(q.question || '')}</p>
        <h2>스타터 코드</h2>
        <pre class="code">${escapeHtml(q.code || '')}</pre>
        <h2>테스트 케이스</h2>
        <ul class="list">${cases}</ul>
        ${hint}
      </section>
      <section class="panel">
        <h2>코드 에디터</h2>
        <textarea id="codeEditor" spellcheck="false">${escapeHtml(state.code)}</textarea>
        <div class="buttons">
          <button class="primary" id="runBtn">${state.checking ? '채점 중...' : '코드 채점 (Ctrl+P)'}</button>
        </div>
      </section>
    </div>
  `;
}

/**
 * Attaches event listeners after each render.
 *
 * @return {void}
 */
function bindEvents() {
  const outputInput = document.getElementById('outputInput');
  if (outputInput) {
    outputInput.addEventListener('input', (event) => {
      state.outputAnswer = event.target.value;
    });
    outputInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submitOutputAnswer();
      }
    });
  }

  const codeEditor = document.getElementById('codeEditor');
  if (codeEditor) {
    codeEditor.addEventListener('input', (event) => {
      state.code = event.target.value;
    });
  }

  const submitOutputBtn = document.getElementById('submitOutputBtn');
  submitOutputBtn?.addEventListener('click', () => {
    void submitOutputAnswer();
  });

  const runBtn = document.getElementById('runBtn');
  runBtn?.addEventListener('click', () => {
    void submitCode();
  });
}

/**
 * Renders full application view.
 *
 * @return {void}
 */
function render() {
  updateProgress();
  renderFeedback();

  if (state.result) {
    footerEl.textContent = '진단이 완료되었습니다.';
    mainEl.innerHTML = renderResult();
    bindEvents();
    return;
  }

  if (state.loading) {
    footerEl.textContent = '문제를 생성 중입니다...';
    mainEl.innerHTML = '<div class="center">문제를 생성 중입니다...</div>';
    return;
  }

  if (state.current?.type === 'coding') {
    footerEl.textContent = 'Ctrl+H: 힌트 | Ctrl+P: 코드 채점';
  } else {
    footerEl.textContent = 'Ctrl+H: 힌트';
  }

  mainEl.innerHTML = renderQuestion();
  bindEvents();
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    state.showHint = !state.showHint;
    render();
  }

  if (event.ctrlKey && event.key.toLowerCase() === 'p' && state.current?.type === 'coding') {
    event.preventDefault();
    void submitCode();
  }
});

void loadQuestion();
