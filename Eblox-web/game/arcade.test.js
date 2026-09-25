const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./arcade-rules.js');

const random = () => 0.42;

test('snake starts with three cells and food outside its body', () => {
    const state = rules.createSnake(random);
    assert.equal(state.body.length, 3);
    assert.ok(!state.body.some(cell => cell.x === state.food.x && cell.y === state.food.y));
    assert.equal(rules.rewardTotal('snake', state), 0);
});

test('snake moves one cell without changing length', () => {
    const state = rules.createSnake(random);
    rules.stepSnake(state, random);
    assert.deepEqual(state.body[0], { x: 7, y: 10 });
    assert.equal(state.body.length, 3);
});

test('snake grows, earns a token and spawns unoccupied food', () => {
    const state = rules.createSnake(random);
    state.food = { x: 7, y: 10 };
    assert.equal(rules.stepSnake(state, random), true);
    assert.equal(state.apples, 1);
    assert.equal(state.body.length, 4);
    assert.equal(rules.rewardTotal('snake', state), 1);
    assert.ok(!state.body.some(cell => cell.x === state.food.x && cell.y === state.food.y));
});

test('snake rejects reversals, duplicate and invalid directions', () => {
    const state = rules.createSnake(random);
    assert.equal(rules.turnSnake(state, -1, 0), false);
    assert.equal(rules.turnSnake(state, 1, 0), false);
    assert.equal(rules.turnSnake(state, 1, 1), false);
    assert.equal(rules.turnSnake(state, 0, 0), false);
});

test('snake buffers two fast turns without reversing into itself', () => {
    const state = rules.createSnake(random);
    assert.equal(rules.turnSnake(state, 0, -1), true);
    assert.equal(rules.turnSnake(state, -1, 0), true);
    assert.equal(rules.turnSnake(state, 0, 1), false);
    rules.stepSnake(state, random);
    assert.deepEqual(state.body[0], { x: 6, y: 9 });
    rules.stepSnake(state, random);
    assert.deepEqual(state.body[0], { x: 5, y: 9 });
});

test('wall collision ends the run and further steps cannot change it', () => {
    const state = rules.createSnake(random);
    state.body = [{ x: 19, y: 10 }];
    rules.stepSnake(state, random);
    assert.equal(state.status, 'over');
    const before = JSON.stringify(state);
    rules.stepSnake(state, random);
    assert.equal(JSON.stringify(state), before);
});

test('snake colliding with its body ends the run', () => {
    const state = rules.createSnake(random);
    state.body = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 }];
    rules.stepSnake(state, random);
    assert.equal(state.status, 'over');
});

test('snake may enter its departing tail cell', () => {
    const state = rules.createSnake(random);
    state.body = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 4 }];
    rules.stepSnake(state, random);
    assert.equal(state.status, 'playing');
    assert.deepEqual(state.body[0], { x: 5, y: 4 });
});

test('filling the snake board wins without an infinite food loop', () => {
    const state = rules.createSnake(random);
    state.size = 2;
    state.body = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    state.food = { x: 1, y: 0 };
    rules.stepSnake(state, random);
    assert.equal(state.status, 'won');
    assert.equal(state.food, null);
    assert.equal(state.body.length, 4);
});

test('memory deck contains exactly eight pairs', () => {
    const state = rules.createMemory(random);
    assert.equal(state.cards.length, 16);
    for (let value = 0; value < 8; value++) assert.equal(state.cards.filter(card => card === value).length, 2);
    assert.equal(rules.rewardTotal('memory', state), 0);
});

test('memory ignores invalid and duplicate card clicks', () => {
    const state = rules.createMemory(random);
    assert.equal(rules.flipMemory(state, -1), 'ignored');
    assert.equal(rules.flipMemory(state, 16), 'ignored');
    assert.equal(rules.flipMemory(state, 0.5), 'ignored');
    assert.equal(rules.flipMemory(state, 0), 'open');
    assert.equal(rules.flipMemory(state, 0), 'ignored');
    assert.equal(state.moves, 0);
});

test('memory mismatch locks a third click until cards are hidden', () => {
    const state = rules.createMemory(random);
    const second = state.cards.findIndex(value => value !== state.cards[0]);
    rules.flipMemory(state, 0);
    assert.equal(rules.flipMemory(state, second), 'miss');
    assert.equal(rules.flipMemory(state, 15), 'ignored');
    assert.equal(state.moves, 1);
    assert.equal(state.pairs, 0);
    rules.closeMemoryPair(state);
    assert.equal(state.open.length, 0);
    assert.equal(rules.flipMemory(state, 0), 'open');
});

test('memory match earns two tokens and cannot be selected again', () => {
    const state = rules.createMemory(random);
    const second = state.cards.findIndex((value, index) => index > 0 && value === state.cards[0]);
    rules.flipMemory(state, 0);
    assert.equal(rules.flipMemory(state, second), 'match');
    assert.equal(state.pairs, 1);
    assert.equal(rules.rewardTotal('memory', state), 2);
    assert.equal(rules.flipMemory(state, 0), 'ignored');
});

test('memory full board takes eight perfect moves and earns twenty tokens', () => {
    const state = rules.createMemory(random);
    for (let value = 0; value < 8; value++) {
        state.cards.forEach((card, index) => { if (card === value) rules.flipMemory(state, index); });
    }
    assert.equal(state.status, 'won');
    assert.equal(state.pairs, 8);
    assert.equal(state.moves, 8);
    assert.equal(rules.rewardTotal('memory', state), 20);
    assert.equal(rules.flipMemory(state, 0), 'ignored');
});

test('reward settlement is incremental and idempotent', () => {
    const credits = [];
    const tracker = rules.createRewardTracker(amount => credits.push(amount));
    for (const total of [0, 2, 2, 4, 3, 16, 20, 20, NaN, Infinity]) tracker.update(total);
    assert.deepEqual(credits, [2, 2, 12, 4]);
    assert.equal(tracker.total(), 20);
});

test('restarting creates a fresh board and a separate reward tracker', () => {
    const state = rules.createSnake(random);
    state.apples = 9;
    const fresh = rules.createSnake(random);
    assert.equal(fresh.apples, 0);
    assert.equal(rules.createRewardTracker(() => {}).total(), 0);
    assert.equal(rules.createMemory(random).moves, 0);
});
