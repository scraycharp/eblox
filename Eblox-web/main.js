const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const nodemailer = require('nodemailer');

let win;
let verificationCode = null;
let tempUserData = null;
let currentUserLogin = null;

// Все .json (конфиги и данные) лежат в папке Eblox-web, рядом с main.js.
const folderPath = __dirname;
const filePath = path.join(folderPath, 'users.json');
const sessionPath = path.join(folderPath, 'session.json');
const mailConfigPath = path.join(folderPath, 'mail-config.json');
const aiConfigPath = path.join(folderPath, 'ai-config.json');
const settingsPath = path.join(folderPath, 'settings.json');

// Разовый перенос конфигов из прежнего места (%LOCALAPPDATA%\Eblox),
// чтобы аккаунты и ключи не потерялись после смены каталога.
const LEGACY_CONFIG_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Eblox');
const CONFIG_FILE_NAMES = ['users.json', 'session.json', 'mail-config.json', 'ai-config.json', 'settings.json'];

function migrateLegacyConfigs() {
    if (LEGACY_CONFIG_DIR === folderPath) return;

    for (const name of CONFIG_FILE_NAMES) {
        const legacy = path.join(LEGACY_CONFIG_DIR, name);
        const target = path.join(folderPath, name);

        try {
            if (fs.existsSync(legacy) && !fs.existsSync(target)) {
                fs.copyFileSync(legacy, target);
                console.log(`Конфиг перенесён в Eblox-web: ${name}`);
            }
        } catch (error) {
            console.error(`Не удалось перенести ${name}:`, error);
        }
    }
}

const SESSION_TTL_DAYS = 30;
const CODE_TTL_MS = 10 * 60 * 1000;

let verificationEmail = null;
let verificationExpiresAt = 0;
let verificationLang = 'ru';

// --- ИНИЦИАЛИЗАЦИЯ ПУТЕЙ И БАЗЫ ---
function initDatabase() {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        migrateLegacyConfigs();

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify({ users: [] }, null, 4), 'utf-8');
            return;
        }

        const data = getDatabaseContent();
        if (!data.users || !Array.isArray(data.users)) {
            fs.writeFileSync(filePath, JSON.stringify({ users: [] }, null, 4), 'utf-8');
        }
    } catch (error) {
        console.error('Ошибка инициализации базы:', error);
    }
}
function getDatabaseContent() {
    try {
        if (!fs.existsSync(filePath)) {
            return { users: [] };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || content.trim() === '') {
            return { users: [] };
        }

        return JSON.parse(content);
    } catch (error) {
        console.error("Ошибка чтения базы данных:", error);
        return { users: [] };
    }
}
function readMailConfig() {
    let fileConfig = {};

    try {
        if (fs.existsSync(mailConfigPath)) {
            fileConfig = JSON.parse(fs.readFileSync(mailConfigPath, 'utf-8')) || {};
        }
    } catch (error) {
        console.error('Ошибка чтения mail-config.json:', error);
    }

    const user = process.env.EBLOX_SMTP_USER || fileConfig.user || '';
    const pass = process.env.EBLOX_SMTP_PASSWORD || fileConfig.pass || '';

    return {
        host: process.env.EBLOX_SMTP_HOST || fileConfig.host || 'smtp.gmail.com',
        port: Number(process.env.EBLOX_SMTP_PORT || fileConfig.port || 465),
        secure: String(process.env.EBLOX_SMTP_SECURE || fileConfig.secure || 'true') !== 'false',
        user,
        pass,
        senderName: process.env.EBLOX_SMTP_SENDER_NAME || fileConfig.senderName || 'ebloX Support'
    };
}

function createMailConfigTemplate() {
    try {
        if (fs.existsSync(mailConfigPath)) return;

        const template = {
            provider: 'resend',
            resendApiKey: '',
            senderEmail: 'onboarding@resend.dev',
            senderName: 'ebloX Support',
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            user: '',
            pass: ''
        };

        fs.writeFileSync(mailConfigPath, JSON.stringify(template, null, 4), 'utf-8');
    } catch (error) {
        console.error('Ошибка создания mail-config.json:', error);
    }
}

// ---------- Resend (https://resend.com/docs/api-reference/emails/send-email) ----------
// Ждём ответ не дольше 30 секунд: дальше показываем плашку про VPN,
// потому что api.resend.com часто режется провайдером.
const MAIL_TIMEOUT_MS = 30000;
const DEFAULT_RESEND_KEY = 're_HUFE9X9n_G6K6iXhEhV34RfxFsHxuMFdd';
const DEFAULT_RESEND_SENDER = 'onboarding@resend.dev';

function readResendConfig() {
    let fileConfig = {};

    try {
        if (fs.existsSync(mailConfigPath)) {
            fileConfig = JSON.parse(fs.readFileSync(mailConfigPath, 'utf-8')) || {};
        }
    } catch (error) {
        console.error('Ошибка чтения mail-config.json:', error);
    }

    const apiKey = process.env.RESEND_API_KEY || fileConfig.resendApiKey || DEFAULT_RESEND_KEY;
    const senderEmail = process.env.EBLOX_MAIL_SENDER || fileConfig.senderEmail || DEFAULT_RESEND_SENDER;

    return {
        apiKey,
        senderEmail,
        senderName: process.env.EBLOX_SMTP_SENDER_NAME || fileConfig.senderName || 'ebloX Support',
        provider: String(process.env.EBLOX_MAIL_PROVIDER || fileConfig.provider || 'resend').toLowerCase()
    };
}

function resendRequest(payload, apiKey) {
    return new Promise((resolve, reject) => {
        const body = Buffer.from(JSON.stringify(payload), 'utf-8');

        const request = https.request({
            hostname: 'api.resend.com',
            path: '/emails',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': body.length
            }
        }, (response) => {
            let raw = '';
            response.on('data', chunk => { raw += chunk; });
            response.on('end', () => {
                // Resend отвечает 200 и телом { "id": "..." }
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    resolve({ ok: true });
                    return;
                }
                reject(new Error(`Resend HTTP ${response.statusCode}: ${raw.slice(0, 400)}`));
            });
        });

        request.on('error', reject);
        request.setTimeout(MAIL_TIMEOUT_MS, () => request.destroy(new Error('MAIL_TIMEOUT')));
        request.write(body);
        request.end();
    });
}

function isMailTimeout(error) {
    const message = String(error && error.message || '');
    return message.includes('MAIL_TIMEOUT')
        || message.includes('ETIMEDOUT')
        || message.includes('ENOTFOUND')
        || message.includes('EAI_AGAIN')
        || message.includes('ECONNRESET');
}

function describeResendError(error) {
    const message = String(error && error.message || '');
    if (isMailTimeout(error)) {
        return `Превышено время ожидания отправки (${MAIL_TIMEOUT_MS / 1000} сек). `
            + 'Скорее всего, доступ к api.resend.com закрыт провайдером — включите VPN и попробуйте ещё раз.';
    }
    if (message.includes('HTTP 401') || message.includes('HTTP 403')) return 'Ключ Resend отклонён. Проверьте resendApiKey.';
    if (message.includes('HTTP 422')) return 'Resend отклонил адрес отправителя или получателя.';
    if (message.includes('HTTP 429')) return 'Превышен лимит отправки Resend. Повторите позже.';
    return 'Не удалось отправить письмо через Resend.';
}

// ---------- AI (AgentRouter) ----------
function readAiConfig() {
    let fileConfig = {};

    try {
        if (fs.existsSync(aiConfigPath)) {
            fileConfig = JSON.parse(fs.readFileSync(aiConfigPath, 'utf-8')) || {};
        }
    } catch (error) {
        console.error('Ошибка чтения ai-config.json:', error);
    }

    return {
        apiUrl: process.env.EBLOX_AI_URL || fileConfig.apiUrl || 'https://agentrouter.org/v1/chat/completions',
        apiKey: process.env.EBLOX_AI_KEY || fileConfig.apiKey || '',
        model: process.env.EBLOX_AI_MODEL || fileConfig.model || 'claude-opus-4-8'
    };
}

function createAiConfigTemplate() {
    try {
        if (fs.existsSync(aiConfigPath)) return;

        const template = {
            apiUrl: 'https://agentrouter.org/v1/chat/completions',
            apiKey: '',
            model: 'claude-opus-4-8'
        };

        fs.writeFileSync(aiConfigPath, JSON.stringify(template, null, 4), 'utf-8');
    } catch (error) {
        console.error('Ошибка создания ai-config.json:', error);
    }
}

let transporter = null;
let transporterKey = '';

function getTransporter() {
    const config = readMailConfig();

    if (!config.user || !config.pass) return { transporter: null, config };

    const key = `${config.host}:${config.port}:${config.secure}:${config.user}`;

    if (!transporter || transporterKey !== key) {
        transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            pool: true,
            maxConnections: 1,
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
            auth: { user: config.user, pass: config.pass }
        });
        transporterKey = key;
    }

    return { transporter, config };
}

function describeMailError(error) {
    const code = error && error.code ? String(error.code) : '';

    if (code === 'EAUTH') return 'SMTP отклонил логин или пароль. Проверьте пароль приложения в mail-config.json.';
    if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET') return 'Не удалось подключиться к почтовому серверу. Проверьте интернет.';
    if (code === 'EENVELOPE') return 'Почтовый сервер отклонил адрес получателя.';

    return 'Ошибка при отправке письма. Попробуйте ещё раз.';
}

// --- ОКНО ---
function createWindow() {
    win = new BrowserWindow({
        width: 1400,      // было 1150
        height: 900,      // было 750
        minWidth: 1100,   // было 900
        minHeight: 750,   // было 600
        frame: false,
        resizable: true,
        icon: path.join(__dirname, 'assets/logo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
            //devTools: true
        }
    });

    const session = readSession();

    if (session) {
        currentUserLogin = session.login;
        win.loadFile('main.html', { query: { user: session.login } });
    } else {
        win.loadFile('index.html');
    }

    win.on('closed', () => {
        win = null;
    });
}

// --- УПРАВЛЕНИЕ ОКНОМ ---
ipcMain.on('window-minimize', () => {
    if (win) win.minimize();
});

ipcMain.on('window-maximize', () => {
    if (!win) return;

    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});

ipcMain.on('window-close', () => {
    if (win) win.close();
});

function readSession() {
    try {
        if (!fs.existsSync(sessionPath)) return null;

        const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
        if (!session || !session.login) return null;
        if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
            clearSession();
            return null;
        }

        const data = getDatabaseContent();
        const exists = data.users.some(u => u.login === session.login);
        if (!exists) {
            clearSession();
            return null;
        }

        return session;
    } catch (error) {
        console.error('Ошибка чтения сессии:', error);
        return null;
    }
}

function saveSession(login) {
    try {
        const session = {
            login,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
        };

        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 4), 'utf-8');
    } catch (error) {
        console.error('Ошибка сохранения сессии:', error);
    }
}

function clearSession() {
    try {
        if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    } catch (error) {
        console.error('Ошибка сброса сессии:', error);
    }
}

// --- ТЕКСТЫ ПИСЬМА ---
const MAIL_TEXT = {
    ru: {
        subject: 'Код подтверждения ebloX',
        preheader: 'Код подтверждения ebloX — действует 10 минут.',
        badge: 'Система подтверждения',
        title: 'Подтвердите вашу почту',
        lead: 'Мы получили запрос на подтверждение этого адреса в лаунчере ebloX. Код ниже нужно ввести в окне подтверждения.',
        codeLabel: 'Ваш код подтверждения',
        ttl: 'Код действует 10 минут',
        hintTitle: 'Как вставить код быстро',
        hint: 'Скопируйте код целиком (Ctrl+C) и вставьте в окно подтверждения (Ctrl+V) — все пять полей заполнятся сразу.',
        ignore: 'Если вы не запрашивали этот код в приложении ebloX, просто проигнорируйте письмо — с аккаунтом ничего не произойдёт.',
        footer: '© 2026 ebloX. Все права защищены.'
    },
    en: {
        subject: 'ebloX verification code',
        preheader: 'Your ebloX verification code — valid for 10 minutes.',
        badge: 'Verification system',
        title: 'Confirm your email',
        lead: 'We received a request to confirm this address in the ebloX launcher. Enter the code below in the confirmation window.',
        codeLabel: 'Your verification code',
        ttl: 'The code is valid for 10 minutes',
        hintTitle: 'Paste the code in one go',
        hint: 'Copy the whole code (Ctrl+C) and paste it into the confirmation window (Ctrl+V) — all five boxes fill in at once.',
        ignore: 'If you did not request this code in the ebloX app, just ignore this email — nothing will happen to your account.',
        footer: '© 2026 ebloX. All rights reserved.'
    }
};

const mailLang = (lang) => (lang === 'en' ? 'en' : 'ru');

// --- ШАБЛОН ПИСЬМА В СТИЛЕ ebloX ---
function buildVerificationEmail(code, lang) {
    const t = MAIL_TEXT[mailLang(lang)];
    const font = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    const html = `<!DOCTYPE html>
<html lang="${mailLang(lang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background:#03080F;">
<div style="display:none;font-size:1px;color:#03080F;max-height:0;overflow:hidden;">${t.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#03080F;">
<tr><td align="center" style="padding:36px 14px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:#0B1016;border:1px solid #404A5E;border-radius:24px;">

<tr><td style="padding:30px 36px 22px;border-bottom:1px solid rgba(64,74,94,0.45);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" style="font-family:${font};font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:.4px;line-height:1;">eblo<span style="color:#70BEFF;">X</span></td>
<td align="right" style="font-family:${font};font-size:11px;color:#404A5E;letter-spacing:.6px;text-transform:uppercase;">${t.badge}</td>
</tr></table>
</td></tr>

<tr><td style="padding:32px 36px 0;">
<h1 style="margin:0 0 12px;font-family:${font};font-size:23px;font-weight:600;color:#FFFFFF;">${t.title}</h1>
<p style="margin:0;font-family:${font};font-size:14px;line-height:1.65;color:#899DC4;">${t.lead}</p>
</td></tr>

<tr><td align="center" style="padding:28px 36px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030911;border:1px solid #00488B;border-radius:20px;">
<tr><td align="center" style="padding:26px 20px 24px;">
<div style="font-family:${font};font-size:12px;font-weight:500;color:#899DC4;letter-spacing:.8px;text-transform:uppercase;margin-bottom:14px;">${t.codeLabel}</div>
<div style="font-family:'Consolas','SF Mono',Menlo,monospace;font-size:40px;font-weight:700;color:#FFFFFF;letter-spacing:9px;padding-left:9px;line-height:1.2;-webkit-user-select:all;user-select:all;">${code}</div>
<div style="font-family:${font};font-size:12px;color:#404A5E;margin-top:14px;">${t.ttl}</div>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:22px 36px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(112,190,255,0.06);border-left:3px solid #70BEFF;border-radius:10px;">
<tr><td style="padding:14px 16px;">
<div style="font-family:${font};font-size:13px;font-weight:600;color:#70BEFF;margin-bottom:5px;">${t.hintTitle}</div>
<div style="font-family:${font};font-size:13px;line-height:1.6;color:#899DC4;">${t.hint}</div>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:24px 36px 30px;">
<p style="margin:0;font-family:${font};font-size:12px;line-height:1.65;color:#404A5E;">${t.ignore}</p>
</td></tr>

<tr><td align="center" style="padding:18px 36px 26px;border-top:1px solid rgba(64,74,94,0.45);">
<div style="font-family:${font};font-size:11px;color:#2F3140;">${t.footer}</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

    const text = [t.title, '', `${t.codeLabel}: ${code}`, t.ttl, '', t.hint, '', t.ignore, '', t.footer].join('\n');

    return { subject: t.subject, html, text };
}

// --- ОТПРАВКА ПИСЬМА С КОДОМ ---
async function sendVerificationMail(email, event, lang) {
    const resend = readResendConfig();
    const useResend = resend.provider === 'resend' && resend.apiKey && resend.senderEmail;

    const { transporter: mailer, config } = getTransporter();

    if (!useResend && !mailer) {
        createMailConfigTemplate();
        console.error('Почта не настроена:', mailConfigPath);
        event.reply('server-error', `Почта не настроена. Укажите resendApiKey и senderEmail (или user и pass) в файле ${mailConfigPath}`);
        return;
    }

    // Код сбрасывает пароль, поэтому берём его из криптостойкого ГПСЧ
    verificationCode = (10000 + crypto.randomInt(90000)).toString();
    verificationEmail = email;
    verificationExpiresAt = Date.now() + CODE_TTL_MS;
    if (lang) verificationLang = mailLang(lang);

    const { subject, html: htmlContent, text: plainText } = buildVerificationEmail(verificationCode, verificationLang);

    if (useResend) {
        try {
            await resendRequest({
                from: resend.senderName
                    ? `${resend.senderName} <${resend.senderEmail}>`
                    : resend.senderEmail,
                to: [email],
                subject,
                html: htmlContent,
                text: plainText
            }, resend.apiKey);

            console.log('Mail sent via Resend to', email);
            event.reply('show-verify-modal');
            return;
        } catch (error) {
            console.error('Resend Send Error:', error);

            // Таймаут почти всегда значит, что провайдер режет api.resend.com,
            // поэтому renderer показывает плашку про VPN, а не обычную ошибку.
            if (isMailTimeout(error)) {
                verificationCode = null;
                event.reply('mail-vpn-required', describeResendError(error));
                return;
            }

            // Есть настроенный SMTP — пробуем его как резервный канал
            if (!mailer) {
                verificationCode = null;
                event.reply('server-error', describeResendError(error));
                return;
            }
            console.warn('Откат на SMTP после ошибки Resend');
        }
    }

    const mailOptions = {
        from: `"${config.senderName}" <${config.user}>`,
        to: email,
        subject,
        text: plainText,
        html: htmlContent
    };

    try {
        const info = await mailer.sendMail(mailOptions);
        console.log('Mail sent:', info.messageId, info.accepted);

        if (!info.accepted || info.accepted.length === 0) {
            verificationCode = null;
            event.reply('server-error', 'Почтовый сервер не принял адрес получателя.');
            return;
        }

        event.reply('show-verify-modal');
    } catch (error) {
        console.error('Mail Send Error:', error);
        verificationCode = null;
        event.reply('server-error', describeMailError(error));
    }
}

// --- РЕГИСТРАЦИЯ: ШАГ 1 ---
ipcMain.on('register-attempt', (event, userData) => {
    const data = getDatabaseContent();

    const loginExists = data.users.find(u => u.login === userData.login);
    if (loginExists) {
        return event.reply('register-fail-login', 'Данное имя уже занято');
    }

    const emailExists = data.users.find(u => u.email === userData.email);
    if (emailExists) {
        return event.reply('register-fail-email', 'Данная почта уже занята');
    }

    tempUserData = userData;
    sendVerificationMail(userData.email, event, userData.lang);
});

// --- ВОССТАНОВЛЕНИЕ: ШАГ 1 ---
ipcMain.on('forgot-password-attempt', (event, recoveryData) => {
    const data = getDatabaseContent();
    const user = data.users.find(
        u => u.login === recoveryData.login && u.email === recoveryData.email
    );

    if (!user) {
        return event.reply('forgot-fail', 'Пользователь с такими данными не найден');
    }

    tempUserData = user;
    sendVerificationMail(user.email, event, recoveryData.lang);
});

// --- ПРОВЕРКА КОДА ---
ipcMain.on('verify-code-check', (event, inputCode) => {
    if (!verificationCode) {
        return event.reply('verify-fail', 'Код истёк. Попробуйте ещё раз.');
    }

    if (Date.now() > verificationExpiresAt) {
        verificationCode = null;
        return event.reply('verify-fail', 'Срок действия кода истёк. Запросите новый.');
    }

    if (String(inputCode).trim() === verificationCode) {
        verificationCode = null;
        event.reply('verify-success');
    } else {
        event.reply('verify-fail', 'Неверный код подтверждения');
    }
});

ipcMain.on('resend-code', (event, lang) => {
    const target = verificationEmail || (tempUserData && tempUserData.email);

    if (!target) {
        return event.reply('server-error', 'Нет адреса для повторной отправки кода.');
    }

    sendVerificationMail(target, event, lang);
});

// --- СОХРАНЕНИЕ НОВОГО ПОЛЬЗОВАТЕЛЯ ---
ipcMain.on('final-register-save', (event) => {
    try {
        if (!tempUserData) {
            return event.reply('server-error', 'Нет данных для сохранения аккаунта.');
        }

        const data = getDatabaseContent();
        data.users.push(tempUserData);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');

        tempUserData = null;
        event.reply('operation-success', 'Аккаунт успешно создан!');
    } catch (error) {
        console.error(error);
        event.reply('server-error', 'Ошибка при сохранении аккаунта.');
    }
});

// --- ОБНОВЛЕНИЕ ПАРОЛЯ ---
ipcMain.on('final-password-update', (event, newPassword) => {
    try {
        if (!tempUserData) {
            return event.reply('server-error', 'Сессия восстановления устарела.');
        }

        const data = getDatabaseContent();
        const index = data.users.findIndex(u => u.login === tempUserData.login);

        if (index !== -1) {
            data.users[index].password = newPassword;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');

            tempUserData = null;
            event.reply('operation-success', 'Пароль был успешно изменен!');
        } else {
            event.reply('server-error', 'Пользователь не найден.');
        }
    } catch (error) {
        console.error(error);
        event.reply('server-error', 'Ошибка при смене пароля.');
    }
});

ipcMain.on('login-attempt', (event, authData) => {
    const data = getDatabaseContent();
    const user = data.users.find(
        u => u.login === authData.login && u.password === authData.password
    );

   if (user) {
    tempUserData = user;
    currentUserLogin = user.login;

    if (authData.remember !== false) saveSession(user.login);

    if (win) {
        win.unmaximize();
        win.center();

        win.loadFile('main.html', {
            query: { user: user.login }
        });
    }

    return;
}

    event.reply('login-fail', 'Неправильное имя пользователя или пароль');
});

// ========== СИСТЕМА ЗАДАНИЙ ==========
ipcMain.on('set-wallpaper', (event, imagePath) => {
    try {
        const wallpaper = require('wallpaper');
        const fullPath = path.join(__dirname, imagePath);
        wallpaper.set(fullPath);
    } catch (e) {
        console.error('Wallpaper error:', e);
    }
});

ipcMain.on('create-shortcuts', (event, shortcuts) => {
    try {
        const desktopPath = path.join(require('os').homedir(), 'Desktop');
        shortcuts.forEach(s => {
            const shortcutPath = path.join(desktopPath, `${s.name}.url`);
            fs.writeFileSync(shortcutPath, `[InternetShortcut]\nURL=${s.url}`, 'utf-8');
        });
    } catch (e) {
        console.error('Shortcuts error:', e);
    }
});

ipcMain.on('chaotic-theme', (event) => {
    try {
        const { exec } = require('child_process');
        exec('reg add "HKCU\\Control Panel\\Colors" /v Background /t REG_SZ /d "0 0 0" /f');
        exec('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM" /v AccentColor /t REG_DWORD /d 0xFF00B050 /f');
        exec('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\DWM" /v ColorPrevalence /t REG_DWORD /d 1 /f');
        exec('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v AppsUseLightTheme /t REG_DWORD /d 0 /f');
        exec('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v SystemUsesLightTheme /t REG_DWORD /d 0 /f');
        setTimeout(() => exec('taskkill /f /im explorer.exe && start explorer.exe'), 1000);
    } catch (e) {
        console.error('Theme error:', e);
    }
});

ipcMain.on('create-folders', (event, folders) => {
    try {
        folders.forEach(folder => {
            const folderPath = path.join('C:\\', folder);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        });
    } catch (e) {
        console.error('Folders error:', e);
    }
});

ipcMain.on('run-program', (event, programPath) => {
    try {
        const { exec } = require('child_process');
        exec(`"${programPath}"`, (err) => { if (err) console.error('Run error:', err); });
    } catch (e) {
        console.error('Run program error:', e);
    }
});

app.whenReady().then(() => {
    initDatabase();
    createMailConfigTemplate();
    createAiConfigTemplate();
    createWindow();
});

// Конфиг ИИ-чата: рендерер получает ключ из локального файла, а не из исходников
ipcMain.handle('get-ai-config', async () => {
    try {
        return readAiConfig();
    } catch (error) {
        console.error('get-ai-config error:', error);
        return null;
    }
});

// Open a separate camera window and provide created files
ipcMain.handle('open-camera', async (event, names = []) => {
    try {
        const os = require('os');
        const tempBase = path.join(app.getPath('temp'), 'eblox_camera');
        const desktopBase = path.join(os.homedir(), 'Desktop', 'eblox_camera_desktop');
        const bases = [tempBase, desktopBase];
        for (const b of bases) await fsp.mkdir(b, { recursive: true });

        const files = {};
        for (const n of names) {
            const fname = `${n}.txt`;
            const created = [];
            for (const b of bases) {
                try {
                    const full = path.join(b, fname);
                    await fsp.writeFile(full, `ebloX camera file: ${n}\n${new Date().toISOString()}`, 'utf-8');
                    created.push(full);
                } catch (e) {}
            }
            files[n] = created;
        }

        // create window
        const camWin = new BrowserWindow({
            width: 460,
            height: 360,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            resizable: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });
        camWin.loadFile('camera.html');
        camWin.once('ready-to-show', () => {
            camWin.show();
            camWin.webContents.send('camera-init', { files });
        });

        return { ok: true };
    } catch (err) {
        console.error('open-camera error', err);
        return { ok: false, error: String(err) };
    }
});

// Forward AI replies from camera window to main renderer
ipcMain.on('camera-ai-reply', (event, reply) => {
    if (win && win.webContents) win.webContents.send('ai-reply', reply);
});

ipcMain.handle('get-current-user', () => {
    if (currentUserLogin) return currentUserLogin;

    const session = readSession();
    if (session) currentUserLogin = session.login;

    return currentUserLogin || null;
});

ipcMain.on('logout', () => {
    clearSession();
    currentUserLogin = null;
    tempUserData = null;

    if (win) win.loadFile('index.html');
});

ipcMain.handle('load-settings', () => {
    try {
        if (!fs.existsSync(settingsPath)) return null;
        return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (error) {
        console.error('Ошибка чтения настроек:', error);
        return null;
    }
});

ipcMain.handle('save-settings', (event, settings) => {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings || {}, null, 4), 'utf-8');
        return { ok: true };
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        return { ok: false, error: String(error) };
    }
});

// Поиск файлов по именам с таймаутом и лимитом директорий
ipcMain.handle('find-files', async (event, names = [], timeoutMs = 6 * 60 * 1000, startDirs = []) => {
    try {
        const os = require('os');
        const start = Date.now();
        const results = {};
        names = Array.isArray(names) ? names : [];
        names.forEach(n => results[n] = null);

        const skipDirs = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)', 'AppData', 'Microsoft', 'ProgramData', 'Program Files (x86)']);

        // Start search from provided startDirs (nearby locations) or fallback to common locations
        const tempPath = path.join(app.getPath('temp'), 'eblox_camera');
        const desktopPath = path.join(os.homedir(), 'Desktop');
        let queue = Array.isArray(startDirs) && startDirs.length ? startDirs.slice() : [os.homedir(), tempPath, desktopPath];
        let visitedDirs = 0;
        const maxDirs = 2000;

        while (queue.length && (Date.now() - start) < timeoutMs && visitedDirs < maxDirs && Object.values(results).some(v => v === null)) {
            const dir = queue.shift();
            visitedDirs++;
            try {
                const entries = await fsp.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    try {
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            if (!skipDirs.has(entry.name)) queue.push(full);
                        } else if (entry.isFile()) {
                            const lower = entry.name.toLowerCase();
                            for (const n of names) {
                                if (results[n] == null && n && lower.includes(n.toString().toLowerCase())) {
                                    results[n] = full;
                                }
                            }
                        }
                    } catch (inner) {
                        // ignore per-file errors
                    }
                }
            } catch (e) {
                // ignore directories we cannot access
            }
        }

        return results;
    } catch (err) {
        console.error('find-files handler error', err);
        return {};
    }
});

// Создать набор файлов с заданными именами в временной папке приложения
ipcMain.handle('write-files', async (event, { names = [], targetDir } = {}) => {
    try {
        const tempBase = path.join(app.getPath('temp'), 'eblox_camera');
        const homeBase = path.join(app.getPath('home') || app.getPath('userData') || app.getPath('temp'), 'eblox_camera_home');
        const desktopBase = path.join(require('os').homedir(), 'Desktop', 'eblox_camera_desktop');
        const bases = [];
        if (targetDir) bases.push(path.resolve(targetDir));
        bases.push(tempBase, homeBase, desktopBase);
        // create all
        for (const b of bases) await fsp.mkdir(b, { recursive: true });

        const result = {};
        for (const n of names) {
            result[n] = [];
            const fname = `${n}.txt`;
            const content = `ebloX camera generated file: ${n}\nCreated: ${new Date().toISOString()}`;
            for (const b of bases) {
                try {
                    const full = path.join(b, fname);
                    await fsp.writeFile(full, content, 'utf-8');
                    result[n].push(full);
                } catch (e) {
                    // ignore per-location errors
                }
            }
        }
        return { ok: true, bases, files: result };
    } catch (err) {
        console.error('write-files error', err);
        return { ok: false, error: String(err) };
    }
});

// Сохранить изображение (dataUrl) как файл PNG
ipcMain.handle('save-image', async (event, { fileName, dataUrl, targetDir } = {}) => {
    try {
        const base = targetDir ? path.resolve(targetDir) : path.join(app.getPath('temp'), 'eblox_camera');
        await fsp.mkdir(base, { recursive: true });
        const matches = /^data:(image\/png);base64,(.+)$/i.exec(dataUrl);
        if (!matches) return { ok: false, error: 'Invalid dataUrl' };
        const buffer = Buffer.from(matches[2], 'base64');
        const full = path.join(base, fileName);
        await fsp.writeFile(full, buffer);
        return { ok: true, path: full };
    } catch (err) {
        console.error('save-image error', err);
        return { ok: false, error: String(err) };
    }
});

// Заглушка: отправить изображения в ИИ (симулирует запрос к удалённому API)
ipcMain.handle('send-to-ai', async (event, { images = [] } = {}) => {
    try {
        console.log('send-to-ai called with images:', images);
        // Здесь можно интегрировать реальный API. Пока возвратим имитацию ответа.
        return { ok: true, reply: 'ИИ получил изображения и дал ответ.' };
    } catch (err) {
        console.error('send-to-ai error', err);
        return { ok: false, error: String(err) };
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
