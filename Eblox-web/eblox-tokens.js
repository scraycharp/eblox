// ==========================================================
// ebloX — игровые токены
// Токены тратятся, пока чит запущен: 10 токенов = 1 минута игры.
// Заработать их можно только в мини-играх — купить токены нельзя.
// Подключается в лаунчере (main.html) и в игре на отдельной странице (game/game.html).
// ==========================================================

(() => {
    const TOKEN_STORAGE_KEY = 'eblox-tokens';
    const TOKEN_HISTORY_KEY = 'eblox-token-history';

    // Курс списания. START_MIN — порог, ниже которого кнопка «Старт»
    // ведёт не в игру, а в список мини-игр.
    const TOKENS_PER_MINUTE = 10;
    const START_MIN_TOKENS = 20;
    const HISTORY_LIMIT = 50;

    const clampBalance = (value) => {
        const number = Math.floor(Number(value));
        return Number.isFinite(number) && number > 0 ? number : 0;
    };

    const readBalance = () => {
        try {
            return clampBalance(localStorage.getItem(TOKEN_STORAGE_KEY));
        } catch (error) {
            return 0;
        }
    };

    const writeBalance = (value) => {
        const balance = clampBalance(value);
        try {
            localStorage.setItem(TOKEN_STORAGE_KEY, String(balance));
        } catch (error) {
            // приватный режим — баланс останется только в памяти вкладки
        }
        return balance;
    };

    const readHistory = () => {
        try {
            const raw = localStorage.getItem(TOKEN_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    };

    const pushHistory = (entry) => {
        try {
            const history = readHistory();
            history.unshift(entry);
            localStorage.setItem(TOKEN_HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
        } catch (error) {
            // история не критична — молча пропускаем
        }
    };

    // Все изменения баланса идут через эти две функции, чтобы
    // подписчики (шапка, окно мини-игр) обновлялись автоматически.
    const listeners = new Set();

    const notify = (balance, delta, reason) => {
        listeners.forEach(listener => {
            try {
                listener(balance, delta, reason);
            } catch (error) {
                console.error('[ebloX] Ошибка слушателя токенов:', error);
            }
        });
    };

    const onChange = (listener) => {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    const earn = (amount, reason) => {
        const delta = clampBalance(amount);
        if (!delta) return readBalance();
        const balance = writeBalance(readBalance() + delta);
        pushHistory({ type: 'earn', amount: delta, reason: reason || '', at: Date.now() });
        notify(balance, delta, reason || 'earn');
        return balance;
    };

    // Возвращает сколько реально списано: на нуле списывать нечего
    const spend = (amount, reason) => {
        const want = clampBalance(amount);
        const current = readBalance();
        const taken = Math.min(want, current);
        if (!taken) return 0;
        const balance = writeBalance(current - taken);
        pushHistory({ type: 'spend', amount: taken, reason: reason || '', at: Date.now() });
        notify(balance, -taken, reason || 'spend');
        return taken;
    };

    const canStart = () => readBalance() >= START_MIN_TOKENS;

    // Сколько секунд игры оплачивает текущий баланс
    const secondsLeft = (balance) => {
        const tokens = balance === undefined ? readBalance() : clampBalance(balance);
        return Math.floor(tokens * 60 / TOKENS_PER_MINUTE);
    };

    const formatTime = (totalSeconds) => {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    };

    window.EbloxTokens = {
        TOKEN_STORAGE_KEY,
        TOKEN_HISTORY_KEY,
        TOKENS_PER_MINUTE,
        START_MIN_TOKENS,
        readBalance,
        readHistory,
        earn,
        spend,
        canStart,
        secondsLeft,
        formatTime,
        onChange
    };
})();
