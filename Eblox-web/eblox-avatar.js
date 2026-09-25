// ==========================================================
// ebloX — автогенерация аватарок аккаунта
// Дефолт: буквенная аватарка (первая буква логина + цвет,
// детерминированно выведенный из логина). Рисуется как SVG
// data URI, поэтому подходит и для <img src>, и для CSS.
// ==========================================================

(() => {
    const AVATAR_STORAGE_KEY = 'eblox-avatars';

    // Палитра согласована с тёмной темой лаунчера
    const PALETTE = [
        ['#1E3A5F', '#3B82F6'],
        ['#065F46', '#059669'],
        ['#7C2D12', '#EA580C'],
        ['#4C1D95', '#8B5CF6'],
        ['#831843', '#EC4899'],
        ['#134E4A', '#14B8A6'],
        ['#713F12', '#EAB308'],
        ['#1E293B', '#64748B'],
        ['#7F1D1D', '#EF4444'],
        ['#164E63', '#06B6D4']
    ];

    // FNV-1a — стабильный хеш, чтобы у логина всегда был один и тот же цвет
    const hashString = (value) => {
        let hash = 0x811c9dc5;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash >>> 0;
    };

    const initialOf = (login) => {
        const clean = String(login || '').trim();
        if (!clean) return '?';
        // Берём первый буквенно-цифровой символ, чтобы не поймать эмодзи или пробел
        const match = clean.match(/[\p{L}\p{N}]/u);
        return (match ? match[0] : clean[0]).toUpperCase();
    };

    const escapeXml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const letterAvatar = (login, size = 128) => {
        const letter = escapeXml(initialOf(login));
        const [dark, light] = PALETTE[hashString(String(login || '')) % PALETTE.length];
        const id = `g${hashString(String(login || '') + size).toString(36)}`;

        const svg = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
            `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`,
            `<stop offset="0%" stop-color="${light}"/><stop offset="100%" stop-color="${dark}"/>`,
            `</linearGradient></defs>`,
            `<rect width="${size}" height="${size}" fill="url(#${id})"/>`,
            `<text x="50%" y="50%" dy="0.355em" text-anchor="middle"`,
            ` font-family="Inter, Segoe UI, system-ui, sans-serif"`,
            ` font-size="${Math.round(size * 0.46)}" font-weight="600" fill="#ffffff"`,
            ` fill-opacity="0.95">${letter}</text>`,
            `</svg>`
        ].join('');

        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };

    // Пользовательские аватарки (если когда-нибудь загрузят свою)
    const readCustom = () => {
        try {
            const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    };

    const getCustom = (login) => readCustom()[String(login || '')] || null;

    const setCustom = (login, dataUri) => {
        const store = readCustom();
        if (dataUri) store[String(login || '')] = dataUri;
        else delete store[String(login || '')];
        try {
            localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(store));
        } catch (error) {
            // квота переполнена — молча остаёмся на буквенной аватарке
        }
    };

    // Основная точка входа: своя аватарка, иначе сгенерированная буквенная
    const avatarFor = (login, size = 128) => getCustom(login) || letterAvatar(login, size);

    // Проставить аватарку в <img> (или список <img>) и подстроить размер под элемент
    const applyTo = (target, login) => {
        const nodes = typeof target === 'string'
            ? document.querySelectorAll(target)
            : (target instanceof Element ? [target] : Array.from(target || []));

        nodes.forEach(node => {
            if (!node || node.tagName !== 'IMG') return;
            const box = Math.max(node.clientWidth || 0, node.clientHeight || 0, 64);
            node.src = avatarFor(login, Math.round(box * 2));
            node.alt = String(login || '').trim() || 'avatar';
        });
    };

    window.EbloxAvatar = {
        AVATAR_STORAGE_KEY,
        initialOf,
        letterAvatar,
        avatarFor,
        getCustom,
        setCustom,
        applyTo
    };
})();
