// Browser and Node share these rules so tests exercise the actual games.
(function(root) {
    'use strict';

    function placeFood(state, random) {
        const free = [];
        for (let y = 0; y < state.size; y++) {
            for (let x = 0; x < state.size; x++) {
                if (!state.body.some(cell => cell.x === x && cell.y === y)) free.push({ x, y });
            }
        }
        state.food = free.length ? free[Math.floor(random() * free.length)] : null;
        if (!state.food) state.status = 'won';
    }

    function createSnake(random = Math.random) {
        const state = {
            size: 20, body: [{ x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }],
            direction: { x: 1, y: 0 }, queue: [], food: null, apples: 0, status: 'playing'
        };
        placeFood(state, random);
        return state;
    }

    function turnSnake(state, x, y) {
        if (state.status !== 'playing' || state.queue.length >= 2 || Math.abs(x) + Math.abs(y) !== 1) return false;
        const previous = state.queue[state.queue.length - 1] || state.direction;
        if ((x === previous.x && y === previous.y) || (x === -previous.x && y === -previous.y)) return false;
        state.queue.push({ x, y });
        return true;
    }

    function stepSnake(state, random = Math.random) {
        if (state.status !== 'playing') return false;
        state.direction = state.queue.shift() || state.direction;
        const head = { x: state.body[0].x + state.direction.x, y: state.body[0].y + state.direction.y };
        const eats = state.food && head.x === state.food.x && head.y === state.food.y;
        // Moving into the departing tail is legal unless the snake is growing.
        const occupied = eats ? state.body : state.body.slice(0, -1);
        if (head.x < 0 || head.y < 0 || head.x >= state.size || head.y >= state.size ||
            occupied.some(cell => cell.x === head.x && cell.y === head.y)) {
            state.status = 'over';
            return false;
        }
        state.body.unshift(head);
        if (eats) {
            state.apples++;
            placeFood(state, random);
        } else {
            state.body.pop();
        }
        return Boolean(eats);
    }

    function createMemory(random = Math.random) {
        const cards = Array.from({ length: 16 }, (_, index) => index % 8);
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        return { cards, matched: Array(16).fill(false), open: [], moves: 0, pairs: 0, status: 'playing' };
    }

    function flipMemory(state, index) {
        if (state.status !== 'playing' || !Number.isInteger(index) || index < 0 || index >= state.cards.length ||
            state.open.length === 2 || state.matched[index] || state.open.includes(index)) return 'ignored';
        state.open.push(index);
        if (state.open.length === 1) return 'open';
        state.moves++;
        const [first, second] = state.open;
        if (state.cards[first] !== state.cards[second]) return 'miss';
        state.matched[first] = state.matched[second] = true;
        state.open = [];
        state.pairs++;
        if (state.pairs === 8) state.status = 'won';
        return 'match';
    }

    function closeMemoryPair(state) {
        if (state.open.length === 2) state.open = [];
    }

    function rewardTotal(kind, state) {
        return kind === 'snake' ? state.apples : state.pairs * 2 + (state.status === 'won' ? 4 : 0);
    }

    // Credit only newly earned rewards; repeated pause/exit/render calls cannot double-pay.
    function createRewardTracker(credit) {
        let paid = 0;
        return {
            update(total) {
                if (!Number.isFinite(total) || total <= paid) return 0;
                const delta = Math.floor(total) - paid;
                if (delta <= 0) return 0;
                credit(delta);
                paid += delta;
                return delta;
            },
            total() { return paid; }
        };
    }

    const rules = { createSnake, turnSnake, stepSnake, createMemory, flipMemory, closeMemoryPair, rewardTotal, createRewardTracker };
    if (typeof module !== 'undefined' && module.exports) module.exports = rules;
    else root.EbloxArcadeRules = rules;
})(typeof window !== 'undefined' ? window : globalThis);
