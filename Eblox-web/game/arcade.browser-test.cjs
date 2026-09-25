// Usage: node game/arcade.browser-test.cjs <absolute agent-browser CLI path>
// Uses an isolated browser session; never touches the user's real launcher profile.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const cli = process.argv[2];
if (!cli) throw new Error('Pass the installed agent-browser CLI path.');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '..', 'outputs');
function browser(...args) {
    // Inherit stdio: the browser daemon may keep captured pipe handles open on Windows.
    execFileSync(process.execPath, [cli, '--session', 'eblox-arcade-tests', ...args], {
        stdio: 'inherit', timeout: 30000
    });
}
function evaluate(code) {
    return browser('eval', `(async () => {
        const assert = (condition, message) => { if (!condition) throw new Error(message); };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        ${code}
    })()`);
}
function open(file, query = '') {
    browser('open', pathToFileURL(path.join(root, file)).href + query);
    browser('snapshot', '-i');
}
try {
    open('game/snake.html', '?lang=ru&back=../main.html?user=ArcadeTest');
    evaluate(`
        assert(document.body.dataset.state === 'ready', 'Snake ready screen');
        assert(document.querySelector('#title').textContent === 'Змейка', 'Russian title');
        window.__errors = []; addEventListener('error', e => __errors.push(e.message));
        window.__baseline = EbloxTokens.readBalance();
        const original = EbloxArcadeRules.createSnake;
        EbloxArcadeRules.createSnake = (...args) => {
            const state = original(...args); state.food = {x: 7, y: 10}; window.__snake = state; return state;
        };
        document.querySelector('#restart').click();
        document.querySelector('#primary').click();
        await wait(215);
        assert(document.querySelector('#score').textContent === '10', 'Eating increases score');
        assert(EbloxTokens.readBalance() === __baseline + 1, 'Apple credits exactly one token');
        document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true}));
        await wait(175);
        assert(__snake.direction.y === -1, 'WASD turns snake');
        document.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape', bubbles: true}));
        assert(document.body.dataset.state === 'paused', 'Escape pauses');
        const saved = JSON.stringify(__snake.body);
        await wait(240);
        assert(JSON.stringify(__snake.body) === saved, 'Paused snake stops moving');
        document.querySelector('#primary').click();
        await wait(175);
        assert(JSON.stringify(__snake.body) !== saved, 'Resume moves again');
        dispatchEvent(new Event('blur'));
        assert(document.body.dataset.state === 'paused', 'Window blur auto-pauses');
        document.querySelector('#primary').click();
        __snake.body = [{x: 5, y: 0}]; __snake.direction = {x: 0, y: -1}; __snake.queue = [];
        await wait(190);
        assert(document.body.dataset.state === 'over', 'Collision shows game over');
        assert(document.querySelector('#extra').textContent === '10', 'High score saved');
        document.querySelector('#primary').click();
        document.querySelector('#pause').click();
        assert(document.querySelector('#score').textContent === '0', 'Restart resets score');
        assert(EbloxTokens.readBalance() === __baseline + 1, 'Restart does not double credit');
        assert(__errors.length === 0, 'Snake runtime errors: ' + __errors.join(','));
        return 'PASS: Snake eating, WASD, pause/resume, auto-pause, collision, restart, best score, rewards';
    `);
    browser('click', '#back');
    browser('wait', '--load', 'domcontentloaded');
    evaluate(`
        assert(location.pathname.endsWith('/main.html'), 'Return to launcher');
        assert(document.querySelector('#tokens-pill-value').textContent === String(EbloxTokens.readBalance()), 'Launcher balance refreshed');
        document.querySelector('#tokens-pill').click();
        const names = [...document.querySelectorAll('.tokens-game-name')].map(el => el.textContent);
        assert(names.includes('Змейка') && names.includes('Найди пару'), 'Both new games appear in menu');
        assert(names.length === 6, 'Existing four games preserved');
        return 'PASS: Launcher return, shared token balance and six-game menu';
    `);
    browser('snapshot', '-i');
    evaluate(`
        const button = [...document.querySelectorAll('.tokens-game')].find(el => el.textContent.includes('Найди пару'));
        button.click(); return 'Opening Memory from launcher';
    `);
    browser('wait', '--load', 'domcontentloaded');
    browser('snapshot', '-i');
    evaluate(`
        assert(location.pathname.endsWith('/game/memory.html'), 'Memory launch URL');
        assert(new URLSearchParams(location.search).get('lang') === 'ru', 'Language passed to game');
        window.__errors = []; addEventListener('error', e => __errors.push(e.message));
        window.__baseline = EbloxTokens.readBalance();
        const original = EbloxArcadeRules.createMemory;
        EbloxArcadeRules.createMemory = (...args) => { window.__memory = original(...args); return __memory; };
        document.querySelector('#restart').click();
        document.querySelector('#primary').click();
        const buttons = [...document.querySelectorAll('.memory-card')];
        const mismatch = __memory.cards.findIndex(value => value !== __memory.cards[0]);
        buttons[0].click(); buttons[0].click();
        assert(__memory.moves === 0, 'Same card cannot match itself');
        buttons[mismatch].click();
        assert(__memory.moves === 1 && __memory.pairs === 0, 'Mismatch counts one move');
        const third = buttons.findIndex((_, i) => i !== 0 && i !== mismatch);
        buttons[third].click();
        assert(__memory.open.length === 2, 'Third card locked during mismatch');
        document.querySelector('#pause').click();
        await wait(950);
        assert(__memory.open.length === 2, 'Pause freezes mismatch timer');
        document.querySelector('#primary').click();
        await wait(950);
        assert(__memory.open.length === 0, 'Mismatch hides after resume');
        for (let value = 0; value < 8; value++) {
            __memory.cards.forEach((card, index) => { if (card === value) buttons[index].click(); });
        }
        assert(document.body.dataset.state === 'won', 'Memory full board wins');
        assert(document.querySelector('#score').textContent === '8 / 8', 'All pairs counted');
        assert(document.querySelector('#extra').textContent === '9', 'Moves counted');
        assert(EbloxTokens.readBalance() === __baseline + 20, 'Memory reward exactly twenty tokens');
        buttons[0].click();
        assert(EbloxTokens.readBalance() === __baseline + 20, 'Matched cards cannot pay again');
        assert(__errors.length === 0, 'Memory runtime errors: ' + __errors.join(','));
        return 'PASS: Memory mismatches, input lock, pause/resume, all pairs, victory, moves and exact rewards';
    `);
    browser('screenshot', path.join(output, 'eblox-memory-complete.png'));
    browser('click', '#back');
    browser('wait', '--load', 'domcontentloaded');
    evaluate(`
        assert(location.pathname.endsWith('/main.html'), 'Memory return to launcher');
        assert(EbloxTokens.readHistory().filter(entry => entry.reason === 'memory').reduce((n, entry) => n + entry.amount, 0) === 20, 'Memory token history');
        return 'PASS: Memory return and saved reward history';
    `);
    open('game/memory.html', '?lang=en&back=https://example.com');
    evaluate(`
        assert(document.documentElement.lang === 'en', 'English language');
        assert(document.querySelector('#title').textContent === 'Memory Pairs', 'English title');
        assert(document.querySelector('#back').href.startsWith('file:///D:/repos/app/Eblox-web/main.html'), 'Untrusted return target rejected');
        document.querySelector('#primary').click();
        document.querySelector('.memory-card').focus();
        return 'PASS: English labels and safe return URL';
    `);
    browser('press', 'Enter');
    evaluate(`
        assert(document.querySelectorAll('.memory-card.is-open').length === 1, 'Keyboard Enter flips card');
        return 'PASS: Memory keyboard input';
    `);
    browser('set', 'viewport', '390', '844');
    evaluate(`
        assert(document.documentElement.scrollWidth <= innerWidth, 'Memory mobile layout has no horizontal overflow');
        assert(document.querySelector('#board').getBoundingClientRect().width > 300, 'Memory board fits mobile');
        return 'PASS: Memory mobile layout';
    `);
    browser('screenshot', path.join(output, 'eblox-memory-mobile.png'));
    open('game/snake.html', '?lang=ru');
    evaluate(`
        assert(document.documentElement.scrollWidth <= innerWidth, 'Snake mobile layout has no overflow');
        document.querySelector('#primary').click();
        document.querySelector('[data-direction="up"]').click();
        document.querySelector('#pause').click();
        assert(document.body.dataset.state === 'paused', 'Mobile controls work');
        return 'PASS: Snake mobile layout and controls';
    `);
    browser('set', 'viewport', '1200', '900');
    browser('click', '#restart');
    browser('screenshot', path.join(output, 'eblox-snake-preview.png'));
    browser('errors');
    console.log('ALL BROWSER CHECKS PASSED');
} finally {
    browser('close');
}
