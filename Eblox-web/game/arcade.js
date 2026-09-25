(() => {
    'use strict';
    const rules = window.EbloxArcadeRules;
    const kind = document.body.dataset.game;
    const snake = kind === 'snake';
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang') === 'en' ? 'en' : 'ru';
    const $ = id => document.getElementById(id);
    const text = {
        ru: {
            snake: 'Змейка', memory: 'Найди пару', back: '← В ebloX',
            snakeSubtitle: 'Собирай яблоки. Не врезайся. Побей рекорд.',
            memorySubtitle: '16 карточек. 8 пар. Доверься своей памяти.',
            score: 'Счёт', pairs: 'Найдено пар', best: 'Рекорд', moves: 'Ходы', tokens: 'Токены за игру',
            help: 'Управление', pause: 'Пауза', resume: 'Продолжить', restart: 'Заново', play: 'Играть',
            ready: 'Готов к игре?', paused: 'Игра на паузе', over: 'Попробуем ещё?', won: 'Отличная работа!',
            pausedText: 'Можно передохнуть. Продолжай, когда будешь готов.',
            snakeIntro: 'Управляй стрелками или WASD. Собирай яблоки и избегай стен и своего хвоста.',
            memoryIntro: 'Открывай по две карточки и находи одинаковые символы. Собери все 8 пар.',
            snakeHelp: 'Стрелки / WASD — движение\nПробел / Esc — пауза\nR — новая игра\nНа телефоне: свайпы или кнопки',
            memoryHelp: 'Нажми на две карточки\nTab + Enter — выбор с клавиатуры\nEsc — пауза\nR — новая игра',
            snakeFooter: '1 яблоко = 1 токен. Награды начисляются сразу в общий баланс ebloX.',
            memoryFooter: '2 токена за пару + 4 за всё поле. Награды начисляются сразу в общий баланс ebloX.',
            reward: 'Получено токенов', stats: 'Статистика', cards: 'Карточки', field: 'Игровое поле змейки',
            card: 'Карточка', hidden: 'закрыта', matched: 'пара найдена',
            up: 'Вверх', down: 'Вниз', left: 'Влево', right: 'Вправо', direction: 'Направление',
            storage: 'Хранилище недоступно: рекорд и токены могут не сохраниться после выхода.'
        },
        en: {
            snake: 'Snake', memory: 'Memory Pairs', back: '← Back to ebloX',
            snakeSubtitle: 'Collect apples. Stay alive. Beat your best.',
            memorySubtitle: '16 cards. 8 pairs. Trust your memory.',
            score: 'Score', pairs: 'Pairs found', best: 'Best', moves: 'Moves', tokens: 'Run tokens',
            help: 'Controls', pause: 'Pause', resume: 'Resume', restart: 'Play again', play: 'Play',
            ready: 'Ready to play?', paused: 'Game paused', over: 'One more try?', won: 'Nicely done!',
            pausedText: 'Take a breather. Resume whenever you are ready.',
            snakeIntro: 'Use arrow keys or WASD. Collect apples and avoid the walls and your own tail.',
            memoryIntro: 'Turn over two cards and find matching symbols. Find all 8 pairs.',
            snakeHelp: 'Arrows / WASD — move\nSpace / Esc — pause\nR — new game\nOn mobile: swipe or use the buttons',
            memoryHelp: 'Choose two cards\nTab + Enter — keyboard selection\nEsc — pause\nR — new game',
            snakeFooter: '1 apple = 1 token. Rewards go straight into your ebloX balance.',
            memoryFooter: '2 tokens per pair + 4 for a full board. Rewards go straight into your ebloX balance.',
            reward: 'Tokens earned', stats: 'Statistics', cards: 'Cards', field: 'Snake playfield',
            card: 'Card', hidden: 'face down', matched: 'matched',
            up: 'Up', down: 'Down', left: 'Left', right: 'Right', direction: 'Direction',
            storage: 'Storage unavailable: your best score and tokens may not persist after leaving.'
        }
    }[lang];
    const board = $('board');
    const overlay = $('overlay');
    const tokenStore = window.EbloxTokens;
    let state;
    let mode = 'ready';
    let timer = null;
    let rewards;
    let earnedTotal = 0;
    let best = 0;
    let storageAvailable = true;
    try {
        const key = 'eblox-arcade-storage-probe';
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        const value = Number(localStorage.getItem('eblox-snake-best'));
        best = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (_) { storageAvailable = false; }

    document.documentElement.lang = lang;
    document.title = `${text[kind]} — ebloX`;
    $('title').textContent = text[kind];
    $('subtitle').textContent = text[`${kind}Subtitle`];
    $('back').textContent = text.back;
    $('score-label').textContent = snake ? text.score : text.pairs;
    $('extra-label').textContent = snake ? text.best : text.moves;
    $('tokens-label').textContent = text.tokens;
    $('help-title').textContent = text.help;
    $('help-text').textContent = text[`${kind}Help`];
    $('footer').textContent = storageAvailable ? text[`${kind}Footer`] : text.storage;
    $('restart').textContent = text.restart;
    $('stats').setAttribute('aria-label', text.stats);
    board.setAttribute('aria-label', snake ? text.field : text.cards);
    if (snake) {
        $('dpad').setAttribute('aria-label', text.direction);
        document.querySelectorAll('[data-direction]').forEach(button => {
            button.setAttribute('aria-label', text[button.dataset.direction]);
        });
    }

    // Accept only the launcher's own page, including in the desktop file:// host.
    const defaultBack = new URL('../main.html', window.location.href);
    let backUrl = defaultBack;
    try {
        const candidate = new URL(params.get('back') || '../main.html', window.location.href);
        if (candidate.protocol === defaultBack.protocol && candidate.host === defaultBack.host &&
            candidate.pathname === defaultBack.pathname) backUrl = candidate;
    } catch (_) { /* Fall back to the local launcher. */ }
    $('back').href = backUrl.href;
    $('back').addEventListener('click', event => {
        event.preventDefault();
        stopTimer();
        if (earnedTotal > 0) backUrl.searchParams.set('earnedTokens', String(earnedTotal));
        window.location.href = backUrl.href;
    });

    function stopTimer() {
        window.clearTimeout(timer);
        timer = null;
    }

    function setMode(next) {
        mode = next;
        document.body.dataset.state = mode;
        overlay.hidden = mode === 'playing';
        board.inert = mode !== 'playing';
        $('pause').disabled = mode !== 'playing' && mode !== 'paused';
        $('pause').textContent = mode === 'paused' ? text.resume : text.pause;
        if (mode !== 'playing') {
            stopTimer();
            $('overlay-title').textContent = text[mode === 'ready' ? 'ready' : mode];
            $('overlay-text').textContent = mode === 'ready' ? text[`${kind}Intro`] :
                mode === 'paused' ? text.pausedText :
                    `${snake ? text.score : text.moves}: ${snake ? state.apples * 10 : state.moves}. ${text.reward}: +${rewards.total()}.`;
            $('primary').textContent = mode === 'paused' ? text.resume : mode === 'ready' ? text.play : text.restart;
            $('primary').focus({ preventScroll: true });
        }
    }

    function updateStats() {
        if (snake && state.apples * 10 > best) {
            best = state.apples * 10;
            try { localStorage.setItem('eblox-snake-best', String(best)); } catch (_) { /* Game stays playable. */ }
        }
        const delta = rewards.update(rules.rewardTotal(kind, state));
        if (delta) $('status').textContent = `${text.reward}: +${delta}`;
        $('score').textContent = snake ? state.apples * 10 : `${state.pairs} / 8`;
        $('extra').textContent = snake ? best : state.moves;
        $('tokens').textContent = `+${rewards.total()}`;
    }

    function reset() {
        stopTimer();
        state = snake ? rules.createSnake() : rules.createMemory();
        rewards = rules.createRewardTracker(delta => {
            if (tokenStore) tokenStore.earn(delta, kind);
            earnedTotal += delta;
        });
        $('status').textContent = '';
        if (!snake) buildCards();
        updateStats();
        render();
    }

    function start() {
        if (mode === 'over' || mode === 'won') reset();
        setMode('playing');
        if (snake) {
            board.focus({ preventScroll: true });
            scheduleSnake();
        } else {
            scheduleMismatch();
            const next = board.querySelector('button:not(:disabled)');
            if (next) next.focus({ preventScroll: true });
        }
    }

    function togglePause() {
        if (mode === 'playing') setMode('paused');
        else if (mode === 'paused') start();
    }

    $('primary').addEventListener('click', start);
    $('pause').addEventListener('click', togglePause);
    $('restart').addEventListener('click', () => { reset(); setMode('ready'); });

    function scheduleSnake() {
        stopTimer();
        if (mode !== 'playing') return;
        timer = window.setTimeout(() => {
            rules.stepSnake(state);
            updateStats();
            render();
            if (state.status !== 'playing') setMode(state.status);
            else scheduleSnake();
        }, Math.max(70, 170 - state.apples * 4));
    }

    function renderSnake() {
        const ctx = board.getContext('2d');
        const cell = board.width / state.size;
        ctx.fillStyle = '#0c1521';
        ctx.fillRect(0, 0, board.width, board.height);
        ctx.strokeStyle = '#172438';
        ctx.lineWidth = 1;
        for (let i = 1; i < state.size; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, board.height);
            ctx.moveTo(0, i * cell); ctx.lineTo(board.width, i * cell); ctx.stroke();
        }
        if (state.food) {
            const x = (state.food.x + .5) * cell, y = (state.food.y + .5) * cell;
            ctx.fillStyle = '#f18d9b'; ctx.beginPath(); ctx.arc(x, y + 1, cell * .32, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#b8e1ae'; ctx.fillRect(x, y - 11, 3, 6);
        }
        state.body.forEach((part, i) => {
            ctx.fillStyle = i === 0 ? '#b8f2d9' : '#50ad91';
            ctx.fillRect(part.x * cell + 2, part.y * cell + 2, cell - 4, cell - 4);
        });
        const head = state.body[0], dir = state.direction;
        ctx.fillStyle = '#11362b';
        for (const side of [-1, 1]) {
            const x = (head.x + .5) * cell + dir.x * 5 + dir.y * side * 5;
            const y = (head.y + .5) * cell + dir.y * 5 + dir.x * side * 5;
            ctx.fillRect(x - 2, y - 2, 4, 4);
        }
    }

    const symbols = ['A', 'B', 'C', 'D', '1', '2', '3', '4'];
    function buildCards() {
        board.replaceChildren();
        state.cards.forEach((_, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'memory-card';
            button.addEventListener('click', () => {
                if (mode !== 'playing') return;
                const result = rules.flipMemory(state, index);
                if (result === 'ignored') return;
                updateStats();
                render();
                if (state.status === 'won') setMode('won');
                else scheduleMismatch();
            });
            board.appendChild(button);
        });
    }

    function scheduleMismatch() {
        stopTimer();
        if (mode === 'playing' && state.open.length === 2) {
            timer = window.setTimeout(() => {
                rules.closeMemoryPair(state);
                render();
            }, 850);
        }
    }

    function render() {
        if (snake) return renderSnake();
        [...board.children].forEach((button, index) => {
            const matched = state.matched[index];
            const visible = matched || state.open.includes(index);
            button.textContent = visible ? symbols[state.cards[index]] : '?';
            button.classList.toggle('is-open', visible);
            button.classList.toggle('is-matched', matched);
            button.disabled = matched;
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', `${text.card} ${index + 1}: ${visible ? symbols[state.cards[index]] : text.hidden}${matched ? `, ${text.matched}` : ''}`);
        });
    }

    const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const keys = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    function turn(name) {
        if (snake && mode === 'playing') rules.turnSnake(state, ...directions[name]);
    }
    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (snake && keys[event.code]) { event.preventDefault(); if (!event.repeat) turn(keys[event.code]); }
        else if (event.code === 'Escape' || (snake && event.code === 'Space' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A')) {
            event.preventDefault();
            if (!event.repeat) togglePause();
        } else if (event.code === 'KeyR' && !event.repeat) {
            event.preventDefault(); reset(); setMode('ready');
        }
    });
    if (snake) {
        document.querySelectorAll('[data-direction]').forEach(button => {
            button.addEventListener('click', () => turn(button.dataset.direction));
        });
        let pointer = null;
        board.addEventListener('pointerdown', event => {
            pointer = { x: event.clientX, y: event.clientY };
            board.setPointerCapture(event.pointerId);
        });
        board.addEventListener('pointerup', event => {
            if (!pointer) return;
            const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
            pointer = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
            turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        });
        board.addEventListener('pointercancel', () => { pointer = null; });
    }
    function autoPause() { if (mode === 'playing') setMode('paused'); }
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    window.addEventListener('pagehide', () => { autoPause(); stopTimer(); });
    reset();
    setMode('ready');
})();
