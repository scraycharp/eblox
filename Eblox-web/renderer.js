const ipcRenderer = window.EbloxBridge;

const authTranslations = {
    ru: {
        minimize: 'Свернуть',
        maximize: 'Развернуть',
        close: 'Закрыть',
        loginTitle: 'Авторизация',
        registerTitle: 'Регистрация',
        forgotTitle: 'Восстановление',
        newPasswordTitle: 'Новый пароль',
        loginPlaceholder: 'Логин',
        passwordPlaceholder: 'Пароль',
        emailPlaceholder: 'Почта',
        newPasswordPlaceholder: 'Новый пароль',
        remember: 'Запомнить меня',
        continueBtn: 'Продолжить',
        noAccount: 'У меня нет аккаунта',
        forgotPassword: 'Забыл пароль',
        haveAccount: 'У меня есть аккаунт',
        getCode: 'Получить код',
        changePassword: 'Сменить пароль',
        verifyTitle: 'Подтвердите вашу почту',
        sendingCode: 'Отправка кода на вашу почту...',
        codeSent: 'Код был отправлен по почте, которую вы указали',
        resend: 'Отправить код ещё раз',
        resent: 'Код отправлен повторно',
        ok: 'Ок',
        fillAll: 'Заполните все поля!',
        fillFields: 'Заполните поля!',
        fullCode: 'Введите полный код!',
        shortPassword: 'Пароль слишком короткий!',
        forgotSubtitle: 'Введите логин и почту аккаунта для получения кода',
        vpnTitle: 'Включите VPN',
        vpnText: 'Письмо не удалось отправить за 30 секунд. Скорее всего, доступ к почтовому сервису закрыт провайдером — включите VPN и попробуйте ещё раз.',
        vpnRetry: 'Отправить ещё раз',
        vpnClose: 'Закрыть',
        easterText: 'а кто это ваще?',
        online: 'используют',
        disclaimer: '© 2026 ebloX связана с компание Roblox, и лично ебала его создателя в сраку. Все коммерческие транзакции от ныне принадлежат только ebloX. ахахха ваши все робуксы теперь у меня лохи.'
    },
    en: {
        minimize: 'Minimize',
        maximize: 'Maximize',
        close: 'Close',
        loginTitle: 'Sign in',
        registerTitle: 'Sign up',
        forgotTitle: 'Password recovery',
        newPasswordTitle: 'New password',
        loginPlaceholder: 'Username',
        passwordPlaceholder: 'Password',
        emailPlaceholder: 'Email',
        newPasswordPlaceholder: 'New password',
        remember: 'Remember me',
        continueBtn: 'Continue',
        noAccount: "I don't have an account",
        forgotPassword: 'Forgot password',
        haveAccount: 'I already have an account',
        getCode: 'Get the code',
        changePassword: 'Change password',
        verifyTitle: 'Confirm your email',
        sendingCode: 'Sending the code to your email...',
        codeSent: 'The code has been sent to the email you provided',
        resend: 'Send the code again',
        resent: 'The code has been sent again',
        ok: 'Ok',
        fillAll: 'Fill in all the fields!',
        fillFields: 'Fill in the fields!',
        fullCode: 'Enter the full code!',
        shortPassword: 'The password is too short!',
        forgotSubtitle: 'Enter the account username and email to get the code',
        vpnTitle: 'Turn on a VPN',
        vpnText: 'The email could not be sent within 30 seconds. Your provider has most likely blocked access to the mail service — turn on a VPN and try again.',
        vpnRetry: 'Send again',
        vpnClose: 'Close',
        easterText: 'and who even is this?',
        online: 'using it',
        disclaimer: '© 2026 ebloX is affiliated with Roblox and has personally screwed its creator. From now on all commercial transactions belong to ebloX alone. hahaha all your robux are mine now, losers.'
    }
};

let authLang = localStorage.getItem('eblox-language') === 'en' ? 'en' : 'ru';

const authText = (key) => (authTranslations[authLang] && authTranslations[authLang][key]) || authTranslations.ru[key] || key;

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element && value) element.textContent = value;
}

function setPlaceholder(selector, value) {
    const element = document.querySelector(selector);
    if (element && value) element.placeholder = value;
}

function applyAuthLanguage(lang) {
    authLang = lang === 'en' ? 'en' : 'ru';
    localStorage.setItem('eblox-language', authLang);
    document.documentElement.lang = authLang;

    const langBtn = document.getElementById('auth-lang-btn');
    if (langBtn) langBtn.textContent = authLang === 'en' ? 'EN' : 'RU';

    const minimizeBtn = document.getElementById('btn-minimize');
    const maximizeBtn = document.getElementById('btn-maximize');
    const closeBtn = document.getElementById('btn-close-app');
    if (minimizeBtn) minimizeBtn.title = authText('minimize');
    if (maximizeBtn) maximizeBtn.title = authText('maximize');
    if (closeBtn) closeBtn.title = authText('close');

    // Заголовки форм — обычные <h1> внутри своих .auth-view, классов у них нет
    setText('#view-login h1', authText('loginTitle'));
    setText('#view-register h1', authText('registerTitle'));
    setText('#view-forgot h1', authText('forgotTitle'));
    setText('#view-new-password h1', authText('newPasswordTitle'));

    setPlaceholder('#login-username', authText('loginPlaceholder'));
    setPlaceholder('#login-password', authText('passwordPlaceholder'));
    setPlaceholder('#reg-username', authText('loginPlaceholder'));
    setPlaceholder('#reg-email', authText('emailPlaceholder'));
    setPlaceholder('#reg-password', authText('passwordPlaceholder'));
    setPlaceholder('#forgot-username', authText('loginPlaceholder'));
    setPlaceholder('#forgot-email', authText('emailPlaceholder'));
    setPlaceholder('#reset-new-password', authText('newPasswordPlaceholder'));

    setText('#login-remember-text', authText('remember'));
    setText('#login-button', authText('continueBtn'));
    setText('#register-button', authText('continueBtn'));
    setText('#forgot-button', authText('getCode'));
    setText('#save-password-button', authText('changePassword'));
    setText('#btn-verify-confirm', authText('continueBtn'));
    setText('#btn-resend-code', authText('resend'));
    setText('#to-register-link', authText('noAccount'));
    setText('#to-forgot-link', authText('forgotPassword'));
    setText('#back-to-login-1', authText('haveAccount'));
    setText('#back-to-login-2', authText('haveAccount'));
    setText('#message-ok-btn', authText('ok'));
    setText('#modal-content-body h2', authText('verifyTitle'));
    setText('#modal-content-body .modal-sub', authText('codeSent'));
    setText('#modal-loader p', authText('sendingCode'));

    setText('#view-forgot .form-subtitle', authText('forgotSubtitle'));
    setText('#vpn-title', authText('vpnTitle'));
    setText('#vpn-text', authText('vpnText'));
    setText('#vpn-retry-btn', authText('vpnRetry'));
    setText('#vpn-close-btn', authText('vpnClose'));
    setText('#easter-egg-overlay .easter-modal p', authText('easterText'));
    setText('#close-easter-btn', authText('ok'));
    setText('.disclaimer', authText('disclaimer'));

    // Счётчик онлайна: число оставляем, меняем только подпись
    const onlineBadge = document.querySelector('.online-badge');
    if (onlineBadge) {
        const count = onlineBadge.textContent.match(/\d+/)?.[0] || '826';
        onlineBadge.innerHTML = `<span class="dot"></span> ${count} ${authText('online')}`;
    }
}

// --- ГЛОБАЛЬНЫЕ ЭЛЕМЕНТЫ ---
const mainContainer = document.getElementById('main-content');
const modalOverlay = document.getElementById('modal-overlay');
const modalLoader = document.getElementById('modal-loader');
const modalContentBody = document.getElementById('modal-content-body');
const easterOverlay = document.getElementById('easter-egg-overlay');
const easterBtn = document.getElementById('easter-egg-btn');

const messageOverlay = document.getElementById('message-overlay');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');

// Переменная для отслеживания текущего процесса
let currentProcessMode = 'register';
let isAnimating = false;

// --- УНИВЕРСАЛЬНОЕ ВНУТРЕННЕЕ СООБЩЕНИЕ ---
let messageCloseCallback = null;

function showMessage(text, onClose = null) {
    messageText.textContent = text;
    messageCloseCallback = onClose;
    messageOverlay.style.display = 'flex';
}

function hideMessage() {
    messageOverlay.style.display = 'none';
    const cb = messageCloseCallback;
    messageCloseCallback = null;
    if (typeof cb === 'function') {
        cb();
    }
}

messageOkBtn.onclick = hideMessage;
messageOverlay.addEventListener('click', (e) => {
    if (e.target === messageOverlay) hideMessage();
});

// --- ПЛАШКА О VPN (ТАЙМАУТ ОТПРАВКИ ПИСЬМА) ---
const vpnOverlay = document.getElementById('vpn-overlay');
const vpnText = document.getElementById('vpn-text');
const vpnRetryBtn = document.getElementById('vpn-retry-btn');
const vpnCloseBtn = document.getElementById('vpn-close-btn');

function showVpnNotice(text) {
    // Окно ввода кода больше не ждёт: письмо не ушло
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');

    if (text) vpnText.textContent = text;
    vpnOverlay.style.display = 'flex';
}

function hideVpnNotice() {
    vpnOverlay.style.display = 'none';
}

if (vpnCloseBtn) vpnCloseBtn.onclick = hideVpnNotice;

if (vpnRetryBtn) {
    vpnRetryBtn.onclick = () => {
        hideVpnNotice();
        mainContainer.classList.add('global-blur');
        modalOverlay.style.display = 'flex';
        modalLoader.style.display = 'flex';
        modalContentBody.style.display = 'none';
        ipcRenderer.send('resend-code', authLang);
    };
}

if (vpnOverlay) {
    vpnOverlay.addEventListener('click', (e) => {
        if (e.target === vpnOverlay) hideVpnNotice();
    });
}

// --- УПРАВЛЕНИЕ ОКНОМ ---
document.getElementById('btn-minimize').onclick = () => ipcRenderer.send('window-minimize');
document.getElementById('btn-maximize').onclick = () => ipcRenderer.send('window-maximize');
document.getElementById('btn-close-app').onclick = () => ipcRenderer.send('window-close');

const authLangBtn = document.getElementById('auth-lang-btn');
if (authLangBtn) authLangBtn.onclick = () => applyAuthLanguage(authLang === 'en' ? 'ru' : 'en');

const resendCodeBtn = document.getElementById('btn-resend-code');
if (resendCodeBtn) {
    resendCodeBtn.onclick = (e) => {
        e.preventDefault();
        modalLoader.style.display = 'flex';
        modalContentBody.style.display = 'none';
        ipcRenderer.send('resend-code', authLang);
    };
}

applyAuthLanguage(authLang);

// --- ПАСХАЛКА "Э" ---
easterBtn.onclick = (e) => {
    e.preventDefault();
    mainContainer.classList.add('global-blur');
    easterOverlay.style.display = 'flex';
};

document.getElementById('close-easter-btn').onclick = () => {
    easterOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    easterBtn.style.display = 'none';
};

// --- НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ ---
function switchScreen(targetViewId) {
    if (isAnimating) return;
    
    const allViews = document.querySelectorAll('.auth-view');
    const currentActive = document.querySelector('.auth-view.active');
    const targetView = document.getElementById(targetViewId);
    const formLogo = document.querySelector('#main-content .form-logo');
    
    if (!currentActive || !targetView) {
        console.error('Не найдена текущая или целевая форма');
        return;
    }
    
    if (currentActive.id === targetViewId) return;
    
    isAnimating = true;
    
    // Анимируем логотип
    if (formLogo) {
        formLogo.classList.add('logo-up-out');
    }
    
    // Получаем видимые элементы текущей формы
    const currentElements = [];
    const children = currentActive.children;
    for (let child of children) {
        if (child.style.display !== 'none' && child.offsetParent !== null) {
            currentElements.push(child);
        }
    }
    
    // Анимируем уход элементов
    if (currentElements.length > 0) {
        currentElements.forEach((el, index) => {
            setTimeout(() => {
                el.classList.add('element-up-out');
            }, index * 80);
        });
    }
    
    const totalHideTime = Math.max(currentElements.length * 80 + 400, 500);
    
    setTimeout(() => {
        // Скрываем все формы
        allViews.forEach(view => {
            view.style.display = 'none';
            view.classList.remove('active', 'slide-up-out', 'slide-up-in');
        });
        
        // Очищаем классы анимации
        currentElements.forEach(el => {
            el.classList.remove('element-up-out');
        });
        
        // Показываем целевую форму
        targetView.style.display = 'block';
        targetView.classList.add('active');
        
        // Возвращаем логотип
        if (formLogo) {
            formLogo.classList.remove('logo-up-out');
            formLogo.classList.add('logo-down-in');
            setTimeout(() => {
                formLogo.classList.remove('logo-down-in');
            }, 500);
        }
        
        // Получаем элементы новой формы
        const targetElements = [];
        const targetChildren = targetView.children;
        for (let child of targetChildren) {
            targetElements.push(child);
        }
        
        // Скрываем и анимируем появление
        targetElements.forEach(el => {
            el.classList.add('element-hidden');
        });
        
        if (targetElements.length > 0) {
            targetElements.forEach((el, index) => {
                setTimeout(() => {
                    el.classList.remove('element-hidden');
                    el.classList.add('element-down-in');
                    
                    setTimeout(() => {
                        el.classList.remove('element-down-in');
                    }, 600);
                }, index * 100 + 200);
            });
            
            setTimeout(() => {
                isAnimating = false;
            }, targetElements.length * 100 + 800);
        } else {
            isAnimating = false;
        }
        
    }, totalHideTime);
}

// --- ВСПОМОГАТЕЛЬНОЕ: ОЧИСТКА КОДА ---
function resetCodeInputs() {
    const boxes = document.querySelectorAll('.c-box');
    boxes.forEach(box => {
        box.value = '';
    });
    if (boxes.length > 0) boxes[0].focus();
}

// --- МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ---
function openVerificationModal(mode) {
    currentProcessMode = mode;
    resetCodeInputs();
    mainContainer.classList.add('global-blur');
    modalOverlay.style.display = 'flex';
    modalLoader.style.display = 'flex';
    modalContentBody.style.display = 'none';
}

ipcRenderer.on('show-verify-modal', () => {
    modalLoader.style.display = 'none';
    modalContentBody.style.display = 'block';
    const boxes = document.querySelectorAll('.c-box');
    if (boxes.length > 0) boxes[0].focus();
});

ipcRenderer.on('server-error', (event, message) => {
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    showMessage(message);
});

// Отправка не уложилась в 30 секунд — вместо обычной ошибки показываем плашку про VPN
ipcRenderer.on('mail-vpn-required', (event, message) => {
    showVpnNotice(message);
});

// --- ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ (ОБРАБОТЧИКИ КНОПОК) ---
document.addEventListener('DOMContentLoaded', () => {
    // Эти обработчики добавятся после загрузки DOM
    const toRegisterLink = document.getElementById('to-register-link');
    const toForgotLink = document.getElementById('to-forgot-link');
    const backToLogin1 = document.getElementById('back-to-login-1');
    const backToLogin2 = document.getElementById('back-to-login-2');
    
    if (toRegisterLink) {
        toRegisterLink.onclick = (e) => {
            e.preventDefault();
            switchScreen('view-register');
        };
    }
    
    if (toForgotLink) {
        toForgotLink.onclick = (e) => {
            e.preventDefault();
            switchScreen('view-forgot');
        };
    }
    
    if (backToLogin1) {
        backToLogin1.onclick = (e) => {
            e.preventDefault();
            switchScreen('view-login');
        };
    }
    
    if (backToLogin2) {
        backToLogin2.onclick = (e) => {
            e.preventDefault();
            switchScreen('view-login');
        };
    }
});

// --- РЕГИСТРАЦИЯ ---
const registerButton = document.getElementById('register-button');
if (registerButton) {
    registerButton.onclick = () => {
        const login = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;

        if (!login || !email || !password) {
            showMessage(authText('fillAll'));
            return;
        }

        document.getElementById('reg-group-login').classList.remove('error');
        document.getElementById('reg-group-email').classList.remove('error');
        document.getElementById('reg-error-login').style.display = 'none';
        document.getElementById('reg-error-email').style.display = 'none';

        openVerificationModal('register');
        ipcRenderer.send('register-attempt', { login, email, password, lang: authLang });
    };
}

ipcRenderer.on('register-fail-login', (event, message) => {
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    const errText = document.getElementById('reg-error-login');
    if (errText) {
        errText.innerText = message;
        errText.style.display = 'block';
    }
    const regGroupLogin = document.getElementById('reg-group-login');
    if (regGroupLogin) {
        regGroupLogin.classList.add('error');
    }
});

ipcRenderer.on('register-fail-email', (event, message) => {
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    const errText = document.getElementById('reg-error-email');
    if (errText) {
        errText.innerText = message;
        errText.style.display = 'block';
    }
    const regGroupEmail = document.getElementById('reg-group-email');
    if (regGroupEmail) {
        regGroupEmail.classList.add('error');
    }
});

// --- ВОССТАНОВЛЕНИЕ ПАРОЛЯ ---
const forgotButton = document.getElementById('forgot-button');
if (forgotButton) {
    forgotButton.onclick = () => {
        const login = document.getElementById('forgot-username').value.trim();
        const email = document.getElementById('forgot-email').value.trim();

        if (!login || !email) {
            showMessage(authText('fillFields'));
            return;
        }

        document.getElementById('forgot-error-text').style.display = 'none';
        openVerificationModal('forgot');
        ipcRenderer.send('forgot-password-attempt', { login, email, lang: authLang });
    };
}

ipcRenderer.on('forgot-fail', (event, message) => {
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    const errText = document.getElementById('forgot-error-text');
    if (errText) {
        errText.innerText = message;
        errText.style.display = 'block';
    }
});

// --- ПОДТВЕРЖДЕНИЕ КОДА ---
const btnVerifyConfirm = document.getElementById('btn-verify-confirm');
if (btnVerifyConfirm) {
    btnVerifyConfirm.onclick = () => {
        const boxes = document.querySelectorAll('.c-box');
        const fullCode = Array.from(boxes).map(input => input.value).join('');

        if (fullCode.length < 5) {
            showMessage(authText('fullCode'));
            return;
        }

        ipcRenderer.send('verify-code-check', fullCode);
    };
}

ipcRenderer.on('verify-fail', (event, message) => {
    showMessage(message);
});

ipcRenderer.on('verify-success', () => {
    modalOverlay.style.display = 'none';
    mainContainer.classList.remove('global-blur');
    if (currentProcessMode === 'register') {
        ipcRenderer.send('final-register-save');
    } else {
        switchScreen('view-new-password');
    }
});

// --- УСПЕШНЫЕ ОПЕРАЦИИ ---
ipcRenderer.on('operation-success', (event, message) => {
    showMessage(message, () => {
        switchScreen('view-login');
    });
});

// --- СМЕНА ПАРОЛЯ ---
const savePasswordButton = document.getElementById('save-password-button');
if (savePasswordButton) {
    savePasswordButton.onclick = () => {
        const newPass = document.getElementById('reset-new-password').value;
        if (newPass.length < 4) {
            showMessage(authText('shortPassword'));
            return;
        }
        ipcRenderer.send('final-password-update', newPass);
    };
}

// --- ЛОГИКА ВХОДА ---
const loginButton = document.getElementById('login-button');
if (loginButton) {
    loginButton.onclick = () => {
        const login = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-password').value;

        if (!login || !pass) {
            showMessage(authText('fillAll'));
            return;
        }

        const loginInputGroup = document.getElementById('login-input-group');
        const loginErrorText = document.getElementById('login-error-text');
        
        if (loginInputGroup) loginInputGroup.classList.remove('error');
        if (loginErrorText) loginErrorText.style.display = 'none';
        
        const profileIcon = document.querySelector('#login-input-group .input-icon');
        if (profileIcon) {
            profileIcon.src = 'assets/profile.png';
        }

        const rememberBox = document.getElementById('login-remember');
        const remember = rememberBox ? rememberBox.checked : true;

        ipcRenderer.send('login-attempt', { login, password: pass, remember });
    };
}

ipcRenderer.on('login-success', () => {
    // Успешный вход
});

ipcRenderer.on('login-fail', (event, message) => {
    const errText = document.getElementById('login-error-text');
    const loginInputGroup = document.getElementById('login-input-group');
    
    if (errText) {
        errText.innerText = message;
        errText.style.display = 'block';
    }
    if (loginInputGroup) {
        loginInputGroup.classList.add('error');
    }
    
    const profileIcon = document.querySelector('#login-input-group .input-icon');
    if (profileIcon) {
        profileIcon.src = 'assets/profile_error.png';
    }
});

// --- ГЛАЗ ---
document.querySelectorAll('.eye-toggle').forEach(eye => {
    eye.onclick = (e) => {
        const inputField = e.target.parentElement.querySelector('input');
        if (inputField) {
            if (inputField.type === 'password') {
                inputField.type = 'text';
                e.target.src = 'assets/invisible.png';
            } else {
                inputField.type = 'password';
                e.target.src = 'assets/visible.png';
            }
        }
    };
});

// --- АВТОПЕРЕХОД МЕЖДУ ПОЛЯМИ КОДА ---
document.addEventListener('DOMContentLoaded', () => {
    const codeInputs = document.querySelectorAll('.c-box');

    // Раскладывает вставленный код по всем полям
    const distributeCode = (raw, startIndex) => {
        const digits = String(raw).replace(/\D/g, '');
        if (!digits) return;
        let cursor = startIndex;
        for (const digit of digits) {
            if (cursor >= codeInputs.length) break;
            codeInputs[cursor].value = digit;
            cursor++;
        }
        const lastFilled = Math.min(cursor, codeInputs.length) - 1;
        codeInputs[lastFilled >= 0 ? lastFilled : 0].focus();
    };

    codeInputs.forEach((input, index) => {
        input.oninput = () => {
            // Вставка без события paste (например, через контекстное меню)
            if (input.value.length > 1) {
                distributeCode(input.value, index);
                return;
            }
            if (input.value.length === 1 && index < codeInputs.length - 1) {
                codeInputs[index + 1].focus();
            }
        };
        input.onpaste = (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text');
            distributeCode(pasted, index);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Backspace' && input.value.length === 0 && index > 0) {
                codeInputs[index - 1].focus();
            }
        };
    });
});