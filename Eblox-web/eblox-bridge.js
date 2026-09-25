(() => {
    const STORAGE_KEY = 'eblox_users';
    const SESSION_KEY = 'eblox_current_user';
    const SESSION_META_KEY = 'eblox_session_meta';
    const SETTINGS_KEY = 'eblox_settings';
    const CODE_LENGTH = 5;
    const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    const memoryStore = {};

    const storageGet = (key) => {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
        }
    };

    const storageSet = (key, value) => {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            memoryStore[key] = value;
        }
    };

    const readUsers = () => {
        try {
            const raw = storageGet(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && Array.isArray(parsed.users) ? parsed.users : [];
        } catch (error) {
            return [];
        }
    };

    const writeUsers = (users) => storageSet(STORAGE_KEY, JSON.stringify({ users }, null, 4));

    const storageRemove = (key) => {
        try {
            window.localStorage.removeItem(key);
        } catch (error) {
            delete memoryStore[key];
        }
    };

    const readSessionMeta = () => {
        try {
            const raw = storageGet(SESSION_META_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    };

    const clearSession = () => {
        storageRemove(SESSION_KEY);
        storageRemove(SESSION_META_KEY);
    };

    const saveSession = (login) => {
        storageSet(SESSION_KEY, login);
        storageSet(SESSION_META_KEY, JSON.stringify({ login, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS }));
    };

    const getActiveSession = () => {
        const login = storageGet(SESSION_KEY);
        if (!login) return null;

        const meta = readSessionMeta();
        if (meta && meta.expiresAt && Date.now() > Number(meta.expiresAt)) {
            clearSession();
            return null;
        }

        if (!readUsers().some(user => user.login === login)) {
            clearSession();
            return null;
        }

        return login;
    };

    const readSettings = () => {
        try {
            const raw = storageGet(SETTINGS_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    };

    const listeners = new Map();

    const emit = (channel, ...args) => {
        const handlers = listeners.get(channel);
        if (!handlers || handlers.length === 0) return;
        window.setTimeout(() => handlers.slice().forEach(handler => handler({ channel }, ...args)), 0);
    };

    let verificationCode = null;
    let nativeVerification = false;
    let tempUser = null;

    const showCodeHint = (code) => {
        const hint = document.querySelector('.modal-sub');
        if (hint) hint.textContent = `Браузерная версия: код подтверждения — ${code}`;
        console.info(`[ebloX] Код подтверждения: ${code}`);
    };

    // Реальная отправка идёт через хост (Resend); код живёт в хосте и в JS не попадает.
    // Без хоста (обычный браузер) остаётся локальный код-подсказка для разработки.
    const startVerification = (email) => {
        if (!nativeHost) {
            verificationCode = String(Math.floor(10000 + Math.random() * 90000));
            window.setTimeout(() => {
                showCodeHint(verificationCode);
                emit('show-verify-modal');
            }, 600);
            return;
        }

        verificationCode = null;

        nativeCall('send-verification-mail', email)
            .then(() => {
                nativeVerification = true;
                emit('show-verify-modal');
            })
            .catch(error => {
                nativeVerification = false;

                const message = error && error.message
                    ? error.message
                    : 'Не удалось отправить письмо с кодом.';

                // Хост дописывает подсказку про VPN, когда истёк таймаут отправки.
                emit(message.includes('VPN') ? 'mail-vpn-required' : 'server-error', message);
            });
    };

    const applyNewPassword = (newPassword) => {
        const users = readUsers();
        const index = users.findIndex(user => user.login === tempUser.login);
        if (index === -1) {
            emit('account-fail', 'Пользователь не найден.');
            return;
        }
        users[index].password = newPassword;
        writeUsers(users);
        tempUser = null;
        emit('account-password-changed');
    };

    const systemUnavailable = (channel) => console.warn(`[ebloX] Системное действие "${channel}" недоступно в браузере.`);

    const nativeHost = (window.chrome && window.chrome.webview) ? window.chrome.webview : null;

    const nativeSendChannels = new Set([
        'window-minimize',
        'window-maximize',
        'window-close',
        'window-drag',
        'set-wallpaper',
        'create-shortcuts',
        'create-folders',
        'run-program',
        'chaotic-theme',
        'camera-ai-reply'
    ]);

    const nativeInvokeChannels = new Set([
        'write-files',
        'find-files',
        'save-image',
        'open-camera',
        'check-roblox',
        'get-ai-config',
        'send-verification-mail',
        'check-verification-code'
    ]);

    const pendingRequests = new Map();
    let requestCounter = 0;

    const nativePost = (channel, args, id) => nativeHost.postMessage(JSON.stringify({ id, channel, args }));

    const nativeSend = (channel, ...args) => nativePost(channel, args, null);

    const nativeInvoke = (channel, ...args) => new Promise((resolve, reject) => {
        requestCounter += 1;
        const id = `req-${requestCounter}`;
        pendingRequests.set(id, { resolve, reject });
        nativePost(channel, args, id);
    });

    // Хост отвечает конвертом { ok, result }, где ok означает лишь «обработчик
    // не упал с исключением». Отказ самой операции лежит внутри result.ok,
    // поэтому голый then() принял бы «Неверный код» за успех.
    const nativeCall = (channel, ...args) => nativeInvoke(channel, ...args).then(result => {
        if (result && typeof result === 'object' && result.ok === false) {
            throw new Error(result.error || 'Хост отклонил операцию');
        }
        return result;
    });

    const onNativeMessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.event) {
            emit(data.event, data.payload);
            return;
        }

        const waiter = pendingRequests.get(data.id);
        if (!waiter) return;

        pendingRequests.delete(data.id);

        if (data.ok) waiter.resolve(data.result);
        else waiter.reject(new Error(data.error || 'Ошибка системного моста'));
    };

    if (nativeHost) nativeHost.addEventListener('message', onNativeMessage);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
        }
        const request = document.documentElement.requestFullscreen;
        if (typeof request === 'function') request.call(document.documentElement);
    };

    const sendHandlers = {
        'window-minimize': () => {},
        'window-maximize': () => toggleFullscreen(),
        'window-close': () => window.close(),

        'register-attempt': (userData) => {
            const users = readUsers();
            if (users.some(user => user.login === userData.login)) {
                emit('register-fail-login', 'Данное имя уже занято');
                return;
            }
            if (users.some(user => user.email === userData.email)) {
                emit('register-fail-email', 'Данная почта уже занята');
                return;
            }
            tempUser = { login: userData.login, email: userData.email, password: userData.password };
            startVerification(userData.email);
        },

        'forgot-password-attempt': (recoveryData) => {
            const users = readUsers();
            const user = users.find(item => item.login === recoveryData.login && item.email === recoveryData.email);
            if (!user) {
                emit('forgot-fail', 'Пользователь с такими данными не найден');
                return;
            }
            tempUser = user;
            startVerification(user.email);
        },

        'verify-code-check': (inputCode) => {
            if (nativeVerification) {
                nativeCall('check-verification-code', String(inputCode))
                    .then(() => {
                        nativeVerification = false;
                        emit('verify-success');
                    })
                    .catch(error => emit('verify-fail', error.message || 'Неверный код подтверждения'));
                return;
            }
            if (!verificationCode) {
                emit('verify-fail', 'Код истёк. Попробуйте ещё раз.');
                return;
            }
            if (String(inputCode).length !== CODE_LENGTH || String(inputCode) !== verificationCode) {
                emit('verify-fail', 'Неверный код подтверждения');
                return;
            }
            verificationCode = null;
            emit('verify-success');
        },

        'final-register-save': () => {
            if (!tempUser) {
                emit('server-error', 'Нет данных для сохранения аккаунта.');
                return;
            }
            const users = readUsers();
            users.push(tempUser);
            writeUsers(users);
            tempUser = null;
            emit('operation-success', 'Аккаунт успешно создан!');
        },

        'final-password-update': (newPassword) => {
            if (!tempUser) {
                emit('server-error', 'Сессия восстановления устарела.');
                return;
            }
            const users = readUsers();
            const index = users.findIndex(user => user.login === tempUser.login);
            if (index === -1) {
                emit('server-error', 'Пользователь не найден.');
                return;
            }
            users[index].password = newPassword;
            writeUsers(users);
            tempUser = null;
            emit('operation-success', 'Пароль был успешно изменен!');
        },

        'resend-code': () => {
            if (!tempUser) {
                emit('server-error', 'Нет адреса для повторной отправки кода.');
                return;
            }
            startVerification(tempUser.email);
        },

        'logout': () => {
            clearSession();
            window.location.href = 'index.html';
        },

        'login-attempt': (authData) => {
            const users = readUsers();
            const user = users.find(item => item.login === authData.login && item.password === authData.password);
            if (!user) {
                emit('login-fail', 'Неправильное имя пользователя или пароль');
                return;
            }
            if (authData.remember === false) storageSet(SESSION_KEY, user.login);
            else saveSession(user.login);
            emit('login-success');
            window.setTimeout(() => {
                window.location.href = `main.html?user=${encodeURIComponent(user.login)}`;
            }, 150);
        },

        'set-wallpaper': () => systemUnavailable('set-wallpaper'),
        'create-shortcuts': () => systemUnavailable('create-shortcuts'),
        'create-folders': () => systemUnavailable('create-folders'),
        'run-program': () => systemUnavailable('run-program'),
        'chaotic-theme': () => systemUnavailable('chaotic-theme'),
        'camera-ai-reply': () => systemUnavailable('camera-ai-reply'),

        'account-login-change': (payload) => {
            const users = readUsers();
            const index = users.findIndex(user => user.login === payload.login);
            if (index === -1) {
                emit('account-fail', 'Текущий пользователь не найден.');
                return;
            }
            if (users[index].password !== payload.password) {
                emit('account-fail', 'Неверный текущий пароль.');
                return;
            }
            const nextLogin = String(payload.newLogin || '').trim();
            if (nextLogin.length < 3) {
                emit('account-fail', 'Логин должен содержать минимум 3 символа.');
                return;
            }
            if (users.some(user => user.login === nextLogin)) {
                emit('account-fail', 'Данное имя уже занято');
                return;
            }
            users[index].login = nextLogin;
            writeUsers(users);
            saveSession(nextLogin);
            emit('account-login-changed', nextLogin);
        },

        'account-password-request': (payload) => {
            const user = readUsers().find(item => item.login === payload.login);
            if (!user) {
                emit('account-fail', 'Текущий пользователь не найден.');
                return;
            }
            if (user.password !== payload.currentPassword) {
                emit('account-fail', 'Неверный текущий пароль.');
                return;
            }
            tempUser = user;
            emit('account-code-sent', user.email || '');
            startVerification(user.email);
        },

        'account-password-confirm': (payload) => {
            if (!tempUser) {
                emit('account-fail', 'Код истёк. Запросите новый.');
                return;
            }

            if (nativeVerification) {
                nativeCall('check-verification-code', String(payload.code))
                    .then(() => {
                        nativeVerification = false;
                        applyNewPassword(payload.newPassword);
                    })
                    .catch(error => emit('account-fail', error.message || 'Неверный код подтверждения'));
                return;
            }

            if (!verificationCode) {
                emit('account-fail', 'Код истёк. Запросите новый.');
                return;
            }
            if (String(payload.code) !== verificationCode) {
                emit('account-fail', 'Неверный код подтверждения');
                return;
            }
            verificationCode = null;
            applyNewPassword(payload.newPassword);
        },

        'account-password-resend': () => {
            if (!tempUser) {
                emit('account-fail', 'Нет адреса для повторной отправки кода.');
                return;
            }
            startVerification(tempUser.email);
        }
    };

    const invokeHandlers = {
        'get-current-user': () => getActiveSession(),
        'has-session': () => Boolean(getActiveSession()),
        'load-settings': () => readSettings(),
        'save-settings': (settings) => {
            storageSet(SETTINGS_KEY, JSON.stringify(settings || {}, null, 4));
            return { ok: true };
        },
        'write-files': () => ({ ok: false, error: 'Файловая система недоступна в браузере' }),
        'find-files': () => ({}),
        'save-image': () => ({ ok: false, error: 'Файловая система недоступна в браузере' }),
        'open-camera': () => ({ ok: false, error: 'Отдельное окно камеры недоступно в браузере' }),
        'send-to-ai': () => ({ ok: false, error: 'Недоступно в браузере' }),
        'check-roblox': () => ({ ok: false, running: false, error: 'Проверка процесса Roblox доступна только в десктопной версии' }),
        // В браузере ключа нет — чат сам покажет подсказку про ai-config.json
        'get-ai-config': () => null
    };

    const bridge = {
        hasSystemAccess: false,

        send: (channel, ...args) => {
            const handler = sendHandlers[channel];
            if (!handler) {
                console.warn(`[ebloX] Неизвестный канал: ${channel}`);
                return;
            }
            handler(...args);
        },

        on: (channel, handler) => {
            if (!listeners.has(channel)) listeners.set(channel, []);
            listeners.get(channel).push(handler);
            return bridge;
        },

        once: (channel, handler) => {
            const wrapper = (...args) => {
                bridge.removeListener(channel, wrapper);
                handler(...args);
            };
            return bridge.on(channel, wrapper);
        },

        removeListener: (channel, handler) => {
            const handlers = listeners.get(channel);
            if (!handlers) return bridge;
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
            return bridge;
        },

        removeAllListeners: (channel) => {
            if (channel) listeners.delete(channel);
            else listeners.clear();
            return bridge;
        },

        invoke: (channel, ...args) => {
            const handler = invokeHandlers[channel];
            if (!handler) return Promise.reject(new Error(`Неизвестный канал: ${channel}`));
            return Promise.resolve(handler(...args));
        },

        logout: () => {
            clearSession();
            window.location.href = 'index.html';
        },

        getSession: () => getActiveSession()
    };

    const restoreSession = () => {
        const isAuthPage = /(^|\/)index\.html$/i.test(window.location.pathname) || window.location.pathname.endsWith('/');
        if (!isAuthPage) return;

        const login = getActiveSession();
        if (!login) return;

        window.location.replace(`main.html?user=${encodeURIComponent(login)}`);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreSession);
    else restoreSession();

    const isInteractive = (target) => target instanceof Element &&
        target.closest('.window-controls, button, a, input, textarea, select, [contenteditable="true"]') !== null;

    const setupTitlebarDrag = () => {
        const titlebar = document.querySelector('.titlebar');
        if (!titlebar) return;

        titlebar.addEventListener('mousedown', (event) => {
            if (event.button !== 0 || isInteractive(event.target)) return;
            event.preventDefault();
            nativeSend('window-drag');
        });

        titlebar.addEventListener('dblclick', (event) => {
            if (isInteractive(event.target)) return;
            nativeSend('window-maximize');
        });
    };

    if (nativeHost) {
        const browserSend = bridge.send;
        const browserInvoke = bridge.invoke;

        bridge.hasSystemAccess = true;

        bridge.send = (channel, ...args) => {
            if (nativeSendChannels.has(channel)) {
                nativeSend(channel, ...args);
                return;
            }
            browserSend(channel, ...args);
        };

        bridge.invoke = (channel, ...args) => nativeInvokeChannels.has(channel)
            ? nativeInvoke(channel, ...args)
            : browserInvoke(channel, ...args);

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupTitlebarDrag);
        else setupTitlebarDrag();
    }

    // Ветка Electron: при nodeIntegration:true и contextIsolation:false в рендерере
    // доступен require, значит ipcRenderer можно взять напрямую.
    // Списки каналов здесь свои, а не общие с WebView2: пробрасываем только то,
    // для чего в main.js действительно зарегистрирован обработчик, иначе invoke
    // упадёт с "No handler registered", а не вернёт понятную заглушку.
    const electronSendChannels = new Set([
        'window-minimize',
        'window-maximize',
        'window-close',
        'set-wallpaper',
        'create-shortcuts',
        'create-folders',
        'run-program',
        'chaotic-theme',
        'camera-ai-reply'
    ]);

    const electronInvokeChannels = new Set([
        'write-files',
        'find-files',
        'save-image',
        'open-camera',
        'get-ai-config'
    ]);

    const electronIpc = (() => {
        if (nativeHost) return null;
        try {
            if (typeof require !== 'function') return null;
            if (typeof process === 'undefined' || !process.versions || !process.versions.electron) return null;
            return require('electron').ipcRenderer;
        } catch (error) {
            return null;
        }
    })();

    if (electronIpc) {
        const browserSend = bridge.send;
        const browserInvoke = bridge.invoke;

        bridge.hasSystemAccess = true;

        bridge.send = (channel, ...args) => {
            if (electronSendChannels.has(channel)) {
                electronIpc.send(channel, ...args);
                return;
            }
            browserSend(channel, ...args);
        };

        bridge.invoke = (channel, ...args) => electronInvokeChannels.has(channel)
            ? electronIpc.invoke(channel, ...args)
            : browserInvoke(channel, ...args);

        // Перетаскивание окна в Electron делает CSS (-webkit-app-region: drag),
        // поэтому свой mousedown-обработчик здесь не нужен.
    }

    window.EbloxBridge = bridge;
})();
