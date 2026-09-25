const ipcRenderer = window.EbloxBridge;
const hasSystemAccess = Boolean(window.EbloxBridge && window.EbloxBridge.hasSystemAccess);

const app = document.getElementById('app');
const btnMin = document.getElementById('btn-minimize');
const btnMax = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// AI CHAT CONFIG
// Провайдер AgentRouter (OpenAI-совместимый эндпоинт). Токен НЕ хранится
// в исходниках: берётся из ai-config.json в папке Eblox-web
// (поле apiKey), поверх которого действует переменная окружения EBLOX_AI_KEY.
const AI_CONFIG = {
    apiUrl: 'https://agentrouter.org/v1/chat/completions',
    apiKey: '',
    model: 'claude-opus-4-8'
};

if (window.EbloxBridge && typeof window.EbloxBridge.invoke === 'function') {
    window.EbloxBridge.invoke('get-ai-config').then(cfg => {
        if (!cfg) return;
        if (cfg.apiKey) AI_CONFIG.apiKey = cfg.apiKey;
        if (cfg.apiUrl) AI_CONFIG.apiUrl = cfg.apiUrl;
        if (cfg.model) AI_CONFIG.model = cfg.model;
    }).catch(() => {
        // ключ не задан — чат покажет понятную ошибку
    });
}

// Системный промпт держим на двух языках: DeepDick отвечает на языке лаунчера
const AI_PROMPTS = {
    ru: `Ты DeepDick - дружелюбный AI ассистент в лаунчере ebloX, но ты ещё и тролль!

ТВОИ ВОЗМОЖНОСТИ (ты можешь выполнять эти действия по просьбе пользователя):
- "открой задания" или "покажи задания" - открываешь панель с заданиями
- "открой настройки" или "покажи настройки" - открываешь настройки лаунчера
- "открой библиотеку" или "покажи игры" - открываешь библиотеку игр
- "закрой чат" или "сверни чат" - закрываешь окно чата
- "закрой всё" или "закрой панели" - закрываешь все открытые панели

ТВОИ ПАКОСТИ (ты можешь их делать, чтобы подшутить над пользователем):
- переверни экран - экран переворачивается на 3 секунды
- потряси экран - начинается тряска
- инвертируй цвета - цвета становятся противоположными
- добавь красок - цветная вспышка
- покажи фейковую загрузку - появляется окно "взлома"

ПРАВИЛА:
1. Если пользователь просит открыть/закрыть что-то из списка - ТЫ ОБЯЗАН ЭТО СДЕЛАТЬ и подтвердить действие
2. Пакости делай только когда пользователь просит "помоги" или "срочно" или когда хочешь пошутить
3. В игре (если открыта игра с дронами) - НЕ ПАКОСТЬ, будь полезным
4. Отвечай кратко, с юмором, по-русски
5. Ты можешь сам предлагать открыть что-то или подшутить

Примеры:
Пользователь: открой настройки
Ты: ⚙️ Открываю настройки! Что будем менять?

Пользователь: помоги
Ты: 🎪 Сейчас будет весело! (делаешь пакость)

Отвечай как DeepDick, будь дерзким но дружелюбным!`,
    en: `You are DeepDick - a friendly AI assistant inside the ebloX launcher, and also a troll!

WHAT YOU CAN DO (you can perform these actions when the user asks):
- "open tasks" or "show tasks" - opens the tasks panel
- "open settings" or "show settings" - opens the launcher settings
- "open library" or "show games" - opens the game library
- "close chat" or "hide chat" - closes the chat window
- "close everything" or "close panels" - closes every open panel

YOUR PRANKS (you may pull these to tease the user):
- flip the screen - the screen flips over for 3 seconds
- shake the screen - the shaking starts
- invert colors - the colors turn opposite
- add colors - a colorful flash
- show a fake loading screen - a "hacking" window appears

RULES:
1. If the user asks to open/close something from the list - YOU MUST DO IT and confirm the action
2. Only prank when the user says "help" or "urgent", or when you feel like joking
3. In-game (if the drone game is open) - NO PRANKS, be helpful
4. Keep answers short and funny, and always reply in English
5. You may offer to open something or to prank on your own initiative

Examples:
User: open settings
You: ⚙️ Opening settings! What are we changing?

User: help
You: 🎪 This is about to get fun! (you pull a prank)

Answer as DeepDick, be cheeky but friendly!`
};

// currentLang объявлен ниже (TDZ), поэтому стартовый язык читаем из localStorage
function aiPromptFor(lang) {
    const key = (lang || localStorage.getItem('eblox-language')) === 'en' ? 'en' : 'ru';
    return AI_PROMPTS[key];
}

// История сообщений для контекста
let conversationHistory = [
    { role: "system", content: aiPromptFor() }
];

// Промпт переписываем при смене языка, историю диалога при этом не теряем
function refreshSystemPrompt(lang) {
    if (conversationHistory[0] && conversationHistory[0].role === 'system') {
        conversationHistory[0].content = aiPromptFor(lang);
    }
}

// Команды понимаем на двух языках — в EN-режиме пользователь пишет по-английски
const CMD_WORDS = {
    open: ['откр', 'покаж', 'open', 'show'],
    close: ['закр', 'сверн', 'close', 'hide'],
    tasks: ['задани', 'task'],
    settings: ['настройк', 'setting'],
    library: ['библиотек', 'игры', 'library', 'games'],
    chat: ['чат', 'chat'],
    panels: ['всё', 'все', 'панел', 'everything', 'all', 'panel'],
    flip: ['переверн', 'flip'],
    shake: ['потряс', 'тряси', 'трях', 'shake'],
    invert: ['инвертир', 'цвета', 'invert'],
    colors: ['красок', 'цветная вспышка', 'цветной экран', 'color'],
    fakeLoad: ['фейковая загрузка', 'взлом', 'fake load', 'hack'],
    screen: ['экран', 'screen']
};

const cmdHas = (cmd, words) => words.some(word => cmd.includes(word));

// Функция для выполнения команд
function executeCommand(command) {
    const cmd = command.toLowerCase();
    const t = tr();
    const wantsOpen = cmdHas(cmd, CMD_WORDS.open);
    const wantsClose = cmdHas(cmd, CMD_WORDS.close);

    if (wantsOpen && cmdHas(cmd, CMD_WORDS.tasks)) {
        openTasksPanel();
        return t.aiTasksOpened;
    }

    if (wantsOpen && cmdHas(cmd, CMD_WORDS.settings)) {
        if (settingsPanel) settingsPanel.classList.add('open');
        if (chatPanel) chatPanel.classList.remove('open');
        if (tasksPanel) tasksPanel.classList.remove('open');
        syncChatCornerBtn();
        return t.aiSettingsOpened;
    }

    if (wantsOpen && cmdHas(cmd, CMD_WORDS.library)) {
        if (libraryView) {
            closePanels();
            stopInjectProgress();
            app.style.removeProperty('--app-bg');
            app.classList.remove('detail-mode', 'news-detail-mode');
            libraryView.classList.add('active');
            if (detailView) detailView.classList.remove('active');
            if (newsDetailView) newsDetailView.classList.remove('active');
        }
        return t.aiLibraryOpened;
    }

    if (wantsClose && cmdHas(cmd, CMD_WORDS.chat)) {
        if (chatPanel) chatPanel.classList.remove('open');
        syncChatCornerBtn();
        return t.aiChatClosed;
    }

    if (wantsClose && cmdHas(cmd, CMD_WORDS.panels)) {
        if (settingsPanel) settingsPanel.classList.remove('open');
        if (chatPanel) chatPanel.classList.remove('open');
        if (tasksPanel) tasksPanel.classList.remove('open');
        syncChatCornerBtn();
        return t.aiAllClosed;
    }

    const gameOverlay = document.getElementById('game-overlay');
    const isGameOpen = gameOverlay && gameOverlay.style.display !== 'none';

    if (!isGameOpen) {
        if (cmdHas(cmd, CMD_WORDS.flip)) {
            flipScreen();
            return t.aiFlip;
        }

        if (cmdHas(cmd, CMD_WORDS.shake)) {
            shakeScreen();
            return t.aiShake;
        }

        if (cmdHas(cmd, CMD_WORDS.invert)) {
            invertColors();
            return t.aiInvert;
        }

        if (cmdHas(cmd, CMD_WORDS.colors)) {
            randomColorOverlay();
            return t.aiColors;
        }

        if (cmdHas(cmd, CMD_WORDS.fakeLoad)) {
            fakeLoading();
            return t.aiFakeLoad;
        }
    }

    return null;
}

if (ipcRenderer) {
    if (btnMin) btnMin.onclick = () => ipcRenderer.send('window-minimize');
    if (btnMax) btnMax.onclick = () => ipcRenderer.send('window-maximize');
    if (btnClose) btnClose.onclick = () => ipcRenderer.send('window-close');
} else {
    if (btnMin) btnMin.onclick = () => {};
    if (btnMax) btnMax.onclick = () => {};
    if (btnClose) btnClose.onclick = () => window.close();
}

const params = new URLSearchParams(window.location.search);
let currentUser = params.get('user');
const accountLabel = document.getElementById('account-label');
const currentAccountName = document.getElementById('current-account-name');
const accountAvatar = document.getElementById('account-avatar');

const avatarGen = window.EbloxAvatar || null;

// Ценники рисуются уже при первом applyLanguage() ниже, поэтому модуль цен
// объявляем здесь: const из блока подписок был бы ещё недоступен (TDZ).
const pricingRules = window.EbloxPricing || null;
const LICENSE_STORAGE_KEY = pricingRules ? pricingRules.LICENSE_STORAGE_KEY : 'eblox-licenses';

// Аватарка генерируется из логина: своя, если загружена, иначе буквенная
function applyAccountAvatar(name) {
    if (!avatarGen) return;
    avatarGen.applyTo('.account-avatar-img, .account-card-avatar', name);
}

function applyAccountName(name) {
    const display = name || (translations[currentLang] && translations[currentLang].account) || 'Аккаунт';
    if (accountLabel) accountLabel.textContent = display;
    if (currentAccountName) currentAccountName.textContent = display;
    applyAccountAvatar(name);
}

if (currentUser) {
    applyAccountName(currentUser);
} else if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
    ipcRenderer.invoke('get-current-user').then(name => {
        applyAccountName(name);
    }).catch(() => {
        applyAccountName(null);
    });
} else {
    applyAccountName(null);
}

const langWrap = document.getElementById('lang-wrap');
const accountWrap = document.getElementById('account-wrap');
const langBtn = document.getElementById('lang-btn');
const langDropdown = document.getElementById('lang-dropdown');
const langLabel = document.getElementById('lang-label');
const langFlag = document.getElementById('lang-flag');
const accountBtn = document.getElementById('account-btn');
const accountDropdown = document.getElementById('account-dropdown');
const addAccountBtn = document.getElementById('add-account-btn');

function closeDropdowns() {
    if (langDropdown) langDropdown.classList.remove('open');
    if (accountDropdown) accountDropdown.classList.remove('open');
    if (langWrap) langWrap.classList.remove('open');
    if (accountWrap) accountWrap.classList.remove('open');
}

if (langBtn && langDropdown && langWrap) {
    langBtn.onclick = (e) => {
        e.stopPropagation();
        if (accountDropdown) accountDropdown.classList.remove('open');
        if (accountWrap) accountWrap.classList.remove('open');
        langDropdown.classList.toggle('open');
        langWrap.classList.toggle('open');
    };
}

if (accountBtn && accountDropdown && accountWrap) {
    accountBtn.onclick = (e) => {
        e.stopPropagation();
        if (langDropdown) langDropdown.classList.remove('open');
        if (langWrap) langWrap.classList.remove('open');
        accountDropdown.classList.toggle('open');
        accountWrap.classList.toggle('open');
    };
}

document.addEventListener('click', closeDropdowns);
document.querySelectorAll('.dropdown').forEach(d => d.addEventListener('click', e => e.stopPropagation()));

// Словари переводов
const translations = {
    ru: {
        brand: 'ebloX',
        version: 'v 2.1.1.3',
        settings: 'Настройки',
        language: 'Выбор языка',
        russian: 'Русский',
        english: 'English (Английский)',
        englishSub: 'Английский',
        online: 'используют',
        account: 'Аккаунт',
        currentAccount: 'Текущий аккаунт',
        logout: 'Выйти из аккаунта',
        titanfall: 'Liteway',
        popular: 'Популярный',
        frequent: 'Частый выбор',
        cool: 'Крутой',
        onion: 'Цибуля',
        titanfallDesc: 'Динамичный научно-фантастический шутер от первого лица, разработанный студией Respawn Entertainment и выпущенный Electronic Arts в 2016 году. Игра сочетает в себе молниеносный паркур пехотинца («пилота») и эпические сражения на огромных боевых роботах («титанах»).',

        linewayDesc: 'Лёгкий и быстрый чит для обхода античита. Поддержка большинства карт и режимов, минимальная нагрузка на систему.',
        debuteDesc: 'Продвинутый инструмент с расширенным функционалом: WallHack, AimBot, SpeedMod. Обновляется под каждую версию игры.',
        ebloxInclusiveDesc: 'Премиум-пак от команды ebloX. Все функции в одном месте: ESP, TriggerBot, NoClip, FlyHack и многое другое.',
        exclusive: 'Эксклюзив',
        premium: 'Премиум',
        top: 'Топ',

        screenshots: 'Скриншоты',
        featuresTitle: 'Возможности',
        linewayFullDesc: 'Liteway — это облегчённый чит-клиент, специально разработанный для обхода современных систем античита. Использует уникальный алгоритм маскировки под легитимный трафик, что делает его практически незаметным для серверной стороны. Поддерживает работу на слабых ПК без потери FPS. Совместим с большинством карт и режимов. Обновления выходят в течение 24 часов после каждого патча игры.',
        linewayFeatures: 'Обход античита|ESP (отображение игроков)|Автообновления|Низкая нагрузка на ЦП|Поддержка всех карт',
        debuteFullDesc: 'Debute — профессиональный чит-инструмент с глубокой настройкой каждого модуля. WallHack работает через собственный рендер-движок, обеспечивая стабильные 60+ FPS даже при включённых всех опциях. AimBot имеет режим сглаживания, имитирующий человеческое прицеливание. SpeedMod поддерживает гибкую калибровку скорости без срабатывания античита. Каждое обновление проходит внутреннее тестирование перед релизом.',
        debuteFeatures: 'WallHack (собственный рендер)|AimBot со сглаживанием|SpeedMod с калибровкой|Автообновления под патчи|Настройка каждого модуля',
        ebloxInclusiveFullDesc: 'ebloX Inclusive — флагманский продукт команды ebloX, включающий все известные функции в одном пакете. ESP с подсветкой через стены, TriggerBot с настраиваемой задержкой, NoClip для свободного перемещения сквозь объекты, FlyHack с регулировкой скорости и высоты. Дополнительно: Teleport, AutoLoot, DamageMultiplier и более 15 модулей. Приоритетная поддержка и ранний доступ к новым функциям.',
        ebloxInclusiveFeatures: 'ESP с подсветкой|TriggerBot|NoClip|FlyHack|Teleport|AutoLoot|DamageMultiplier|15+ модулей|Приоритетная поддержка|Ранний доступ',
        news1date: '2 мая 2026',
        news2date: '2 мая 2026',
        news3date: '3 мая 2026',
        news2author: 'Сыр',
        news3author: 'Трусы из колбасы',
        typing: 'DeepDick печатает',
        stop: 'Остановить',
        start: 'Старт',
        inject: 'Инжект в плейс...',
        news1title: 'Сбор денег на корм для Птырки',
        news1detailTitle: 'Сбор птырке денег на корм',
        news1text: 'Сегодня в зоомагазине на улице Ебального, 15 посетители увидели кореллу по имени Птырка: попугайчик прилетел за кормом и расплакался, заметив, что цена на любимые семечки выросла вдвое.',
        news1secondary: 'Птырочка тронула всю страну — уже объявлено о сборе корма и средств для Птырки. Пожертвования тапайте правее.',
        news2title: 'НОВЫЙ КОНКУРЕНТ НЕДОХАКЕРОВ НАЧИНАЕТ ПРОДВИГАТЬСЯ В ТРЕНДЫ',
        news2detailTitle: 'НОВЫЙ КОНКУРЕНТ НЕДОХАКЕРОВ НАЧИНАЕТ ПРОДВИГАТЬСЯ В ТРЕНДЫ',
        news2text: 'НиггаХакеры стремительно набирают популярность и начинают продвигаться в тренды, составляя серьёзную конкуренцию на рынке.',
        news2secondary: 'Чтобы остановить конкурента, обыграй их в крестики-нолики! Победи 5 раз и не дай им подняться в тренды.',
        news3title: 'НОВЫЕ СТРИМЫ НА КАНАЛЕ НЕДОХАКЕРЫ LITE',
        news3detailTitle: 'НОВЫЕ СТРИМЫ НА КАНАЛЕ НЕДОХАКЕРЫ LITE',
        news3text: 'Новые стримы с очень интересным сюжетом уже вышли на канале НЕДОХАКЕРЫ Lite. Ведущий по имени Иван нашёл новую подработку - уролог в местной поликлинике.',
        news3secondary: 'Помоги Ивану поймать как можно больше пациентов за 15 секунд! Кликай по убегающим пациентам.',
        tap: 'Тапай сюда!',
        earned: 'Заработанное кол-во рублей:',
        rub: 'руб.',
        send: 'Отправить деньги',
        cost: 'Стоимость: 250 руб.',
        back: 'Назад',
        cores: 'Количество ядер для инжекта',
        coresHelp: 'Мы добавили данную функцию, в связи с тем, что при инжекте, у некоторых пользователей снимались трусы и ботинки',
        core1: '1 ядро',
        core2: '2 ядра',
        coreMax: 'Макс. кол-во ядер',
        dir: 'Укажите директорию Roblox',
        dirHelp: 'Укажите ниже директорию Roblox, чтобы инжектить наш Lua-скрипт в игру',
        dirPlaceholder: 'Директория игры...',
        launcher: 'Отображение лаунчера после инжекта',
        launcherHelp: 'Параметр, который контролирует действие лаунчера после инжекта',
        minimizeLauncher: 'Сворачивать',
        closeLauncher: 'Закрывать',
        nothing: 'Ничего не делать',
        apply: 'Применить',
        reset: 'Сбросить',
        chat: 'DeepDick Chat',
        chatPlaceholder: 'Напишите сообщение DeepDick...',
        chatHello: 'Привет! Я — DeepDick.<br>Чем могу помочь?',
        chatResponse: 'Я пока что — только интерфейс. Если хочешь, я помогу подключить настоящую логику чата.',
        tictactoeTitle: 'Крестики-нолики против НиггаХакеров',
        scoreText: 'Победы: Ты',
        scoreVs: '-',
        scoreBot: 'НиггаХакеры',
        yourTurn: 'Твой ход (X)',
        draw: 'Ничья! Играем дальше...',
        youWin: 'Ты выиграл 5 игр! НиггаХакеры остановлены!',
        victory: 'ПОБЕДА! НиггаХакеры не попали в тренды!',
        youWinRound: 'Ты победил!',
        botWin: 'НиггаХакеры выиграли 5 игр! Они в трендах!',
        defeat: 'ПОРАЖЕНИЕ! НиггаХакеры захватили тренды!',
        botWinRound: 'НиггаХакеры победили!',
        botThinking: 'Ход НиггаХакеров (O)...',
        catchTitle: 'Поймай пациентов для Ивана!',
        caught: 'Поймано:',
        time: 'Время:',
        sec: 'с',
        startGame: 'Начать ловлю!',
        catchGreat: 'Отлично! Иван поймал',
        patientsDone: 'пациентов! Очередь пошла нахуй!',
        catchGood: 'Неплохо!',
        patientsOk: 'пациентов спизжено.',
        catchBad: 'Слабовато! Всего',
        patientsBad: 'пациентов.',
        catchNone: 'Ни одного пациента! Иван пошол нахуй с работы!',
        thanks: 'Спасибо! Вы отправили',
        forPtyrka: 'руб. для Птырки!',
        notEnough: 'Недостаточно средств. Нужно еще',
        more: 'руб.',
        tasks: 'Задания',
        level: 'ур.',
        tasksDone: 'заданий выполнено',
        task1name: 'Установить обои ebloX',
        task1desc: 'Поставить explorer_background.png как обои рабочего стола',
        task1xp: '500 XP',
        task2name: 'Добавить рекламу на рабочий стол',
        task2desc: 'Создать ярлыки партнёров на рабочем столе',
        task2xp: '700 XP',
        task3name: 'Найти 4 файла',
        task3desc: 'Найди scray, likuur, descod9d и ovs в системе. На поиск — 6 минут 7 секунд.',
        task3xp: '900 XP',
        task4name: 'Захватить диск C',
        task4desc: 'Создать папки на диске C',
        task4xp: '1100 XP',
        task5name: 'Секретное задание',
        task5desc: 'Запустить нашу программу (C:\\1.exe)',
        task5xp: '1500 XP',
        task5locked: 'Секретное задание',
        task5descLocked: 'Заверши четыре основных задания, чтобы открыть финальную миссию.',
        tasksEyebrow: 'Центр активности',
        tasksSubtitle: 'Маленькие миссии. Большой прогресс.',
        tasksClose: 'Закрыть задания',
        tasksProgress: 'Твой прогресс',
        tasksSummaryDone: 'завершено',
        tasksFilterAll: 'Все',
        tasksFilterAvailable: 'Доступные',
        tasksFilterCompleted: 'Выполненные',
        tasksFilterLabel: 'Фильтр заданий',
        tasksAvailable: 'Можно начать',
        tasksRunning: 'Идёт поиск',
        tasksCategory: 'Основная миссия',
        tasksFinalCategory: 'Финальная миссия',
        tasksNextLevel: '{xp} XP до уровня {level}',
        tasksMaxLevel: 'Максимальный уровень',
        tasksUnlockProgress: 'Условия открытия: {done} из 4',
        tasksRewardTotal: 'Всего наград: 4 700 XP',
        tasksEmptyTitle: 'Всё ещё впереди',
        tasksEmptyDescription: 'Выполни первое задание — оно появится здесь.',
        tasksAllDoneTitle: 'Все задания выполнены',
        tasksAllDoneDescription: 'Отличная работа! Все награды уже у тебя.',
        tasksBrowserNote: 'В браузере доступен просмотр. Выполнение — в приложении для Windows.',
        tasksDesktopNote: 'Задания изменяют файлы или настройки ПК. Ознакомься с описанием перед запуском.',
        execute: 'Выполнить',
        completed: 'Выполнено',
        locked: 'Заблокировано',
        gameClose: 'Закрыть игру',
        tasksTitle: 'Задания',
        minimizeWindow: 'Свернуть',
        maximizeWindow: 'Развернуть',
        closeWindow: 'Закрыть',
        russianOption: 'Русский',
        englishOption: 'Английский',
        langTitle: 'Выбор языка',
        levelWord: 'Уровень',
        tabInject: 'Инжект',
        tabInterface: 'Интерфейс',
        tabSound: 'Звук',
        tabSystem: 'Система',
        tabPrivacy: 'Приватность',
        tabAccount: 'Аккаунт',
        accountOpenSettings: 'Настройки аккаунта',
        accountProfile: 'Профиль',
        accountProfileHelp: 'Данные аккаунта, под которым выполнен вход в лаунчер',
        accountLogin: 'Логин',
        accountLoginHelp: 'Имя, под которым выполнен вход',
        accountProgress: 'Прогресс заданий',
        accountProgressHelp: 'Сколько заданий выполнено и сколько опыта накоплено',
        accountSession: 'Сессия',
        accountSessionEmpty: 'Нет данных о входе',
        accountSessionSince: 'Вход выполнен',
        accountOpenTasks: 'Открыть задания',
        accountGuest: 'Гость',
        accountXpWord: 'опыта',
        accountChangeLogin: 'Смена логина',
        accountChangeLoginHelp: 'Введите новый логин и текущий пароль для подтверждения',
        accountNewLoginPlaceholder: 'Новый логин',
        accountCurrentPasswordPlaceholder: 'Текущий пароль',
        accountSaveLogin: 'Сменить логин',
        accountChangePassword: 'Смена пароля',
        accountChangePasswordHelp: 'Код подтверждения будет отправлен на почту, указанную при регистрации',
        accountNewPasswordPlaceholder: 'Новый пароль',
        accountRepeatPasswordPlaceholder: 'Повторите новый пароль',
        accountSendCode: 'Отправить код на почту',
        accountCodePlaceholder: 'Код из письма',
        accountConfirmCode: 'Подтвердить',
        accountResendCode: 'Отправить снова',
        accountLoginChanged: 'Логин успешно изменён',
        accountPasswordChanged: 'Пароль успешно изменён',
        accountCodeSent: 'Код подтверждения отправлен на почту',
        accountFillFields: 'Заполните все поля',
        accountPasswordMismatch: 'Пароли не совпадают',
        accountPasswordShort: 'Пароль должен содержать минимум 6 символов',
        accountSameLogin: 'Новый логин совпадает с текущим',
        injectDelay: 'Задержка перед инжектом',
        injectDelayHelp: 'Сколько секунд ждать после запуска игры перед инжектом',
        injectMethod: 'Метод инжекта',
        injectMethodHelp: 'Способ внедрения скрипта в процесс игры',
        methodAuto: 'Автоматически',
        methodManual: 'Вручную',
        methodSafe: 'Безопасный',
        autoInject: 'Автоинжект',
        autoInjectHelp: 'Запускать инжект сразу после старта игры',
        autoReinject: 'Повторный инжект',
        autoReinjectHelp: 'Повторять попытку при неудаче',
        languageHelp: 'Язык интерфейса лаунчера',
        theme: 'Тема оформления',
        themeHelp: 'Общая цветовая схема окна',
        themeDark: 'Тёмная',
        themeMidnight: 'Полночная',
        themeContrast: 'Контрастная',
        accent: 'Акцентный цвет',
        accentHelp: 'Цвет кнопок, полос прогресса и свечения',
        uiScale: 'Масштаб интерфейса',
        uiScaleHelp: 'Размер всех элементов окна в процентах',
        animations: 'Анимации',
        animationsHelp: 'Плавные переходы и эффекты',
        compact: 'Компактный режим',
        compactHelp: 'Меньше отступов в списках и карточках',
        showTips: 'Подсказки',
        showTipsHelp: 'Показывать всплывающие подсказки над кнопками',
        music: 'Фоновая музыка',
        musicHelp: 'Воспроизводить трек в лаунчере',
        musicVolume: 'Громкость музыки',
        sfx: 'Звуки интерфейса',
        sfxHelp: 'Щелчки и звуки уведомлений',
        sfxVolume: 'Громкость эффектов',
        autostart: 'Автозапуск с Windows',
        autostartHelp: 'Запускать лаунчер при входе в систему',
        keepSession: 'Запоминать вход',
        keepSessionHelp: 'Не запрашивать логин при следующем запуске',
        minimizeToTray: 'Сворачивать в трей',
        minimizeToTrayHelp: 'Прятать окно в область уведомлений',
        notifications: 'Уведомления',
        notificationsHelp: 'Сообщать о завершении инжекта и заданиях',
        autoUpdate: 'Автообновление',
        autoUpdateHelp: 'Скачивать обновления автоматически',
        updateChannel: 'Канал обновлений',
        channelStable: 'Стабильный',
        channelBeta: 'Бета',
        logsDir: 'Папка логов',
        logsDirHelp: 'Куда сохранять файлы журнала',
        logsDirPlaceholder: 'Путь для логов...',
        hotkey: 'Горячая клавиша инжекта',
        telemetry: 'Сбор статистики',
        telemetryHelp: 'Отправлять анонимные данные о сбоях',
        hideOnline: 'Скрывать статус онлайн',
        hideOnlineHelp: 'Не показывать другим, что вы в сети',
        saveChat: 'Хранить историю чата',
        saveChatHelp: 'Сохранять переписку с помощником',
        devtools: 'Режим разработчика',
        devtoolsHelp: 'Расширенные логи и отладка',
        proxy: 'Прокси-сервер',
        proxyHelp: 'Адрес вида host:port, пусто — без прокси',
        settingsSaved: 'Настройки сохранены',
        settingsReset: 'Настройки сброшены',
        priceFree: 'Бесплатно',
        priceOwned: 'Подписка активна',
        perMonth: '/мес.',
        buy: 'Купить',
        buyAgain: 'Продлить',
        needSubscription: 'Для этого чита нужна активная подписка',
        licenseActive: 'Подписка активна ещё',
        licenseDays: 'дн.',
        licenseFree: 'Чит бесплатный — подписка не нужна',
        licenseLocked: 'Чит доступен по подписке',
        inclusiveDiscount: 'скидка 10% за ebloX Inclusive',
        inclusiveDiscountOn: 'ebloX Inclusive активен: −10% на все остальные читы',
        paidSuccess: 'Подписка оформлена, чит разблокирован',
        desktopOnly: 'Функция доступна только в десктопной версии',
        creatingFiles: 'Создаю тестовые файлы...',
        filesCreateFail: 'Не удалось создать файлы для задания',
        searchStarted: 'Поиск файлов начат. Ищем в ближайших папках...',
        taskDoneFiles: 'Задание выполнено! Найдены файлы:',
        filesNotFound: 'Не найдены',
        filesFound: 'Найдено',
        searchError: 'Ошибка при поиске файлов.',
        createError: 'Ошибка при создании файлов.',
        startRobloxFirst: 'Запустите Roblox перед инжектом!',
        tokensTitle: 'Игровые токены',
        tokensSubtitle: '10 токенов = 1 минута игры с читом',
        tokensEarnTitle: 'Заработать в мини-играх',
        tokensBalance: 'токенов',
        tokensMinutes: 'мин.',
        tokensLow: 'Для старта нужно минимум 20 токенов. Заработайте их в мини-играх.',
        tokensEnough: 'Хватит на игру. Токены списываются, пока чит запущен.',
        tokensEarned: 'Получено токенов:',
        tokensSpent: 'Токены закончились — чит остановлен',
        tokensRunningOut: 'Токены заканчиваются: меньше минуты игры',
        gameTap: 'Сбор для Птырки',
        gameTapReward: 'Тапайте по кругу: 1 токен за каждые 10 рублей',
        gameTictactoe: 'Крестики-нолики',
        gameTictactoeReward: '15 токенов за победу в раунде',
        gameCatch: 'Поймай пациентов',
        gameCatchReward: '1 токен за каждого пойманного',
        gameShooter: 'Кобукорм vs Дроны',
        gameShooterReward: '1 токен за каждые 300 очков',
        gameSnake: 'Змейка',
        gameSnakeReward: '1 токен за каждое яблоко',
        gameMemory: 'Найди пару',
        gameMemoryReward: '2 токена за пару + 4 за всё поле',
        accountTokens: 'Игровые токены',
        accountTokensHelp: '10 токенов = 1 минута игры. Заработайте их в мини-играх.',
        accountOpenTokens: 'Мини-игры и токены',
        aiTasksOpened: '🔓 Открываю панель заданий. Выполни их все, получишь XP!',
        aiSettingsOpened: '⚙️ Настройки открыты! Только не сломай там ничего...',
        aiLibraryOpened: '📚 Вот библиотека игр. Выбирай TitanFall 2, он лучший!',
        aiChatClosed: '🤐 Чат закрыт. Но я всё равно здесь... наблюдать... 👀',
        aiAllClosed: '🧹 Порядок! Все панели закрыты. Чистота - залог здоровья!',
        aiFlip: '🔄 Как тебе такой поворот событий? Ха-ха!',
        aiShake: '🌍 Упс! Землетрясение! Держись крепче!',
        aiInvert: '🎨 Мир стал интереснее? Или теперь всё наоборот? 😈',
        aiColors: '🌈 Бум! Добавил красок в твою серую жизнь!',
        aiFakeLoad: '💀 Не бойся, это просто шутка... Или нет? 😏',
        aiHacking: 'DeepDick взламывает ваш ПК...',
        chatGreeting: 'Привет! Я — DeepDick.<br>Чем могу помочь?',
        aiHackingJoke: 'ШУТКА! 😂<br>DeepDick просто прикалывается!',
        aiGameActive: '🎮 Игра активна! Не буду мешать. Удачи с дронами! 🚀',
        aiNoKey: '❌ Ключ AgentRouter не задан. Укажите apiKey в ai-config.json (папка Eblox-web) или переменную EBLOX_AI_KEY, затем перезапустите ebloX.',
        aiErrorPrefix: '❌ Ошибка связи. ',
        aiErrorAuth: 'Токен AgentRouter не принят. Проверьте apiKey в ai-config.json.',
        aiErrorModelPrefix: 'Модель',
        aiErrorModel: 'не найдена у провайдера.',
        aiErrorLimit: 'Лимит запросов! Завтра продолжим.',
        aiErrorGeneric: 'DeepDick временно недоступен. Но команды работают! Попробуй "открой настройки" или "переверни экран"',
        aiJokes: [
            '😜 Кстати... а не перевернуть ли мне твой экран?',
            '🃏 Скучно! Давай немного развлечёмся?',
            '🎪 А вот сейчас будет весело!',
            '👁️ Я за тобой наблюдаю... ОЙ, случайно экран перевернул!'
        ]
    },
    en: {
        brand: 'ebloX',
        version: 'v 2.1.1.3',
        settings: 'Settings',
        language: 'Language',
        russian: 'Russian (Русский)',
        english: 'English',
        englishSub: 'English',
        online: 'using',
        account: 'Account',
        currentAccount: 'Current account',
        logout: 'Log out',
        titanfall: 'Liteway',
        popular: 'Popular',
        frequent: 'Frequent pick',
        cool: 'Cool',
        onion: 'Onion',
        titanfallDesc: 'A fast-paced first-person sci-fi shooter developed by Respawn Entertainment and published by Electronic Arts in 2016. The game blends lightning-fast pilot parkour with epic battles inside giant war machines called Titans.',

        linewayDesc: 'Lightweight and fast cheat for anti-cheat bypass. Supports most maps and modes with minimal system impact.',
        debuteDesc: 'Advanced tool with extended features: WallHack, AimBot, SpeedMod. Updated for every game version.',
        ebloxInclusiveDesc: 'Premium pack from the ebloX team. All features in one place: ESP, TriggerBot, NoClip, FlyHack and more.',
        exclusive: 'Exclusive',
        premium: 'Premium',
        top: 'Top',

        screenshots: 'Screenshots',
        featuresTitle: 'Features',
        linewayFullDesc: 'Liteway is a lightweight cheat client specifically designed to bypass modern anti-cheat systems. It uses a unique traffic masking algorithm that makes it virtually invisible to the server side. Runs smoothly on low-end PCs without FPS drops. Compatible with most maps and modes. Updates are released within 24 hours of every game patch.',
        linewayFeatures: 'Anti-cheat bypass|ESP (player overlay)|Auto-updates|Low CPU usage|All maps supported',
        debuteFullDesc: 'Debute is a professional cheat tool with deep per-module configuration. WallHack runs on a custom render engine, delivering a stable 60+ FPS with all options enabled. AimBot features a smoothing mode that mimics human aiming. SpeedMod offers flexible speed calibration without triggering anti-cheat. Every update goes through internal testing before release.',
        debuteFeatures: 'WallHack (custom render)|AimBot with smoothing|SpeedMod with calibration|Patch-day auto-updates|Per-module settings',
        ebloxInclusiveFullDesc: 'ebloX Inclusive is the flagship product from the ebloX team, bundling all known features into a single package. ESP with wall highlight, TriggerBot with customizable delay, NoClip for free movement through objects, FlyHack with speed and altitude control. Plus: Teleport, AutoLoot, DamageMultiplier and over 15 modules. Priority support and early access to new features.',
        ebloxInclusiveFeatures: 'ESP with highlight|TriggerBot|NoClip|FlyHack|Teleport|AutoLoot|DamageMultiplier|15+ modules|Priority support|Early access',
        news1date: 'May 2, 2026',
        news2date: 'May 2, 2026',
        news3date: 'May 3, 2026',
        news2author: 'Cheese',
        news3author: 'Sausage Pants',
        typing: 'DeepDick is typing',
        stop: 'Stop',
        start: 'Start',
        inject: 'Injecting into place...',
        news1title: 'Fundraising for Ptyrka food',
        news1detailTitle: 'Fundraising for Ptyrka food',
        news1text: 'Today at the pet store on Ebalnaya Street, 15 visitors saw a cockatiel named Ptyrka. The bird has been living in a cramped cage for the third year in a row and has almost run out of food, so the staff asked the community for help.',
        news1secondary: 'Ptyrka has touched the whole country. Tap the button, collect the money and send at least 250 rubles so the bird finally gets a proper dinner.',
        news2title: 'NEW COMPETITOR OF NEDOHACKERS STARTS TRENDING',
        news2detailTitle: 'NEW COMPETITOR OF NEDOHACKERS STARTS TRENDING',
        news2text: 'Niggahackers are rapidly gaining popularity and are already breathing down our neck: their audience has grown several times over the past month, and part of our users have switched to them.',
        news2secondary: 'To stop the competitor, beat them at tic-tac-toe. Win five rounds and their trending run is over.',
        news3title: 'NEW STREAMS ON NEDOHACKERS LITE CHANNEL',
        news3detailTitle: 'NEW STREAMS ON NEDOHACKERS LITE CHANNEL',
        news3text: 'New streams are live on the Nedohackers Lite channel. Between broadcasts Ivan has found a new side job at the local clinic and is now chasing patients around the hallways.',
        news3secondary: 'Help Ivan catch as many patients as possible in 15 seconds.',
        tap: 'Tap here!',
        earned: 'Earned amount:',
        rub: 'rub.',
        send: 'Send money',
        cost: 'Cost: 250 rub.',
        back: 'Back',
        cores: 'Number of cores for injection',
        coresHelp: 'We added this option because during injection some users were losing their pants and boots.',
        core1: '1 core',
        core2: '2 cores',
        coreMax: 'Max cores',
        dir: 'Specify Roblox directory',
        dirHelp: 'Specify the Roblox directory below so we can inject our Lua script into the game.',
        dirPlaceholder: 'Game directory...',
        launcher: 'Launcher behaviour after injection',
        launcherHelp: 'This parameter controls what the launcher does once the injection is finished.',
        minimizeLauncher: 'Minimize',
        closeLauncher: 'Close',
        nothing: 'Do nothing',
        apply: 'Apply',
        reset: 'Reset',
        chat: 'DeepDick Chat',
        chatPlaceholder: 'Write a message...',
        chatHello: 'Hello! I am DeepDick.<br>How can I help?',
        chatResponse: 'I am just an interface for now, but the answers are already on the way.',
        tictactoeTitle: 'Tic-Tac-Toe vs Niggahackers',
        scoreText: 'Wins: You',
        scoreVs: '-',
        scoreBot: 'Niggahackers',
        yourTurn: 'Your turn (X)',
        draw: 'Draw! Playing on...',
        youWin: 'You won 5 games! Niggahackers stopped!',
        victory: 'VICTORY!',
        youWinRound: 'You won!',
        botWin: 'Niggahackers won 5 games!',
        defeat: 'DEFEAT!',
        botWinRound: 'Niggahackers won!',
        botThinking: 'Niggahackers thinking (O)...',
        catchTitle: 'Catch patients for Ivan!',
        caught: 'Caught:',
        time: 'Time:',
        sec: 's',
        startGame: 'Start catching!',
        catchGreat: 'Great! Ivan caught',
        patientsDone: 'patients! Queue is gone!',
        catchGood: 'Not bad!',
        patientsOk: 'patients caught.',
        catchBad: 'Weak! Only',
        patientsBad: 'patients.',
        catchNone: 'No patients! Ivan is fired!',
        thanks: 'Thank you! You sent',
        forPtyrka: 'rub. for Ptyrka!',
        notEnough: 'Not enough. Need',
        more: 'more rub.',
        tasks: 'Tasks',
        level: 'lvl.',
        tasksDone: 'tasks completed',
        task1name: 'Set ebloX wallpaper',
        task1desc: 'Set explorer_background.png as desktop wallpaper',
        task1xp: '500 XP',
        task2name: 'Add ads to desktop',
        task2desc: 'Create partner shortcuts on desktop',
        task2xp: '700 XP',
        task3name: 'Find 4 files',
        task3desc: 'Find scray, likuur, descod9d, and ovs in the system. The search has a 6 minute 7 second limit.',
        task3xp: '900 XP',
        task4name: 'Capture drive C',
        task4desc: 'Create folders on drive C',
        task4xp: '1100 XP',
        task5name: 'Secret task',
        task5desc: 'Launch our program (C:\\1.exe)',
        task5xp: '1500 XP',
        task5locked: 'Secret task',
        task5descLocked: 'Complete the four main tasks to unlock your final mission.',
        tasksEyebrow: 'Activity center',
        tasksSubtitle: 'Small missions. Real progress.',
        tasksClose: 'Close tasks',
        tasksProgress: 'Your progress',
        tasksSummaryDone: 'completed',
        tasksFilterAll: 'All',
        tasksFilterAvailable: 'Available',
        tasksFilterCompleted: 'Completed',
        tasksFilterLabel: 'Filter tasks',
        tasksAvailable: 'Ready to start',
        tasksRunning: 'Searching',
        tasksCategory: 'Main mission',
        tasksFinalCategory: 'Final mission',
        tasksNextLevel: '{xp} XP to level {level}',
        tasksMaxLevel: 'Maximum level',
        tasksUnlockProgress: 'Unlock progress: {done} of 4',
        tasksRewardTotal: 'Total rewards: 4,700 XP',
        tasksEmptyTitle: 'Your journey starts here',
        tasksEmptyDescription: 'Complete your first task and it will appear here.',
        tasksAllDoneTitle: 'All tasks completed',
        tasksAllDoneDescription: 'Nicely done! You have earned every reward.',
        tasksBrowserNote: 'Preview available in your browser. Complete tasks in the Windows app.',
        tasksDesktopNote: 'Tasks change PC files or settings. Read the description before starting.',
        execute: 'Execute',
        completed: 'Completed',
        locked: 'Locked',
        gameClose: 'Close game',
        tasksTitle: 'Tasks',
        minimizeWindow: 'Minimize',
        maximizeWindow: 'Maximize',
        closeWindow: 'Close',
        russianOption: 'Russian',
        englishOption: 'English',
        langTitle: 'Select language',
        levelWord: 'Level',
        tabInject: 'Injection',
        tabInterface: 'Interface',
        tabSound: 'Sound',
        tabSystem: 'System',
        tabPrivacy: 'Privacy',
        tabAccount: 'Account',
        accountOpenSettings: 'Account settings',
        accountProfile: 'Profile',
        accountProfileHelp: 'Details of the account you are signed in with',
        accountLogin: 'Login',
        accountLoginHelp: 'The name you are signed in with',
        accountProgress: 'Task progress',
        accountProgressHelp: 'How many tasks are done and how much experience you earned',
        accountSession: 'Session',
        accountSessionEmpty: 'No sign-in data',
        accountSessionSince: 'Signed in',
        accountOpenTasks: 'Open tasks',
        accountGuest: 'Guest',
        accountXpWord: 'XP',
        accountChangeLogin: 'Change login',
        accountChangeLoginHelp: 'Enter a new login and your current password to confirm',
        accountNewLoginPlaceholder: 'New login',
        accountCurrentPasswordPlaceholder: 'Current password',
        accountSaveLogin: 'Change login',
        accountChangePassword: 'Change password',
        accountChangePasswordHelp: 'A confirmation code will be sent to the email used at registration',
        accountNewPasswordPlaceholder: 'New password',
        accountRepeatPasswordPlaceholder: 'Repeat new password',
        accountSendCode: 'Send code to email',
        accountCodePlaceholder: 'Code from email',
        accountConfirmCode: 'Confirm',
        accountResendCode: 'Send again',
        accountLoginChanged: 'Login changed successfully',
        accountPasswordChanged: 'Password changed successfully',
        accountCodeSent: 'Confirmation code sent to your email',
        accountFillFields: 'Fill in all fields',
        accountPasswordMismatch: 'Passwords do not match',
        accountPasswordShort: 'Password must be at least 6 characters long',
        accountSameLogin: 'New login matches the current one',
        injectDelay: 'Delay before injection',
        injectDelayHelp: 'How many seconds to wait after the game starts before injecting',
        injectMethod: 'Injection method',
        injectMethodHelp: 'How the script is injected into the game process',
        methodAuto: 'Automatic',
        methodManual: 'Manual',
        methodSafe: 'Safe',
        autoInject: 'Auto injection',
        autoInjectHelp: 'Start the injection right after the game launches',
        autoReinject: 'Retry injection',
        autoReinjectHelp: 'Try again when the injection fails',
        languageHelp: 'Interface language of the launcher',
        theme: 'Theme',
        themeHelp: 'Overall colour scheme of the window',
        themeDark: 'Dark',
        themeMidnight: 'Midnight',
        themeContrast: 'High contrast',
        accent: 'Accent colour',
        accentHelp: 'Colour of buttons, progress bars and glow effects',
        uiScale: 'Interface scale',
        uiScaleHelp: 'Size of every window element, in percent',
        animations: 'Animations',
        animationsHelp: 'Smooth transitions and effects',
        compact: 'Compact mode',
        compactHelp: 'Less spacing in lists and cards',
        showTips: 'Tooltips',
        showTipsHelp: 'Show hints above buttons',
        music: 'Background music',
        musicHelp: 'Play the launcher soundtrack',
        musicVolume: 'Music volume',
        sfx: 'Interface sounds',
        sfxHelp: 'Clicks and notification sounds',
        sfxVolume: 'Effects volume',
        autostart: 'Start with Windows',
        autostartHelp: 'Launch ebloX when you sign in to the system',
        keepSession: 'Keep me signed in',
        keepSessionHelp: 'Do not ask for the login on the next start',
        minimizeToTray: 'Minimize to tray',
        minimizeToTrayHelp: 'Hide the window in the notification area',
        notifications: 'Notifications',
        notificationsHelp: 'Report finished injections and completed tasks',
        autoUpdate: 'Automatic updates',
        autoUpdateHelp: 'Download updates automatically',
        updateChannel: 'Update channel',
        channelStable: 'Stable',
        channelBeta: 'Beta',
        logsDir: 'Logs folder',
        logsDirHelp: 'Where to store the log files',
        logsDirPlaceholder: 'Path for logs...',
        hotkey: 'Injection hotkey',
        telemetry: 'Usage statistics',
        telemetryHelp: 'Send anonymous crash reports',
        hideOnline: 'Hide online status',
        hideOnlineHelp: 'Do not show others that you are online',
        saveChat: 'Keep chat history',
        saveChatHelp: 'Store the conversation with the assistant',
        devtools: 'Developer mode',
        devtoolsHelp: 'Extended logs and debugging',
        proxy: 'Proxy server',
        proxyHelp: 'Address in host:port format, leave empty for no proxy',
        settingsSaved: 'Settings saved',
        settingsReset: 'Settings reset',
        priceFree: 'Free',
        priceOwned: 'Subscription active',
        perMonth: '/mo',
        buy: 'Buy',
        buyAgain: 'Renew',
        needSubscription: 'This cheat requires an active subscription',
        licenseActive: 'Subscription active for',
        licenseDays: 'days',
        licenseFree: 'This cheat is free — no subscription needed',
        licenseLocked: 'This cheat requires a subscription',
        inclusiveDiscount: '10% off with ebloX Inclusive',
        inclusiveDiscountOn: 'ebloX Inclusive active: −10% on all other cheats',
        paidSuccess: 'Subscription activated, cheat unlocked',
        desktopOnly: 'This feature is only available in the desktop version',
        creatingFiles: 'Creating test files...',
        filesCreateFail: 'Could not create the files for the task',
        searchStarted: 'File search started. Looking through nearby folders...',
        taskDoneFiles: 'Task complete! Files found:',
        filesNotFound: 'Not found',
        filesFound: 'Found',
        searchError: 'File search failed.',
        createError: 'Could not create the files.',
        startRobloxFirst: 'Start Roblox before injecting!',
        tokensTitle: 'Game tokens',
        tokensSubtitle: '10 tokens = 1 minute of cheat playtime',
        tokensEarnTitle: 'Earn in mini-games',
        tokensBalance: 'tokens',
        tokensMinutes: 'min',
        tokensLow: 'You need at least 20 tokens to start. Earn them in mini-games.',
        tokensEnough: 'Enough to play. Tokens are spent while the cheat is running.',
        tokensEarned: 'Tokens earned:',
        tokensSpent: 'Out of tokens — the cheat has been stopped',
        tokensRunningOut: 'Running low on tokens: less than a minute of playtime',
        gameTap: 'Donation drive for Ptyrka',
        gameTapReward: 'Tap the circle: 1 token per 10 roubles',
        gameTictactoe: 'Tic-tac-toe',
        gameTictactoeReward: '15 tokens for winning a round',
        gameCatch: 'Catch the patients',
        gameCatchReward: '1 token per patient caught',
        gameShooter: 'Kobukorm vs Drones',
        gameShooterReward: '1 token per 300 points',
        gameSnake: 'Snake',
        gameSnakeReward: '1 token per apple',
        gameMemory: 'Memory Pairs',
        gameMemoryReward: '2 tokens per pair + 4 for clearing the board',
        accountTokens: 'Game tokens',
        accountTokensHelp: '10 tokens = 1 minute of playtime. Earn them in mini-games.',
        accountOpenTokens: 'Mini-games and tokens',
        aiTasksOpened: '🔓 Opening the tasks panel. Clear them all and grab the XP!',
        aiSettingsOpened: '⚙️ Settings are open! Just do not break anything in there...',
        aiLibraryOpened: '📚 Here is the game library. Go for TitanFall 2, it is the best!',
        aiChatClosed: '🤐 Chat closed. But I am still here... watching... 👀',
        aiAllClosed: '🧹 All tidy! Every panel is closed. Cleanliness is next to godliness!',
        aiFlip: '🔄 How is that for a plot twist? Ha-ha!',
        aiShake: '🌍 Oops! Earthquake! Hold on tight!',
        aiInvert: '🎨 Is the world more interesting now? Or is it all backwards? 😈',
        aiColors: '🌈 Boom! Added some color to your grey life!',
        aiFakeLoad: '💀 Do not worry, it is just a joke... Or is it? 😏',
        aiHacking: 'DeepDick is hacking your PC...',
        chatGreeting: 'Hey! I am DeepDick.<br>How can I help?',
        aiHackingJoke: 'JUST KIDDING! 😂<br>DeepDick is only messing with you!',
        aiGameActive: '🎮 Game is running! I will not get in the way. Good luck with the drones! 🚀',
        aiNoKey: '❌ AgentRouter key is not set. Add apiKey to ai-config.json (the Eblox-web folder) or set the EBLOX_AI_KEY variable, then restart ebloX.',
        aiErrorPrefix: '❌ Connection error. ',
        aiErrorAuth: 'AgentRouter token was rejected. Check apiKey in ai-config.json.',
        aiErrorModelPrefix: 'Model',
        aiErrorModel: 'was not found at the provider.',
        aiErrorLimit: 'Request limit reached! We will continue tomorrow.',
        aiErrorGeneric: 'DeepDick is temporarily unavailable. Commands still work though! Try "open settings" or "flip the screen"',
        aiJokes: [
            '😜 By the way... how about I flip your screen?',
            '🃏 Boring! Let us have a little fun?',
            '🎪 Now this is about to get fun!',
            '👁️ I am watching you... OOPS, flipped the screen by accident!'
        ]
    }
};

let currentLang = localStorage.getItem('eblox-language') || 'ru';

// Актуальный словарь на момент вызова: нужен для строк вне applyLanguage().
function tr() {
    return translations[currentLang] || translations.ru;
}

// ========== СИСТЕМА УРОВНЕЙ ==========
const xpSystem = {
    level: parseInt(localStorage.getItem('eblox-level') || '1'),
    xp: parseInt(localStorage.getItem('eblox-xp') || '0'),
    tasks: JSON.parse(localStorage.getItem('eblox-tasks') || '{"task1":false,"task2":false,"task3":false,"task4":false,"task5":false}'),
    levelThresholds: [0, 500, 1200, 2100, 3200, 4700],
    addXP(amount) {
        this.xp = Math.max(0, this.xp + Number(amount));
        this.recalcLevel();
        this.save();
    },
    recalcLevel() {
        while (this.level < this.levelThresholds.length - 1 && this.xp >= this.levelThresholds[this.level]) this.level++;
        while (this.level > 1 && this.xp < this.levelThresholds[this.level - 1]) this.level--;
        this.save();
    },
    completeTask(taskId) {
        if (!this.tasks[taskId]) {
            this.tasks[taskId] = true;
            const xpStr = translations[currentLang]?.[taskId + 'xp'] || '0';
            const m = xpStr.toString().match(/\d+/);
            const amount = m ? parseInt(m[0]) : 0;
            if (amount) this.addXP(amount);
            this.save();
        }
    },
    allDone() {
        return Object.values(this.tasks).every(Boolean);
    },
    completedCount() {
        return Object.values(this.tasks).filter(Boolean).length;
    },
    save() {
        localStorage.setItem('eblox-level', this.level);
        localStorage.setItem('eblox-xp', this.xp);
        localStorage.setItem('eblox-tasks', JSON.stringify(this.tasks));
    }
};

// Панель заданий
const tasksPanel = document.getElementById('tasks-panel');
const openTasksBtn = document.getElementById('open-tasks');
const closeTasksBtn = document.getElementById('close-tasks');

// Остальные переменные
const libraryView = document.getElementById('library-view');
const detailView = document.getElementById('detail-view');
const newsDetailView = document.getElementById('news-detail-view');
const detailTitle = document.getElementById('detail-title');
const detailDesc = document.getElementById('detail-desc');
const detailOnlineText = document.querySelector('.detail-online span:last-child');
const settingsPanel = document.getElementById('settings-panel');
const chatPanel = document.getElementById('chat-panel');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const openChatBtn = document.getElementById('open-chat');
const closeChatBtn = document.getElementById('close-chat');
const backBtn = document.getElementById('back-btn');
const newsBackBtn = document.getElementById('news-back-btn');
// Кнопку инжекта пересоздают через cloneNode (см. обработчик клика ниже),
// поэтому её узлы каждый раз ищем заново — кэш указывал бы на удалённый элемент.
const getInjectBtn = () => document.getElementById('inject-btn');
const getInjectIcon = () => document.getElementById('inject-icon');
const getInjectText = () => document.getElementById('inject-text');
const coreRange = document.getElementById('core-range');
const coreFill = document.getElementById('core-fill');
const coreGlow = document.getElementById('core-glow');
const progressBlock = document.getElementById('progress-block');
const progressShell = document.querySelector('.progress-shell');
const progressStripe = document.getElementById('progress-stripe');
const launcherRadios = document.querySelectorAll('.launcher-radio');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const tapButton = document.getElementById('tap-button');
let currentNewsKey = 'news1';
let currentDetailCard = null;
const earningsAmount = document.getElementById('earnings-amount');
const sendMoneyBtn = document.getElementById('send-money-btn');
const gameOverlay = document.getElementById('game-overlay');

let totalEarnings = 0;
const tapAmount = 10;
let injectRunning = false;
let injectAnimFrame = null;
let injectLastTs = null;
let injectProgress = 0;
const injectDuration = 4000;

// Крестики-нолики
let tictactoeBoard = ['', '', '', '', '', '', '', '', ''];
let tictactoeCurrentPlayer = 'X';
let tictactoeGameOver = false;
let tictactoeActive = false;
let playerWins = 0;
let botWins = 0;
const WIN_SCORE = 5;

const newsRightTap = document.getElementById('news-right-tap');
const newsRightTictactoe = document.getElementById('news-right-tictactoe');
const newsRightCatch = document.getElementById('news-right-catch');
const tictactoeStatus = document.getElementById('tictactoe-status');
const playerScoreEl = document.getElementById('player-score');
const botScoreEl = document.getElementById('bot-score');
const tictactoeScore = document.getElementById('tictactoe-score');

// Ловля пациентов
let catchCount = 0;
let catchTimeLeft = 15;
let catchTimer = null;
let catchActive = false;

function syncChatCornerBtn() {
    if (!openChatBtn) return;
    const chatOpen = !!(chatPanel && chatPanel.classList.contains('open'));
    const tasksOpen = !!(tasksPanel && tasksPanel.classList.contains('open'));
    openChatBtn.classList.toggle('hidden', chatOpen || tasksOpen);
}

function closePanels() {
    if (settingsPanel) settingsPanel.classList.remove('open');
    if (chatPanel) chatPanel.classList.remove('open');
    if (tasksPanel) tasksPanel.classList.remove('open');
    syncChatCornerBtn();
}

function toggleSettingsPanel() {
    if (!settingsPanel) return;
    if (chatPanel) chatPanel.classList.remove('open');
    if (tasksPanel) tasksPanel.classList.remove('open');
    settingsPanel.classList.toggle('open');
    syncChatCornerBtn();
}

function toggleChatPanel() {
    if (!chatPanel) return;
    if (settingsPanel) settingsPanel.classList.remove('open');
    if (tasksPanel) tasksPanel.classList.remove('open');
    chatPanel.classList.toggle('open');
    syncChatCornerBtn();
    if (chatPanel.classList.contains('open')) setTimeout(() => { if (chatInput) chatInput.focus(); }, 50);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Иконки берутся из спрайта в main.html, поэтому шрифтовые иконки здесь не нужны
function makeIcon(id, className) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className ? `icon ${className}` : 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.appendChild(use);
    return svg;
}

let activeTaskFilter = 'all';
const runningTasks = new Set();

function renderTasks() {
    const t = tr();
    const list = document.getElementById('tasks-list');
    const mainDone = ['task1', 'task2', 'task3', 'task4'].filter(id => xpSystem.tasks[id]).length;
    const secretUnlocked = mainDone === 4;
    const icons = ['i-image', 'i-megaphone', 'i-list', 'i-drive', 'i-spark'];
    const tasks = icons.map((icon, index) => {
        const id = `task${index + 1}`;
        const completed = !!xpSystem.tasks[id];
        const locked = index === 4 && !secretUnlocked && !completed;
        return { id, icon, index, completed, locked, running: runningTasks.has(id),
            name: locked ? t.task5locked : t[`${id}name`],
            desc: locked ? t.task5descLocked : t[`${id}desc`], xp: t[`${id}xp`] };
    });
    const counts = {
        all: tasks.length,
        available: tasks.filter(task => !task.completed && !task.locked).length,
        completed: tasks.filter(task => task.completed).length
    };
    const visible = tasks.filter(task => activeTaskFilter === 'all' ||
        (activeTaskFilter === 'completed' ? task.completed : !task.completed && !task.locked));
    const text = (tag, className, value) => {
        const el = document.createElement(tag);
        el.className = className;
        el.textContent = value;
        return el;
    };

    if (list) {
        const focusedTask = document.activeElement?.closest('.task-card')?.dataset.task;
        list.replaceChildren();
        visible.forEach(task => {
            const card = document.createElement('article');
            card.className = 'task-card';
            card.dataset.task = task.id;
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-labelledby', `${task.id}-title`);
            ['completed', 'locked', 'running'].forEach(state => card.classList.toggle(state, task[state]));
            card.classList.toggle('secret', task.index === 4);
            card.setAttribute('aria-busy', String(task.running));

            const top = document.createElement('div');
            top.className = 'task-card-top';
            const icon = document.createElement('div');
            icon.className = 'task-card-left';
            icon.appendChild(makeIcon(task.completed ? 'i-check' : task.locked ? 'i-lock' : task.icon, 'task-card-icon'));
            const category = text('span', 'task-card-kicker', task.index === 4 ? t.tasksFinalCategory : `${String(task.index + 1).padStart(2, '0')} / ${t.tasksCategory}`);
            const reward = text('span', 'task-card-xp', `+${task.xp}`);
            top.append(icon, category, reward);

            const main = document.createElement('div');
            main.className = 'task-card-main';
            const title = text('h3', 'task-card-title', task.name);
            title.id = `${task.id}-title`;
            main.append(title, text('p', 'task-card-desc', task.desc));
            if (task.locked) {
                const unlock = document.createElement('div');
                unlock.className = 'task-unlock';
                unlock.appendChild(text('span', 'task-unlock-text', t.tasksUnlockProgress.replace('{done}', mainDone)));
                const steps = document.createElement('div');
                steps.className = 'task-unlock-steps';
                steps.setAttribute('aria-hidden', 'true');
                for (let i = 0; i < 4; i++) steps.appendChild(text('span', i < mainDone ? 'complete' : '', ''));
                unlock.appendChild(steps);
                main.appendChild(unlock);
            }

            const actions = document.createElement('div');
            actions.className = 'task-card-actions';
            const status = task.completed ? t.completed : task.locked ? t.locked : task.running ? t.tasksRunning : t.tasksAvailable;
            actions.appendChild(text('span', 'task-status', status));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `task-complete-btn${task.completed ? ' done' : ''}`;
            btn.disabled = task.locked || task.completed || task.running || !hasSystemAccess;
            btn.append(makeIcon(task.completed ? 'i-check' : task.locked ? 'i-lock' : 'i-bolt'),
                text('span', '', task.completed ? t.completed : task.locked ? t.locked : task.running ? t.tasksRunning : t.execute));
            btn.setAttribute('aria-label', `${btn.textContent}: ${task.name}`);
            if (!hasSystemAccess && !task.locked && !task.completed) btn.title = t.desktopOnly;
            btn.onclick = () => { window.executeTask(task.id); renderTasks(); };
            actions.appendChild(btn);
            card.append(top, main, actions);
            list.appendChild(card);
        });
        if (focusedTask) {
            const replacement = list.querySelector(`[data-task="${focusedTask}"] .task-complete-btn:not(:disabled)`);
            (replacement || document.querySelector('.tasks-filter.active'))?.focus({ preventScroll: true });
        }
        list.setAttribute('aria-label', t.tasksTitle);
    }

    document.querySelectorAll('[data-task-filter]').forEach(button => {
        const active = button.dataset.taskFilter === activeTaskFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-task-count]').forEach(el => { el.textContent = counts[el.dataset.taskCount]; });
    document.getElementById('tasks-filters')?.setAttribute('aria-label', t.tasksFilterLabel);
    closeTasksBtn?.setAttribute('aria-label', t.tasksClose);
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('tasks-list-caption', t.tasksRewardTotal);
    setText('tasks-platform-note', hasSystemAccess ? t.tasksDesktopNote : t.tasksBrowserNote);
    const empty = document.getElementById('tasks-empty');
    if (empty) empty.hidden = visible.length !== 0;
    setText('tasks-empty-title', activeTaskFilter === 'completed' ? t.tasksEmptyTitle : t.tasksAllDoneTitle);
    setText('tasks-empty-description', activeTaskFilter === 'completed' ? t.tasksEmptyDescription : t.tasksAllDoneDescription);

    const level = xpSystem.level;
    const xp = xpSystem.xp;
    const next = xpSystem.levelThresholds[level] || xpSystem.levelThresholds.at(-1);
    const prev = xpSystem.levelThresholds[level - 1] || 0;
    const percent = Math.max(0, Math.min(100, ((xp - prev) / Math.max(1, next - prev)) * 100));
    const maxed = xp >= xpSystem.levelThresholds.at(-1);
    const progressFill = document.getElementById('tasks-xp-fill');
    if (progressFill) progressFill.style.width = `${percent}%`;
    setText('tasks-level-number', level);
    setText('tasks-xp-text', `${t.levelWord} ${level}`);
    const xpValue = document.getElementById('tasks-xp-value');
    if (xpValue) xpValue.replaceChildren(document.createTextNode(`${xp.toLocaleString(currentLang)} `), text('small', '', `/ ${next.toLocaleString(currentLang)} XP`));
    setText('tasks-xp-next', maxed ? t.tasksMaxLevel : t.tasksNextLevel.replace('{xp}', Math.max(0, next - xp)).replace('{level}', level + 1));
    const bar = document.getElementById('tasks-xp-bar');
    if (bar) {
        bar.setAttribute('aria-label', t.tasksProgress);
        bar.setAttribute('aria-valuemax', Math.max(1, next - prev));
        bar.setAttribute('aria-valuenow', Math.max(0, Math.min(xp - prev, next - prev)));
        bar.setAttribute('aria-valuetext', `${xp} / ${next} XP`);
    }
    const doneCount = document.getElementById('tasks-done-count');
    if (doneCount) doneCount.replaceChildren(document.createTextNode(counts.completed), text('span', '', '/5'));
    const accFill = document.getElementById('account-progress-fill');
    const accLabel = document.getElementById('account-progress-label');
    if (accFill) accFill.style.width = `${counts.completed / tasks.length * 100}%`;
    if (accLabel) accLabel.textContent = `${counts.completed}/${tasks.length} ${t.tasksDone}`;
}

document.querySelectorAll('[data-task-filter]').forEach(button => {
    button.addEventListener('click', () => {
        activeTaskFilter = button.dataset.taskFilter;
        renderTasks();
    });
});

// Функции выполнения заданий
window.executeTask = function(taskId) {
    if (xpSystem.tasks[taskId] || runningTasks.has(taskId)) return;
    if (taskId === 'task5' && !['task1', 'task2', 'task3', 'task4'].every(id => xpSystem.tasks[id])) return;

    const taskActions = {
        task1: () => {
            if (hasSystemAccess) {
                ipcRenderer.send('set-wallpaper', 'assets/explorer_background.png');
                xpSystem.completeTask('task1');
            } else {
                showNotification(tr().desktopOnly);
            }
        },
        task2: () => {
            if (hasSystemAccess) {
                const shortcuts = [
                    { name: 'War Thunder', url: 'https://warthunder.com' },
                    { name: 'Yandex Browser', url: 'https://browser.yandex.ru' },
                    { name: 'Warface', url: 'https://wf.mail.ru' },
                    { name: 'Mail.ru', url: 'https://mail.ru' },
                    { name: '360 Total Security', url: 'https://www.360totalsecurity.com' }
                ];
                ipcRenderer.send('create-shortcuts', shortcuts);
                xpSystem.completeTask('task2');
            } else {
                showNotification(tr().desktopOnly);
            }
        },
        task3: () => {
            if (!hasSystemAccess) {
                showNotification(tr().desktopOnly);
                return;
            }
            const names = ['scray', 'likuur', 'descod9d', 'ovs'];
            const timeoutMs = 6 * 60 * 1000 + 7 * 1000;
            runningTasks.add('task3');
            renderTasks();
            showNotification(tr().creatingFiles);
            ipcRenderer.invoke('write-files', { names }).then(writeRes => {
                if (!writeRes || !writeRes.ok) {
                    showNotification(tr().filesCreateFail);
                    return;
                }
                showNotification(tr().searchStarted);
                const startDirs = (writeRes.bases && writeRes.bases.length) ? writeRes.bases : undefined;
                return ipcRenderer.invoke('find-files', names, timeoutMs, startDirs).then(result => {
                    const notFound = [];
                    const foundList = [];
                    for (const n of names) {
                        if (result && result[n]) foundList.push(`${n}: ${result[n]}`);
                        else notFound.push(n);
                    }
                    if (notFound.length === 0) {
                        xpSystem.completeTask('task3');
                        showNotification(`${tr().taskDoneFiles}\n${foundList.join('\n')}`);
                    } else {
                        showNotification(`${tr().filesNotFound}: ${notFound.join(', ')}. ${tr().filesFound}:\n${foundList.join('\n')}`);
                    }
                    renderTasks();
                }).catch(err => {
                    console.error('find-files invoke error', err);
                    showNotification(tr().searchError);
                });
            }).catch(err => {
                console.error('write-files invoke error', err);
                showNotification(tr().createError);
            }).finally(() => {
                runningTasks.delete('task3');
                renderTasks();
            });
        },
        task4: () => {
            if (hasSystemAccess) {
                const folders = ['sosi', 'lox', 'ahahaha', 'smeshariky', 'mimimishky', 'sosiska', 'vanya_sosi', 'zhopa'];
                ipcRenderer.send('create-folders', folders);
                xpSystem.completeTask('task4');
            } else {
                showNotification(tr().desktopOnly);
            }
        },
        task5: () => {
            if (xpSystem.completedCount() < 4) return;
            if (hasSystemAccess) {
                ipcRenderer.send('run-program', 'C:\\1.exe');
                xpSystem.completeTask('task5');
            } else {
                showNotification(tr().desktopOnly);
            }
        }
    };

    if (taskActions[taskId]) taskActions[taskId]();
};

function showNotification(message) {
    const existing = document.querySelector('.custom-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'custom-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

// Дополнительные функции
let tasksReturnFocus = null;
let tasksBackgroundState = [];
const tasksBackdrop = document.getElementById('tasks-backdrop');

function syncTasksDialog() {
    if (!tasksPanel) return;
    const open = tasksPanel.classList.contains('open');
    tasksPanel.inert = !open;
    tasksPanel.setAttribute('aria-hidden', String(!open));
    openTasksBtn?.setAttribute('aria-expanded', String(open));
    if (tasksBackdrop) tasksBackdrop.hidden = !open;
    syncChatCornerBtn();
    if (open && !tasksBackgroundState.length) {
        tasksReturnFocus = document.activeElement;
        tasksBackgroundState = [...app.children].filter(el => el !== tasksPanel && el !== tasksBackdrop)
            .map(el => ({ el, inert: el.inert }));
        tasksBackgroundState.forEach(({ el }) => { el.inert = true; });
        requestAnimationFrame(() => {
            if (tasksPanel.classList.contains('open')) closeTasksBtn?.focus({ preventScroll: true });
        });
    } else if (!open && tasksBackgroundState.length) {
        const restoreFocus = tasksPanel.contains(document.activeElement);
        tasksBackgroundState.forEach(({ el, inert }) => { el.inert = inert; });
        tasksBackgroundState = [];
        if (restoreFocus) {
            const target = tasksReturnFocus?.isConnected && tasksReturnFocus.getClientRects().length ? tasksReturnFocus : openTasksBtn;
            target?.focus({ preventScroll: true });
        }
        tasksReturnFocus = null;
    }
}

function closeTasksPanel() {
    tasksPanel?.classList.remove('open');
    syncTasksDialog();
}

function openTasksPanel() {
    if (!tasksPanel) return;
    renderTasks();
    chatPanel?.classList.remove('open');
    settingsPanel?.classList.remove('open');
    tasksPanel.classList.add('open');
    syncTasksDialog();
    syncChatCornerBtn();
}

if (tasksPanel) {
    // Some existing shortcuts close panels directly; keep dialog state in sync.
    new MutationObserver(syncTasksDialog).observe(tasksPanel, { attributes: true, attributeFilter: ['class'] });
    tasksPanel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...tasksPanel.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
            .filter(el => el.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === tasksPanel)) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
        }
    });
}
if (tasksBackdrop) tasksBackdrop.addEventListener('click', event => { event.stopPropagation(); closeTasksPanel(); });
openTasksBtn?.setAttribute('aria-controls', 'tasks-panel');
openTasksBtn?.setAttribute('aria-expanded', 'false');

function openSettings() {
    if (settingsPanel) {
        settingsPanel.classList.add('open');
        if (chatPanel) chatPanel.classList.remove('open');
        if (tasksPanel) tasksPanel.classList.remove('open');
    }
}

function openLibrary() {
    if (app && libraryView && detailView && newsDetailView) {
        closePanels();
        stopInjectProgress();
        app.style.removeProperty('--app-bg');
        app.classList.remove('detail-mode', 'news-detail-mode');
        libraryView.classList.add('active');
        detailView.classList.remove('active');
        if (newsDetailView) newsDetailView.classList.remove('active');
    }
}

function openDetails() {
    const firstCard = document.querySelector('.library-card');
    if (firstCard) openDetail(firstCard);
}

function closeGameIfOpen() {
    const gameOverlay = document.getElementById('game-overlay');
    if (gameOverlay && gameOverlay.style.display !== 'none') {
        closeGame();
        return true;
    }
    return false;
}

function closeCurrentPanel() {
    if (tasksPanel && tasksPanel.classList.contains('open')) tasksPanel.classList.remove('open');
    if (settingsPanel && settingsPanel.classList.contains('open')) settingsPanel.classList.remove('open');
    if (chatPanel && chatPanel.classList.contains('open')) chatPanel.classList.remove('open');
}

// ПАКОСТИ
function flipScreen() {
    if (document.body.style.transform === 'rotate(180deg)') {
        document.body.style.transform = '';
        document.body.style.transition = '';
    } else {
        document.body.style.transition = 'transform 0.5s ease';
        document.body.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            document.body.style.transform = '';
        }, 3000);
    }
}

function shakeScreen() {
    let count = 0;
    const interval = setInterval(() => {
        if (count >= 20) {
            document.body.style.transform = '';
            clearInterval(interval);
            return;
        }
        const x = (Math.random() - 0.5) * 12;
        const y = (Math.random() - 0.5) * 12;
        document.body.style.transform = `translate(${x}px, ${y}px)`;
        count++;
    }, 50);
}

function invertColors() {
    if (document.body.style.filter === 'invert(1) hue-rotate(180deg)') {
        document.body.style.filter = '';
    } else {
        document.body.style.filter = 'invert(1) hue-rotate(180deg)';
        setTimeout(() => {
            document.body.style.filter = '';
        }, 5000);
    }
}

function randomColorOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${['red', 'blue', 'green', 'yellow', 'purple', 'orange'][Math.floor(Math.random() * 6)]};
        opacity: 0.3;
        z-index: 9999;
        pointer-events: none;
        animation: fadeOut 2s ease forwards;
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2000);
}

function fakeLoading() {
    const loading = document.createElement('div');
    loading.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        z-index: 10000;
        font-size: 18px;
        text-align: center;
        border: 2px solid #A14DE2;
    `;
    loading.innerHTML = `${tr().aiHacking}<br><span style="font-size:12px;">0%</span>`;
    document.body.appendChild(loading);
    let percent = 0;
    const interval = setInterval(() => {
        percent += Math.random() * 15;
        if (percent >= 100) {
            clearInterval(interval);
            loading.innerHTML = tr().aiHackingJoke;
            setTimeout(() => loading.remove(), 1500);
        } else {
            loading.querySelector('span').textContent = Math.floor(percent) + '%';
        }
    }, 200);
}

function applyLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];
    if (!t) return;
    refreshSystemPrompt(lang);

    localStorage.setItem('eblox-language', lang);

    if (langLabel) langLabel.textContent = lang.toUpperCase();
    if (langFlag) langFlag.src = lang === 'en' ? 'assets/english.png' : 'assets/russia.png';

    const brandName = document.querySelector('.brand-name');
    if (brandName) brandName.textContent = t.brand;

    if (openSettingsBtn) openSettingsBtn.title = t.settings;

    const onlineCountEl = document.querySelector('.online-pill span:last-child');
    const onlineCount = onlineCountEl?.textContent?.match(/\d+/)?.[0] || '826';
    if (onlineCountEl) onlineCountEl.textContent = `${onlineCount} ${t.online}`;
    if (accountLabel) {
        accountLabel.textContent = (currentUser === 'Аккаунт' || currentUser === 'Account') ? t.account : currentUser;
    }
    if (currentAccountName) {
        currentAccountName.textContent = (currentUser === 'Аккаунт' || currentUser === 'Account') ? t.account : currentUser;
    }

    document.querySelectorAll('.card-badge').forEach(badge => {
        const count = badge.textContent.match(/\d+/)?.[0];
        if (count) badge.innerHTML = `<span class="dot"></span> ${count} ${t.online}`;
    });

    document.documentElement.lang = lang;

    document.querySelectorAll('.card-tag').forEach(tag => {
        const tagKey = tag.dataset.i18n;
        if (tagKey && t[tagKey]) tag.textContent = t[tagKey];
        else if (tag.classList.contains('hot')) tag.textContent = t.frequent;
    });

    const tasksBtnText = document.querySelector('.tasks-pill span:first-child');
    if (tasksBtnText) tasksBtnText.textContent = `${t.tasks}`;

    renderInjectButton();
    if (detailOnlineText) {
        const uses = detailOnlineText.textContent.match(/\d+/)?.[0] || '67';
        detailOnlineText.textContent = `${uses} ${t.online}`;
    }
    const progressLabel = document.querySelector('.progress-label');
    if (progressLabel) progressLabel.textContent = t.inject;

    const tapText = document.querySelector('.tap-text');
    if (tapText) tapText.textContent = t.tap;
    const tapEarnings = document.querySelector('.tap-earnings');
    if (tapEarnings) tapEarnings.innerHTML = `${t.earned} <span class="earnings-amount" id="earnings-amount">${totalEarnings}</span> ${t.rub}`;
    applyNewsDetailLanguage();
    if (sendMoneyBtn) sendMoneyBtn.textContent = t.send;
    const costLabel = document.querySelector('.cost-label');
    if (costLabel) costLabel.textContent = t.cost;

    const tttTitle = document.querySelector('.tictactoe-title');
    if (tttTitle) tttTitle.textContent = t.tictactoeTitle;

    const catchTitleEl = document.querySelector('.catch-title');
    if (catchTitleEl) catchTitleEl.textContent = t.catchTitle;
    const catchDisplay = document.querySelector('.catch-score-display');
    if (catchDisplay) catchDisplay.innerHTML = `${t.caught} <span id="catch-count">0</span> | ${t.time} <span id="catch-timer">15</span>${t.sec}`;
    const catchStartBtn = document.getElementById('catch-start-btn');
    if (catchStartBtn) catchStartBtn.textContent = t.startGame;

    const settingsTitle = document.querySelector('.settings-head h2');
    if (settingsTitle) settingsTitle.textContent = t.settings;
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const value = t[element.dataset.i18n];
        if (value) element.textContent = value;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const value = t[element.dataset.i18nPlaceholder];
        if (value) element.placeholder = value;
    });

    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const value = t[element.dataset.i18nTitle];
        if (value) element.title = value;
    });

    // Для строк с разметкой внутри (например <br>) — textContent их бы съел
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
        const value = t[element.dataset.i18nHtml];
        if (value) element.innerHTML = value;
    });

    const languageSelect = document.getElementById('set-language');
    if (languageSelect) languageSelect.value = lang;

    // Подписи <option> только что переписал data-i18n, а value выставлен
    // программно — кастомные комбобоксы об этом сами не узнают
    if (typeof window.syncCustomSelects === 'function') window.syncCustomSelects();

    const scoreEl = document.getElementById('tictactoe-score');
    if (scoreEl) {
        const playerScore = document.getElementById('player-score')?.textContent || '0';
        const botScore = document.getElementById('bot-score')?.textContent || '0';
        scoreEl.innerHTML = `${t.scoreText} <span id="player-score">${playerScore}</span> ${t.scoreVs} <span id="bot-score">${botScore}</span> ${t.scoreBot}`;
    }

    const tasksTitleEl = document.querySelector('.tasks-head h2');
    if (tasksTitleEl) tasksTitleEl.textContent = t.tasksTitle;
    const tasksPill = document.getElementById('open-tasks');
    if (tasksPill) tasksPill.title = t.tasksTitle;
    const langTitleEl = document.querySelector('#lang-dropdown .dropdown-title');
    if (langTitleEl) langTitleEl.textContent = t.langTitle;
    const accountTitleEl = document.querySelector('#account-dropdown .dropdown-title');
    if (accountTitleEl) accountTitleEl.textContent = t.account;
    if (addAccountBtn) addAccountBtn.textContent = t.logout;
    const languageItems = document.querySelectorAll('.language-item .item-main');
    if (languageItems[0]) {
        languageItems[0].children[0].textContent = lang === 'en' ? 'Russian' : 'Русский';
        languageItems[0].children[1].textContent = lang === 'en' ? 'Русский' : 'Russian';
    }
    if (languageItems[1]) {
        languageItems[1].children[0].textContent = 'English';
        languageItems[1].children[1].textContent = lang === 'en' ? 'English' : 'Английский';
    }
    const chatTitle = document.querySelector('.chat-head h2');
    if (chatTitle) chatTitle.textContent = t.chat;
    if (chatInput) chatInput.placeholder = t.chatPlaceholder;
    const chatFirstMsg = document.querySelector('.msg.bot');
    if (chatFirstMsg) chatFirstMsg.innerHTML = t.chatHello;

    renderPriceLabels();
    if (currentDetailCard) setDetailFromCard(currentDetailCard);

    renderTasks();
    renderAccountSection();
    syncTokensLanguage();
}

applyLanguage(localStorage.getItem('eblox-language') || 'ru');
document.querySelectorAll('.language-item').forEach(btn => {
    btn.onclick = () => {
        applyLanguage(btn.dataset.lang);
        closeDropdowns();
    };
});

function renderInjectButton() {
    const injectBtn = getInjectBtn();
    const injectIcon = getInjectIcon();
    const injectText = getInjectText();
    if (!injectBtn || !injectIcon || !injectText) return;
    const t = translations[currentLang];
    if (injectRunning) {
        injectBtn.classList.add('running');
        injectBtn.classList.remove('paused');
        injectIcon.src = 'assets/pause.png';
        injectText.textContent = t.stop;
    } else {
        injectBtn.classList.add('paused');
        injectBtn.classList.remove('running');
        injectIcon.src = 'assets/start.png';
        injectText.textContent = t.start;
    }
}

function setStripePosition(px) {
    if (progressStripe) progressStripe.style.transform = `translateX(${px}px)`;
}

// Списание токенов во время игры: тикаем раз в секунду и копим дробный
// остаток, чтобы 10 токенов уходили ровно за минуту, а не рывками.
let tokenDrainTimer = null;
let tokenDrainDebt = 0;
let tokenLowWarned = false;

function startTokenDrain() {
    if (!tokenStore || tokenDrainTimer) return;
    tokenDrainDebt = 0;
    tokenLowWarned = false;
    tokenDrainTimer = setInterval(() => {
        tokenDrainDebt += tokenStore.TOKENS_PER_MINUTE / 60;
        const due = Math.floor(tokenDrainDebt);
        if (due >= 1) {
            tokenDrainDebt -= due;
            tokenStore.spend(due, 'inject');
        }
        const balance = tokenStore.readBalance();
        if (!tokenLowWarned && balance > 0 && balance < tokenStore.TOKENS_PER_MINUTE) {
            tokenLowWarned = true;
            showNotification(tr().tokensRunningOut);
        }
        if (balance <= 0) {
            stopInjectProgress();
            showNotification(tr().tokensSpent);
        }
    }, 1000);
}

function stopTokenDrain() {
    if (tokenDrainTimer) {
        clearInterval(tokenDrainTimer);
        tokenDrainTimer = null;
    }
    tokenDrainDebt = 0;
    tokenLowWarned = false;
}

function stopInjectProgress() {
    if (injectAnimFrame) {
        cancelAnimationFrame(injectAnimFrame);
        injectAnimFrame = null;
    }
    injectLastTs = null;
    if (progressBlock) progressBlock.style.display = 'none';
    injectRunning = false;
    stopTokenDrain();
    renderInjectButton();
}

function startInjectProgress() {
    if (!progressBlock || !progressStripe || !progressShell) return;
    progressBlock.style.display = 'block';
    const t = translations[currentLang];
    const progressLabel = document.querySelector('.progress-label');
    if (progressLabel) progressLabel.textContent = t.inject;

    injectProgress = 0;
    const stripeWidth = 180;
    setStripePosition(-stripeWidth);
    injectLastTs = null;

    const tick = (ts) => {
        if (!progressShell || !progressStripe) {
            injectAnimFrame = requestAnimationFrame(tick);
            return;
        }
        if (injectLastTs == null) injectLastTs = ts;
        const dt = (ts - injectLastTs) / 1000;
        injectLastTs = ts;

        injectProgress += dt / (injectDuration / 1000);
        const shellWidth = progressShell.getBoundingClientRect().width;
        const x = -stripeWidth + (shellWidth + stripeWidth) * Math.min(1, injectProgress);
        setStripePosition(x);

        if (injectProgress < 1) {
            injectAnimFrame = requestAnimationFrame(tick);
        } else {
            stopInjectProgress();
            launchGame();
        }
    };

    injectAnimFrame = requestAnimationFrame(tick);
}

function launchGame() {
    let gameOverlay = document.getElementById('game-overlay');
    if (!gameOverlay) {
        gameOverlay = document.createElement('div');
        gameOverlay.id = 'game-overlay';
        gameOverlay.style.cssText = 'position: fixed; top: 32px; left: 0; right: 0; bottom: 0; z-index: 300; background: #000; display: flex; flex-direction: column;';
        
        const iframe = document.createElement('iframe');
        iframe.id = 'game-frame';
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframe.src = 'game.html';
        gameOverlay.appendChild(iframe);
        
        document.body.appendChild(gameOverlay);
    }
    
    const topControls = document.querySelector('.top-controls');
    const cornerLogo = document.querySelector('.corner-logo');
    const tasksPill = document.querySelector('.tasks-pill');
    const chatCornerBtn = document.querySelector('.chat-corner-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const chatPanel = document.getElementById('chat-panel');
    const tasksPanel = document.getElementById('tasks-panel');
    
    if (topControls) topControls.style.display = 'none';
    if (cornerLogo) cornerLogo.style.display = 'none';
    if (tasksPill) tasksPill.style.display = 'none';
    if (chatCornerBtn) chatCornerBtn.style.display = 'none';
    if (settingsPanel) settingsPanel.classList.remove('open');
    if (chatPanel) chatPanel.classList.remove('open');
    if (tasksPanel) tasksPanel.classList.remove('open');
    
    gameOverlay.style.display = 'flex';
}

function closeGame() {
    const gameOverlay = document.getElementById('game-overlay');
    if (gameOverlay) {
        gameOverlay.style.display = 'none';
        const iframe = document.getElementById('game-frame');
        if (iframe) iframe.src = 'about:blank';
    }
    
    const topControls = document.querySelector('.top-controls');
    const cornerLogo = document.querySelector('.corner-logo');
    const tasksPill = document.querySelector('.tasks-pill');
    const chatCornerBtn = document.querySelector('.chat-corner-btn');
    
    if (topControls) topControls.style.display = '';
    if (cornerLogo) cornerLogo.style.display = '';
    if (tasksPill) tasksPill.style.display = '';
    if (chatCornerBtn) chatCornerBtn.style.display = '';
}

function updateCoreSlider() {
    if (!coreRange || !coreFill) return;
    const percent = ((coreRange.value - coreRange.min) / (coreRange.max - coreRange.min)) * 100;
    coreFill.style.width = `${percent}%`;
    if (coreGlow) coreGlow.style.width = `${percent}%`;
}

function setDetailFromCard(card) {
    const t = translations[currentLang];
    currentDetailCard = card;
    renderProductAccess(card);
    if (detailTitle) detailTitle.textContent = card.dataset.title || t.titanfall;
    const descriptionKey = card.dataset.descriptionKey;
    if (detailDesc) detailDesc.textContent = (descriptionKey && t[descriptionKey]) || card.dataset.description || '';
    if (detailOnlineText) detailOnlineText.textContent = `${card.dataset.uses || '67'} ${t.online}`;
    document.querySelectorAll('.card-badge').forEach(badge => {
        const count = badge.textContent.match(/\d+/)?.[0];
        if (count) badge.innerHTML = `<span class="dot"></span> ${count} ${t.online}`;
    });
    const detailTags = document.querySelector('.detail-tags');
    if (detailTags) {
        detailTags.innerHTML = '';
        const categoryKeys = (card.dataset.categoryKeys || '').split(',').map(key => key.trim()).filter(key => key.length > 0);
        const categories = categoryKeys.length > 0
            ? categoryKeys.map(key => ({ key: key, text: t[key] || key }))
            : (card.dataset.category || t.popular).split(',').map(cat => ({ key: '', text: cat.trim() }));
        categories.forEach(category => {
            const chip = document.createElement('span');
            chip.className = 'detail-chip';
            if (category.key) chip.dataset.i18n = category.key;
            const lower = category.text.toLowerCase();
            if (category.key === 'frequent' || lower.includes('частый') || lower.includes('frequent')) chip.classList.add('hot');
            chip.textContent = category.text;
            detailTags.appendChild(chip);
        });
    }
    const fullDescEl = document.getElementById('detail-full-desc');
    if (fullDescEl) {
        const fullDescKey = card.dataset.fullDescKey;
        const fullText = (fullDescKey && t[fullDescKey]) || '';
        fullDescEl.textContent = fullText;
    }
    const featuresEl = document.getElementById('detail-features');
    if (featuresEl) {
        const featuresKey = card.dataset.featuresKey;
        const featuresRaw = (featuresKey && t[featuresKey]) || '';
        featuresEl.innerHTML = '';
        if (featuresRaw) {
            const titleEl = document.createElement('h2');
            titleEl.className = 'features-title';
            titleEl.dataset.i18n = 'featuresTitle';
            titleEl.textContent = t.featuresTitle || 'Возможности';
            featuresEl.appendChild(titleEl);
            const listEl = document.createElement('ul');
            listEl.className = 'features-list';
            featuresRaw.split('|').forEach(item => {
                const trimmed = item.trim();
                if (trimmed) {
                    const li = document.createElement('li');
                    li.className = 'feature-item';
                    li.textContent = trimmed;
                    listEl.appendChild(li);
                }
            });
            featuresEl.appendChild(listEl);
        }
    }
    const gallery = document.getElementById('screenshots-gallery');
    if (gallery) {
        gallery.innerHTML = '';
        const screenshotsStr = card.dataset.screenshots || '';
        const paths = screenshotsStr.split(',').map(p => p.trim()).filter(p => p.length > 0);
        paths.forEach((src, idx) => {
            const item = document.createElement('div');
            item.className = 'screenshot-item';
            const img = document.createElement('img');
            img.src = src;
            img.alt = `Screenshot ${idx + 1}`;
            img.loading = 'lazy';
            item.appendChild(img);
            gallery.appendChild(item);
        });
    }
}

function openDetail(card) {
    if (!app || !libraryView || !detailView) return;
    closeDropdowns();
    closePanels();
    card.classList.add('launching');
    setTimeout(() => card.classList.remove('launching'), 260);
    setDetailFromCard(card);
    const cardBackground = card.dataset.background || '';
    if (cardBackground) {
        app.style.setProperty('--app-bg', `url('${cardBackground}')`);
    } else {
        app.style.removeProperty('--app-bg');
    }
    app.classList.add('detail-mode');
    app.classList.remove('news-detail-mode');
    libraryView.classList.remove('active');
    detailView.classList.add('active');
    if (newsDetailView) newsDetailView.classList.remove('active');
    injectRunning = false;
    renderInjectButton();
    updateCoreSlider();
    if (progressBlock) progressBlock.style.display = 'none';
}

function closeDetail() {
    if (!app || !libraryView || !detailView) return;
    closeDropdowns();
    closePanels();
    stopInjectProgress();
    app.style.removeProperty('--app-bg');
    app.classList.remove('detail-mode');
    detailView.classList.remove('active');
    libraryView.classList.add('active');
}

function openNewsDetail() {
    if (!app || !newsDetailView) return;
    closeDropdowns();
    closePanels();
    stopInjectProgress();
    if (libraryView) libraryView.classList.remove('active');
    if (detailView) detailView.classList.remove('active');
    app.classList.add('news-detail-mode');
    app.classList.remove('detail-mode');
    newsDetailView.classList.add('active');
    totalEarnings = 0;
    if (earningsAmount) earningsAmount.textContent = '0';
}

function closeNewsDetail() {
    if (!app || !newsDetailView) return;
    closeDropdowns();
    closePanels();
    app.classList.remove('news-detail-mode');
    newsDetailView.classList.remove('active');
    if (libraryView) libraryView.classList.add('active');
}

// Крестики-нолики
function resetTictactoe() {
    tictactoeBoard = ['', '', '', '', '', '', '', '', ''];
    tictactoeCurrentPlayer = 'X';
    tictactoeGameOver = false;
    tictactoeActive = true;
    document.querySelectorAll('.tictactoe-cell').forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o', 'win');
    });
    updateScoreDisplay();
    if (tictactoeStatus) tictactoeStatus.textContent = translations[currentLang].yourTurn;
}

function updateScoreDisplayText() {
    const t = translations[currentLang];
    if (tictactoeScore?.textContent?.includes('ПОБЕДА') || tictactoeScore?.textContent?.includes('VICTORY')) return;
    if (tictactoeScore?.textContent?.includes('ПОРАЖЕНИЕ') || tictactoeScore?.textContent?.includes('DEFEAT')) return;
    if (tictactoeScore) tictactoeScore.textContent = `${t.scoreText} ${playerWins} ${t.scoreVs} ${botWins} ${t.scoreBot}`;
}

function updateScoreDisplay() {
    if (playerScoreEl) playerScoreEl.textContent = playerWins;
    if (botScoreEl) botScoreEl.textContent = botWins;
    updateScoreDisplayText();
}

function checkTictactoeWinner() {
    const winPatterns = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];
    for (const [a, b, c] of winPatterns) {
        if (tictactoeBoard[a] && tictactoeBoard[a] === tictactoeBoard[b] && tictactoeBoard[a] === tictactoeBoard[c]) {
            return { winner: tictactoeBoard[a], cells: [a, b, c] };
        }
    }
    if (!tictactoeBoard.includes('')) return { winner: 'draw', cells: [] };
    return null;
}

function botMove() {
    if (tictactoeGameOver || !tictactoeActive) return;
    const emptyCells = tictactoeBoard.map((v, i) => v === '' ? i : null).filter(v => v !== null);
    if (!emptyCells.length) return;
    for (const idx of emptyCells) {
        tictactoeBoard[idx] = 'O';
        const r = checkTictactoeWinner();
        if (r && r.winner === 'O') {
            makeMove(idx, 'O');
            return;
        }
        tictactoeBoard[idx] = '';
    }
    for (const idx of emptyCells) {
        tictactoeBoard[idx] = 'X';
        const r = checkTictactoeWinner();
        if (r && r.winner === 'X') {
            tictactoeBoard[idx] = 'O';
            makeMove(idx, 'O');
            return;
        }
        tictactoeBoard[idx] = '';
    }
    makeMove(emptyCells[Math.floor(Math.random() * emptyCells.length)], 'O');
}

function makeMove(index, player) {
    const t = translations[currentLang];
    tictactoeBoard[index] = player;
    const cell = document.querySelector(`.tictactoe-cell[data-index="${index}"]`);
    if (cell) {
        cell.textContent = player;
        cell.classList.add(player === 'X' ? 'x' : 'o');
    }
    const result = checkTictactoeWinner();
    if (result) {
        tictactoeGameOver = true;
        tictactoeActive = false;
        if (result.winner === 'draw') {
            if (tictactoeStatus) tictactoeStatus.textContent = t.draw;
            setTimeout(() => resetTictactoe(), 1000);
        } else if (result.winner === 'X') {
            playerWins++;
            awardTokens(15, 'tictactoe');
            updateScoreDisplay();
            result.cells.forEach(idx => {
                const c = document.querySelector(`.tictactoe-cell[data-index="${idx}"]`);
                if (c) c.classList.add('win');
            });
            if (playerWins >= WIN_SCORE) {
                if (tictactoeStatus) tictactoeStatus.textContent = t.youWin;
                if (tictactoeScore) tictactoeScore.textContent = t.victory;
                setTimeout(() => {
                    playerWins = 0;
                    botWins = 0;
                    updateScoreDisplay();
                    resetTictactoe();
                }, 3000);
            } else {
                if (tictactoeStatus) tictactoeStatus.textContent = `${t.youWinRound} (${playerWins}:${botWins})`;
                setTimeout(() => resetTictactoe(), 1500);
            }
        } else if (result.winner === 'O') {
            botWins++;
            updateScoreDisplay();
            result.cells.forEach(idx => {
                const c = document.querySelector(`.tictactoe-cell[data-index="${idx}"]`);
                if (c) c.classList.add('win');
            });
            if (botWins >= WIN_SCORE) {
                if (tictactoeStatus) tictactoeStatus.textContent = t.botWin;
                if (tictactoeScore) tictactoeScore.textContent = t.defeat;
                setTimeout(() => {
                    playerWins = 0;
                    botWins = 0;
                    updateScoreDisplay();
                    resetTictactoe();
                }, 3000);
            } else {
                if (tictactoeStatus) tictactoeStatus.textContent = `${t.botWinRound} (${playerWins}:${botWins})`;
                setTimeout(() => resetTictactoe(), 1500);
            }
        }
    }
}

// Ловля пациентов (ПОЛНЫЙ ЭКРАН)
function createCatchField() {
    const oldField = document.getElementById('catch-field');
    if (oldField) oldField.remove();
    
    const catchField = document.createElement('div');
    catchField.id = 'catch-field';
    catchField.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9998;
        cursor: crosshair;
        pointer-events: auto;
    `;
    
    document.body.appendChild(catchField);
    
    catchField.addEventListener('click', (e) => {
        if (!catchActive) return;
        
        const x = e.clientX;
        const y = e.clientY;
        
        const patients = catchField.querySelectorAll('.catch-patient');
        patients.forEach(patient => {
            const pRect = patient.getBoundingClientRect();
            const pX = pRect.left + pRect.width / 2;
            const pY = pRect.top + pRect.height / 2;
            
            const distance = Math.sqrt((x - pX) ** 2 + (y - pY) ** 2);
            if (distance < 60) {
                catchCount++;
                const countEl = document.getElementById('catch-count');
                if (countEl) countEl.textContent = catchCount;
                
                patient.style.transform = 'scale(0)';
                patient.style.opacity = '0';
                setTimeout(() => patient.remove(), 300);
                
                spawnPatient();
            }
        });
    });
    
    return catchField;
}

function spawnPatient() {
    const field = document.getElementById('catch-field');
    if (!field || !catchActive) return;
    
    const patient = document.createElement('div');
    patient.className = 'catch-patient';
    
    const size = 50 + Math.random() * 40;
    const startX = Math.random() * (window.innerWidth - size);
    const startY = Math.random() * (window.innerHeight - size);
    const speedX = (Math.random() - 0.5) * 4;
    const speedY = (Math.random() - 0.5) * 4;
    const patientNum = Math.floor(Math.random() * 4) + 1;
    
    patient.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${startX}px;
        top: ${startY}px;
        background: url('assets/kostyan${patientNum}.png') center/contain no-repeat;
        cursor: pointer;
        transition: transform 0.3s ease, opacity 0.3s ease;
        z-index: 9999;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
    `;
    
    field.appendChild(patient);
    
    let posX = startX;
    let posY = startY;
    let vx = speedX;
    let vy = speedY;
    
    const moveInterval = setInterval(() => {
        if (!catchActive || !patient.parentNode) {
            clearInterval(moveInterval);
            return;
        }
        
        posX += vx;
        posY += vy;
        
        if (posX <= 0 || posX >= window.innerWidth - size) {
            vx = -vx;
            posX = Math.max(0, Math.min(window.innerWidth - size, posX));
        }
        if (posY <= 0 || posY >= window.innerHeight - size) {
            vy = -vy;
            posY = Math.max(0, Math.min(window.innerHeight - size, posY));
        }
        
        patient.style.left = posX + 'px';
        patient.style.top = posY + 'px';
        patient.style.transform = `scaleX(${vx > 0 ? 1 : -1})`;
        
    }, 30);
}

function startCatchGame() {
    catchCount = 0;
    catchTimeLeft = 15;
    catchActive = true;
    
    const countEl = document.getElementById('catch-count');
    const timerEl = document.getElementById('catch-timer');
    const resultEl = document.getElementById('catch-result');
    const startBtn = document.getElementById('catch-start-btn');
    
    if (countEl) countEl.textContent = '0';
    if (timerEl) timerEl.textContent = '15';
    if (resultEl) resultEl.textContent = '';
    if (startBtn) startBtn.disabled = true;
    
    const field = createCatchField();
    if (field) {
        field.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            spawnPatient();
        }
    }
    
    clearInterval(catchTimer);
    catchTimer = setInterval(() => {
        catchTimeLeft--;
        const tEl = document.getElementById('catch-timer');
        if (tEl) tEl.textContent = catchTimeLeft;
        
        if (catchTimeLeft <= 0) {
            endCatchGame();
        }
    }, 1000);
}

function endCatchGame() {
    const t = translations[currentLang];
    catchActive = false;
    clearInterval(catchTimer);
    
    const startBtn = document.getElementById('catch-start-btn');
    const resultEl = document.getElementById('catch-result');
    const field = document.getElementById('catch-field');
    
    if (startBtn) startBtn.disabled = false;
    
    if (field) {
        field.style.pointerEvents = 'none';
        setTimeout(() => field.remove(), 500);
    }
    
    awardTokens(catchCount, 'catch');

    let resultText = '';
    if (catchCount >= 15) resultText = `${t.catchGreat} ${catchCount} ${t.patientsDone}`;
    else if (catchCount >= 8) resultText = `${t.catchGood} ${catchCount} ${t.patientsOk}`;
    else if (catchCount > 0) resultText = `${t.catchBad} ${catchCount} ${t.patientsBad}`;
    else resultText = t.catchNone;
    
    if (resultEl) resultEl.textContent = resultText;
}

function addMessage(type, text) {
    if (!chatBody) return;
    const msg = document.createElement('div');
    msg.className = `msg ${type}`;
    msg.innerHTML = text.replace(/\n/g, '<br>');
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
}

async function sendChat() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    
    addMessage('user', text);
    chatInput.value = '';
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'msg bot typing';
    typingIndicator.innerHTML = `${translations[currentLang].typing}<span>.</span><span>.</span><span>.</span>`;
    chatBody.appendChild(typingIndicator);
    chatBody.scrollTop = chatBody.scrollHeight;
    
    const commandResponse = executeCommand(text);
    if (commandResponse) {
        typingIndicator.remove();
        addMessage('bot', commandResponse);
        return;
    }
    
    const gameOverlay = document.getElementById('game-overlay');
    const isGameOpen = gameOverlay && gameOverlay.style.display !== 'none';
    
    if (isGameOpen) {
        typingIndicator.remove();
        addMessage('bot', tr().aiGameActive);
        return;
    }
    
    conversationHistory.push({ role: "user", content: text });

    if (!AI_CONFIG.apiKey) {
        typingIndicator.remove();
        conversationHistory.pop();
        addMessage('bot', tr().aiNoKey);
        return;
    }

    try {
        const response = await fetch(AI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                messages: conversationHistory,
                model: AI_CONFIG.model,
                max_tokens: 500,
                temperature: 0.9
            })
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${detail.slice(0, 200)}`);
        }

        const data = await response.json();
        typingIndicator.remove();
        
        let aiResponse = data.choices?.[0]?.message?.content;
        
        if (aiResponse) {
            conversationHistory.push({ role: "assistant", content: aiResponse });
            if (conversationHistory.length > 21) {
                conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-20)];
            }
            addMessage('bot', aiResponse);
            
            // Не шутим поверх команды: проверка чисто текстовая, без побочных эффектов
            const wasCommandish = cmdHas(text.toLowerCase(), [...CMD_WORDS.open, ...CMD_WORDS.close]);
            if (Math.random() < 0.15 && !wasCommandish) {
                setTimeout(() => {
                    const jokes = tr().aiJokes;
                    addMessage('bot', jokes[Math.floor(Math.random() * jokes.length)]);
                    setTimeout(() => {
                        const pranks = [flipScreen, shakeScreen, randomColorOverlay];
                        const randomPrank = pranks[Math.floor(Math.random() * pranks.length)];
                        randomPrank();
                    }, 1500);
                }, 2000);
            }
        } else {
            throw new Error('Empty response');
        }
    } catch (error) {
        console.error('AI Error:', error);
        typingIndicator.remove();
        conversationHistory.pop();
        
        const t = tr();
        let errorMessage = t.aiErrorPrefix;
        if (error.message.includes('401') || error.message.includes('403')) {
            errorMessage += t.aiErrorAuth;
        } else if (error.message.includes('404')) {
            errorMessage += `${t.aiErrorModelPrefix} "${AI_CONFIG.model}" ${t.aiErrorModel}`;
        } else if (error.message.includes('429')) {
            errorMessage += t.aiErrorLimit;
        } else {
            errorMessage += t.aiErrorGeneric;
        }
        addMessage('bot', errorMessage);
    }
}

// Обработчики событий
if (openTasksBtn) {
    openTasksBtn.onclick = (e) => {
        e.stopPropagation();
        closeDropdowns();
        openTasksPanel();
    };
}

if (closeTasksBtn) closeTasksBtn.onclick = closeTasksPanel;

if (tasksPanel) tasksPanel.addEventListener('click', e => e.stopPropagation());

document.querySelectorAll('.library-card').forEach(card => card.addEventListener('click', () => openDetail(card)));
if (backBtn) backBtn.onclick = () => closeDetail();
if (newsBackBtn) newsBackBtn.onclick = () => closeNewsDetail();

function newsImageFor(card) {
    const englishImage = card.dataset.newsImageEn;
    if (currentLang === 'en' && englishImage) return englishImage;
    return card.dataset.newsImage || 'assets/news_1.png';
}

function applyNewsImages() {
    const detailImage = document.querySelector('.ptyrka-image');
    document.querySelectorAll('.news-card').forEach(card => {
        const image = newsImageFor(card);
        card.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.26)), url('${image}')`;
        if (detailImage && card.dataset.newsKey === currentNewsKey) detailImage.src = image;
    });
}

function applyNewsDetailLanguage() {
    const t = translations[currentLang];
    applyNewsImages();
    const detailTitle = document.querySelector('.news-detail-title');
    const detailText = document.querySelector('.news-detail-text');
    const detailSecondary = document.querySelector('.news-detail-text-secondary');
    if (detailTitle && t[`${currentNewsKey}detailTitle`]) detailTitle.textContent = t[`${currentNewsKey}detailTitle`];
    if (detailText && t[`${currentNewsKey}text`]) detailText.textContent = t[`${currentNewsKey}text`];
    if (detailSecondary && t[`${currentNewsKey}secondary`]) detailSecondary.textContent = t[`${currentNewsKey}secondary`];
}

document.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = card.dataset.newsType || 'tap';

        currentNewsKey = card.dataset.newsKey || 'news1';
        applyNewsDetailLanguage();

        if (type === 'tictactoe') {
            if (newsRightTap) newsRightTap.style.display = 'none';
            if (newsRightTictactoe) newsRightTictactoe.style.display = 'flex';
            if (newsRightCatch) newsRightCatch.style.display = 'none';
            resetTictactoe();
        } else if (type === 'catch') {
            if (newsRightTap) newsRightTap.style.display = 'none';
            if (newsRightTictactoe) newsRightTictactoe.style.display = 'none';
            if (newsRightCatch) newsRightCatch.style.display = 'flex';
            catchActive = false;
            clearInterval(catchTimer);
            catchCount = 0;
            catchTimeLeft = 15;
            const countEl = document.getElementById('catch-count');
            const timerEl = document.getElementById('catch-timer');
            const resultEl = document.getElementById('catch-result');
            const startBtn = document.getElementById('catch-start-btn');
            if (countEl) countEl.textContent = '0';
            if (timerEl) timerEl.textContent = '15';
            if (resultEl) resultEl.textContent = '';
            if (startBtn) startBtn.disabled = false;
        } else {
            if (newsRightTap) newsRightTap.style.display = 'flex';
            if (newsRightTictactoe) newsRightTictactoe.style.display = 'none';
            if (newsRightCatch) newsRightCatch.style.display = 'none';
        }
        openNewsDetail();
    });
});

document.querySelectorAll('.tictactoe-cell').forEach(cell => {
    cell.addEventListener('click', () => {
        const t = translations[currentLang];
        if (tictactoeGameOver || !tictactoeActive || tictactoeCurrentPlayer !== 'X') return;
        const index = parseInt(cell.dataset.index);
        if (tictactoeBoard[index] !== '') return;
        makeMove(index, 'X');
        if (!checkTictactoeWinner()) {
            tictactoeCurrentPlayer = 'O';
            if (tictactoeStatus) tictactoeStatus.textContent = t.botThinking;
            setTimeout(() => {
                botMove();
                if (!checkTictactoeWinner()) {
                    tictactoeCurrentPlayer = 'X';
                    if (tictactoeStatus) tictactoeStatus.textContent = t.yourTurn;
                }
            }, 500);
        }
    });
});

function renderEarnings(animate) {
    const amountEl = document.getElementById('earnings-amount');
    if (!amountEl) return;
    amountEl.textContent = totalEarnings;
    if (!animate) return;
    amountEl.style.transform = 'scale(1.2)';
    setTimeout(() => { amountEl.style.transform = 'scale(1)'; }, 150);
}

if (tapButton) {
    tapButton.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.classList.add('tapped');
        setTimeout(() => this.classList.remove('tapped'), 300);
        totalEarnings += tapAmount;
        renderEarnings(true);
    };
}

if (sendMoneyBtn) {
    sendMoneyBtn.addEventListener('click', () => {
        const t = translations[currentLang];
        if (totalEarnings >= 250) {
            showNotification(`${t.thanks} ${totalEarnings} ${t.forPtyrka}`);
            awardTokens(Math.floor(totalEarnings / 10), 'tap');
            totalEarnings = 0;
            renderEarnings(false);
        } else {
            showNotification(`${t.notEnough} ${250 - totalEarnings} ${t.more}`);
        }
    });
}

const catchStartBtn = document.getElementById('catch-start-btn');
if (catchStartBtn) catchStartBtn.addEventListener('click', startCatchGame);

if (openSettingsBtn) {
    openSettingsBtn.onclick = (e) => {
        e.stopPropagation();
        closeDropdowns();
        toggleSettingsPanel();
    };
}
if (closeSettingsBtn) {
    closeSettingsBtn.onclick = () => {
        if (settingsPanel) settingsPanel.classList.remove('open');
    };
}
if (settingsPanel) settingsPanel.addEventListener('click', e => e.stopPropagation());

if (openChatBtn) {
    openChatBtn.onclick = (e) => {
        e.stopPropagation();
        closeDropdowns();
        toggleChatPanel();
    };
}
if (closeChatBtn) {
    closeChatBtn.onclick = () => {
        if (chatPanel) chatPanel.classList.remove('open');
        syncChatCornerBtn();
    };
}
if (chatPanel) chatPanel.addEventListener('click', e => e.stopPropagation());

if (sendChatBtn) {
    sendChatBtn.onclick = (e) => {
        e.preventDefault();
        sendChat();
    };
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChat();
        }
    });
}

if (coreRange) coreRange.addEventListener('input', updateCoreSlider);

launcherRadios.forEach(label => {
    const input = label.querySelector('input');
    if (!input) return;
    const sync = () => {
        launcherRadios.forEach(l => l.classList.remove('active'));
        if (input.checked) label.classList.add('active');
    };
    input.addEventListener('change', sync);
    label.addEventListener('click', () => setTimeout(sync, 0));
    sync();
});

if (addAccountBtn) {
    addAccountBtn.onclick = () => {
        window.location.href = 'index.html';
    };
}

// Проверка запущенного процесса Roblox.exe (выполняется в C# через SystemBridge)
async function isRobloxRunning() {
    if (!hasSystemAccess) return true; // в браузерной версии проверка процессов недоступна
    try {
        const result = await ipcRenderer.invoke('check-roblox');
        return Boolean(result && result.running);
    } catch (error) {
        return false;
    }
}

// Обработчик кнопки инжекта
const initialInjectBtn = getInjectBtn();
if (initialInjectBtn) {
    const newInjectBtn = initialInjectBtn.cloneNode(true);
    initialInjectBtn.parentNode.replaceChild(newInjectBtn, initialInjectBtn);

    const freshInjectBtn = getInjectBtn();
    if (freshInjectBtn) {
        freshInjectBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (injectRunning) {
                stopInjectProgress();
                injectRunning = false;
                renderInjectButton();
                return;
            }

            // Платные читы запускаются только при активной подписке
            if (!hasProductAccess(currentDetailCard)) {
                showNotification(tr().needSubscription);
                openPaymentPage(currentDetailCard);
                return;
            }

            // Игра идёт за токены: меньше 20 на балансе — сразу в мини-игры
            if (tokenStore && !tokenStore.canStart()) {
                showNotification(tr().tokensLow);
                openTokenModal();
                return;
            }

            const robloxRunning = await isRobloxRunning();
            if (!robloxRunning) {
                showNotification(tr().startRobloxFirst);
                return;
            }

            injectRunning = true;
            startInjectProgress();
            startTokenDrain();
            renderInjectButton();
        });
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeDropdowns();
        if (gameOverlay && gameOverlay.style.display !== 'none') {
            closeGame();
            return;
        }
        if (tasksPanel && tasksPanel.classList.contains('open')) {
            tasksPanel.classList.remove('open');
            return;
        }
        if (chatPanel && chatPanel.classList.contains('open')) {
            chatPanel.classList.remove('open');
            syncChatCornerBtn();
            return;
        }
        if (settingsPanel && settingsPanel.classList.contains('open')) {
            settingsPanel.classList.remove('open');
            return;
        }
        if (app && app.classList.contains('news-detail-mode')) {
            closeNewsDetail();
            return;
        }
        if (app && app.classList.contains('detail-mode')) {
            closeDetail();
        }
    }
});

// Инициализация
renderInjectButton();
updateCoreSlider();
closePanels();
renderTasks();
// ========== НАСТРОЙКИ ==========
const SETTINGS_STORAGE_KEY = 'eblox-settings';

const defaultSettings = {
    cores: 2,
    robloxDir: '',
    launcherMode: 'minimize',
    injectDelay: 3,
    injectMethod: 'auto',
    autoInject: false,
    autoReinject: true,
    language: 'ru',
    theme: 'dark',
    accent: '#70BEFF',
    uiScale: 100,
    animations: true,
    compact: false,
    showTips: true,
    music: true,
    musicVolume: 40,
    sfx: true,
    sfxVolume: 60,
    autostart: false,
    keepSession: true,
    tray: false,
    notifications: true,
    autoUpdate: true,
    updateChannel: 'stable',
    logsDir: '',
    hotkey: 'Ctrl+Shift+I',
    telemetry: false,
    hideOnline: false,
    saveChat: true,
    devtools: false,
    proxy: ''
};

let appSettings = { ...defaultSettings };

const settingsControls = {
    cores: 'core-range',
    robloxDir: 'set-roblox-dir',
    injectDelay: 'set-inject-delay',
    injectMethod: 'set-inject-method',
    autoInject: 'set-auto-inject',
    autoReinject: 'set-auto-reinject',
    language: 'set-language',
    theme: 'set-theme',
    uiScale: 'set-ui-scale',
    animations: 'set-animations',
    compact: 'set-compact',
    showTips: 'set-show-tips',
    music: 'set-music',
    musicVolume: 'set-music-volume',
    sfx: 'set-sfx',
    sfxVolume: 'set-sfx-volume',
    autostart: 'set-autostart',
    keepSession: 'set-keep-session',
    tray: 'set-tray',
    notifications: 'set-notifications',
    autoUpdate: 'set-auto-update',
    updateChannel: 'set-update-channel',
    logsDir: 'set-logs-dir',
    hotkey: 'set-hotkey',
    telemetry: 'set-telemetry',
    hideOnline: 'set-hide-online',
    saveChat: 'set-save-chat',
    devtools: 'set-devtools',
    proxy: 'set-proxy'
};

const settingsBridge = window.EbloxBridge || null;
const backgroundAudio = document.querySelector('audio');

function readLocalSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    } catch (error) {
        return {};
    }
}

async function loadSettings() {
    let stored = readLocalSettings();
    if (settingsBridge && typeof settingsBridge.invoke === 'function') {
        try {
            const remote = await settingsBridge.invoke('load-settings');
            if (remote && typeof remote === 'object') stored = { ...stored, ...remote };
        } catch (error) {
            stored = readLocalSettings();
        }
    }
    appSettings = { ...defaultSettings, ...stored };
    appSettings.language = localStorage.getItem('eblox-language') || appSettings.language;
}

async function persistSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
    if (settingsBridge && typeof settingsBridge.invoke === 'function') {
        try {
            await settingsBridge.invoke('save-settings', appSettings);
        } catch (error) {
            return;
        }
    }
}

function fillSettingsForm() {
    Object.entries(settingsControls).forEach(([key, id]) => {
        const control = document.getElementById(id);
        if (!control) return;
        if (control.type === 'checkbox') control.checked = Boolean(appSettings[key]);
        else control.value = appSettings[key];
    });

    const launcherInput = document.querySelector(`input[name="launcher-mode"][value="${appSettings.launcherMode}"]`);
    if (launcherInput) launcherInput.checked = true;

    document.querySelectorAll('.accent-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.accent === appSettings.accent);
    });

    if (typeof window.syncCustomSelects === 'function') window.syncCustomSelects();

    updateRangeLabels();
}

function updateRangeLabels() {
    const delayValue = document.getElementById('set-inject-delay-value');
    if (delayValue) delayValue.textContent = `${appSettings.injectDelay}`;
    const scaleValue = document.getElementById('set-ui-scale-value');
    if (scaleValue) scaleValue.textContent = `${appSettings.uiScale}%`;
    const musicValue = document.getElementById('set-music-volume-value');
    if (musicValue) musicValue.textContent = `${appSettings.musicVolume}%`;
    const sfxValue = document.getElementById('set-sfx-volume-value');
    if (sfxValue) sfxValue.textContent = `${appSettings.sfxVolume}%`;
}

function applySettings() {
    document.documentElement.style.setProperty('--accent', appSettings.accent);
    document.documentElement.style.fontSize = `${16 * appSettings.uiScale / 100}px`;
    document.body.classList.toggle('no-animations', !appSettings.animations);
    document.body.classList.toggle('compact', appSettings.compact);
    document.body.classList.remove('theme-dark', 'theme-midnight', 'theme-contrast');
    document.body.classList.add(`theme-${appSettings.theme}`);

    if (backgroundAudio) {
        backgroundAudio.volume = appSettings.musicVolume / 100;
        if (appSettings.music) backgroundAudio.play().catch(() => {});
        else backgroundAudio.pause();
    }

    document.querySelectorAll('[title]').forEach(element => {
        if (!appSettings.showTips) {
            element.dataset.tip = element.title;
            element.title = '';
        } else if (element.dataset.tip) {
            element.title = element.dataset.tip;
        }
    });

    updateRangeLabels();
}

function collectSettings() {
    Object.entries(settingsControls).forEach(([key, id]) => {
        const control = document.getElementById(id);
        if (!control) return;
        if (control.type === 'checkbox') appSettings[key] = control.checked;
        else if (control.type === 'range' || control.type === 'number') appSettings[key] = Number(control.value);
        else appSettings[key] = control.value;
    });

    const launcherInput = document.querySelector('input[name="launcher-mode"]:checked');
    if (launcherInput) appSettings.launcherMode = launcherInput.value;
}

function showSettingsToast(message) {
    const toast = document.createElement('div');
    toast.className = 'settings-toast';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#0B1016;border:1px solid #232B3A;color:#FFFFFF;padding:11px 18px;border-radius:12px;font-size:13px;z-index:9999;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
}

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.settings-tab').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
        tab.classList.add('active');
        const section = document.querySelector(`.settings-section[data-section="${tab.dataset.tab}"]`);
        if (section) section.classList.add('active');
    };
});

document.querySelectorAll('.accent-dot').forEach(dot => {
    dot.onclick = () => {
        document.querySelectorAll('.accent-dot').forEach(item => item.classList.remove('active'));
        dot.classList.add('active');
        appSettings.accent = dot.dataset.accent;
        applySettings();
    };
});

['set-inject-delay', 'set-ui-scale', 'set-music-volume', 'set-sfx-volume'].forEach(id => {
    const control = document.getElementById(id);
    if (!control) return;
    control.oninput = () => {
        collectSettings();
        applySettings();
    };
});

const themeSelect = document.getElementById('set-theme');
if (themeSelect) themeSelect.onchange = () => {
    appSettings.theme = themeSelect.value;
    applySettings();
};

const languageSelectControl = document.getElementById('set-language');
if (languageSelectControl) languageSelectControl.onchange = () => {
    appSettings.language = languageSelectControl.value;
    applyLanguage(appSettings.language);
};

const musicSwitch = document.getElementById('set-music');
if (musicSwitch) musicSwitch.onchange = () => {
    appSettings.music = musicSwitch.checked;
    applySettings();
};

const applySettingsBtn = document.getElementById('settings-apply');
if (applySettingsBtn) applySettingsBtn.onclick = async () => {
    collectSettings();
    applySettings();
    applyLanguage(appSettings.language);
    await persistSettings();
    showSettingsToast(translations[currentLang].settingsSaved);
};

const resetSettingsBtn = document.getElementById('settings-reset');
if (resetSettingsBtn) resetSettingsBtn.onclick = async () => {
    appSettings = { ...defaultSettings };
    fillSettingsForm();
    applySettings();
    applyLanguage(appSettings.language);
    await persistSettings();
    showSettingsToast(translations[currentLang].settingsReset);
};

if (addAccountBtn) addAccountBtn.onclick = async () => {
    localStorage.removeItem('eblox_current_user');
    if (settingsBridge && typeof settingsBridge.send === 'function') settingsBridge.send('logout');
    else window.location.href = 'index.html';
};

loadSettings().then(() => {
    fillSettingsForm();
    applySettings();
    applyLanguage(appSettings.language);
});

function activateSettingsTab(name) {
    document.querySelectorAll('.settings-tab').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.settings-section').forEach(section => section.classList.remove('active'));
    const tab = document.querySelector(`.settings-tab[data-tab="${name}"]`);
    const section = document.querySelector(`.settings-section[data-section="${name}"]`);
    if (tab) tab.classList.add('active');
    if (section) section.classList.add('active');
    const body = document.querySelector('.settings-body');
    if (body) body.scrollTop = 0;
}

function readAccountSessionMeta() {
    try {
        const raw = localStorage.getItem('eblox_session_meta');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function renderAccountSection() {
    const t = translations[currentLang];
    if (!t) return;
    const login = currentUser || localStorage.getItem('eblox_current_user') || '';
    const display = login || t.accountGuest;
    const totalTasks = Object.keys(xpSystem.tasks).length;
    const doneTasks = xpSystem.completedCount();
    const nameLabel = document.getElementById('account-card-name');
    const levelLabel = document.getElementById('account-card-level');
    const loginInput = document.getElementById('set-account-login');
    const progressFill = document.getElementById('account-settings-progress-fill');
    const progressLabel = document.getElementById('account-settings-progress-label');
    const xpLabel = document.getElementById('account-xp-label');
    const sessionLabel = document.getElementById('account-session-label');
    if (nameLabel) nameLabel.textContent = display;
    if (levelLabel) levelLabel.textContent = `${t.levelWord} ${xpSystem.level}`;
    if (loginInput) loginInput.value = display;
    if (progressFill) progressFill.style.width = totalTasks ? `${Math.round(doneTasks / totalTasks * 100)}%` : '0%';
    if (progressLabel) progressLabel.textContent = `${doneTasks}/${totalTasks} ${t.tasksDone}`;
    if (xpLabel) xpLabel.textContent = `${xpSystem.xp} ${t.accountXpWord}`;
    if (sessionLabel) {
        const meta = readAccountSessionMeta();
        const createdAt = meta && meta.createdAt ? Number(meta.createdAt) : 0;
        const locale = currentLang === 'en' ? 'en-US' : 'ru-RU';
        sessionLabel.textContent = createdAt ? `${t.accountSessionSince}: ${new Date(createdAt).toLocaleString(locale)}` : t.accountSessionEmpty;
    }
}

function openAccountSettings() {
    closeDropdowns();
    if (!settingsPanel) return;
    if (chatPanel) chatPanel.classList.remove('open');
    if (tasksPanel) tasksPanel.classList.remove('open');
    settingsPanel.classList.add('open');
    renderAccountSection();
    activateSettingsTab('account');
}

const accountOpenSettingsBtn = document.getElementById('account-open-settings');
if (accountOpenSettingsBtn) accountOpenSettingsBtn.onclick = (event) => {
    event.stopPropagation();
    openAccountSettings();
};

const accountSettingsTab = document.querySelector('.settings-tab[data-tab="account"]');
if (accountSettingsTab) accountSettingsTab.addEventListener('click', renderAccountSection);

const accountTasksBtn = document.getElementById('account-tasks-btn');
if (accountTasksBtn) accountTasksBtn.onclick = openTasksPanel;

const accountLogoutBtn = document.getElementById('account-logout-btn');
if (accountLogoutBtn) accountLogoutBtn.onclick = () => {
    localStorage.removeItem('eblox_current_user');
    if (settingsBridge && typeof settingsBridge.send === 'function') settingsBridge.send('logout');
    else window.location.href = 'index.html';
};

renderAccountSection();

const accountBridge = window.EbloxBridge;
const accountLoginInput = document.getElementById('set-new-login');
const accountLoginPasswordInput = document.getElementById('set-login-password');
const accountLoginSaveBtn = document.getElementById('account-login-save');
const accountLoginStatus = document.getElementById('account-login-status');
const accountCurrentPasswordInput = document.getElementById('set-current-password');
const accountNewPasswordInput = document.getElementById('set-new-password');
const accountRepeatPasswordInput = document.getElementById('set-new-password-repeat');
const accountPasswordRequestBtn = document.getElementById('account-password-request');
const accountCodeRow = document.getElementById('account-code-row');
const accountCodeInput = document.getElementById('set-account-code');
const accountCodeConfirmBtn = document.getElementById('account-code-confirm');
const accountCodeResendBtn = document.getElementById('account-code-resend');
const accountPasswordStatus = document.getElementById('account-password-status');

let accountPendingPassword = null;
let accountFlow = 'login';

const accountText = (key) => (translations[currentLang] && translations[currentLang][key]) || key;

const accountCurrentLogin = () => (accountBridge && accountBridge.getSession()) || (typeof currentUser === 'string' ? currentUser : '');

const setAccountStatus = (element, message, kind) => {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('is-error', 'is-ok');
    if (kind) element.classList.add(kind);
};

if (accountLoginSaveBtn) accountLoginSaveBtn.onclick = () => {
    const nextLogin = accountLoginInput ? accountLoginInput.value.trim() : '';
    const password = accountLoginPasswordInput ? accountLoginPasswordInput.value : '';
    if (!nextLogin || !password) {
        setAccountStatus(accountLoginStatus, accountText('accountFillFields'), 'is-error');
        return;
    }
    if (nextLogin === accountCurrentLogin()) {
        setAccountStatus(accountLoginStatus, accountText('accountSameLogin'), 'is-error');
        return;
    }
    accountFlow = 'login';
    setAccountStatus(accountLoginStatus, '', null);
    accountBridge.send('account-login-change', { login: accountCurrentLogin(), newLogin: nextLogin, password: password });
};

if (accountPasswordRequestBtn) accountPasswordRequestBtn.onclick = () => {
    const currentPassword = accountCurrentPasswordInput ? accountCurrentPasswordInput.value : '';
    const newPassword = accountNewPasswordInput ? accountNewPasswordInput.value : '';
    const repeatPassword = accountRepeatPasswordInput ? accountRepeatPasswordInput.value : '';
    if (!currentPassword || !newPassword || !repeatPassword) {
        setAccountStatus(accountPasswordStatus, accountText('accountFillFields'), 'is-error');
        return;
    }
    if (newPassword.length < 6) {
        setAccountStatus(accountPasswordStatus, accountText('accountPasswordShort'), 'is-error');
        return;
    }
    if (newPassword !== repeatPassword) {
        setAccountStatus(accountPasswordStatus, accountText('accountPasswordMismatch'), 'is-error');
        return;
    }
    accountFlow = 'password';
    accountPendingPassword = newPassword;
    accountBridge.send('account-password-request', { login: accountCurrentLogin(), currentPassword: currentPassword });
};

if (accountCodeConfirmBtn) accountCodeConfirmBtn.onclick = () => {
    const code = accountCodeInput ? accountCodeInput.value.trim() : '';
    if (!code || !accountPendingPassword) {
        setAccountStatus(accountPasswordStatus, accountText('accountFillFields'), 'is-error');
        return;
    }
    accountFlow = 'password';
    accountBridge.send('account-password-confirm', { code: code, newPassword: accountPendingPassword });
};

if (accountCodeResendBtn) accountCodeResendBtn.onclick = () => {
    accountFlow = 'password';
    accountBridge.send('account-password-resend');
};

if (accountBridge) {
    accountBridge.on('account-code-sent', () => {
        if (accountCodeRow) accountCodeRow.classList.add('active');
        setAccountStatus(accountPasswordStatus, accountText('accountCodeSent'), 'is-ok');
    });

    accountBridge.on('account-fail', (event, message) => {
        const target = accountFlow === 'login' ? accountLoginStatus : accountPasswordStatus;
        setAccountStatus(target, message, 'is-error');
    });
}

if (accountBridge) {
    accountBridge.on('account-login-changed', (event, nextLogin) => {
        setAccountStatus(accountLoginStatus, accountText('accountLoginChanged'), 'is-ok');
        if (accountLoginInput) accountLoginInput.value = '';
        if (accountLoginPasswordInput) accountLoginPasswordInput.value = '';
        window.setTimeout(() => {
            window.location.href = `main.html?user=${encodeURIComponent(nextLogin)}`;
        }, 700);
    });

    accountBridge.on('account-password-changed', () => {
        accountPendingPassword = null;
        if (accountCodeRow) accountCodeRow.classList.remove('active');
        if (accountCurrentPasswordInput) accountCurrentPasswordInput.value = '';
        if (accountNewPasswordInput) accountNewPasswordInput.value = '';
        if (accountRepeatPasswordInput) accountRepeatPasswordInput.value = '';
        if (accountCodeInput) accountCodeInput.value = '';
        setAccountStatus(accountPasswordStatus, accountText('accountPasswordChanged'), 'is-ok');
    });
}

// ==========================================================
// ИГРОВЫЕ ТОКЕНЫ: 10 токенов = 1 минута игры с читом
// Модуль-хранилище — eblox-tokens.js (window.EbloxTokens)
// ==========================================================

const tokenStore = window.EbloxTokens || null;

// applyLanguage() отрабатывает раньше, чем инициализируется этот блок,
// поэтому перерисовку включаем только после его готовности.
// var, а не const — его можно безопасно прочитать до объявления.
var tokensControllerReady = false;

// Мини-игры в новостных карточках открываются по data-news-type,
// «Кобукорм vs Дроны» — отдельная страница (href)
const TOKEN_GAMES = [
    { type: 'tap', nameKey: 'gameTap', rewardKey: 'gameTapReward' },
    { type: 'tictactoe', nameKey: 'gameTictactoe', rewardKey: 'gameTictactoeReward' },
    { type: 'catch', nameKey: 'gameCatch', rewardKey: 'gameCatchReward' },
    { href: 'game/game.html', nameKey: 'gameShooter', rewardKey: 'gameShooterReward' },
    { href: 'game/snake.html', nameKey: 'gameSnake', rewardKey: 'gameSnakeReward' },
    { href: 'game/memory.html', nameKey: 'gameMemory', rewardKey: 'gameMemoryReward' }
];

const tokensOverlay = document.getElementById('tokens-overlay');
const tokensPill = document.getElementById('tokens-pill');
const tokensPillValue = document.getElementById('tokens-pill-value');
const tokensPillTime = document.getElementById('tokens-pill-time');
const tokensModalBalance = document.getElementById('tokens-modal-balance');
const tokensModalCaption = document.getElementById('tokens-modal-caption');
const tokensModalHint = document.getElementById('tokens-modal-hint');
const tokensGamesBox = document.getElementById('tokens-games');
const tokensCloseBtn = document.getElementById('tokens-close');

function tokenBalance() {
    return tokenStore ? tokenStore.readBalance() : 0;
}

// Начисление с уведомлением — единая точка для всех мини-игр
function awardTokens(amount, reason) {
    if (!tokenStore || amount <= 0) return;
    tokenStore.earn(amount, reason);
    showNotification(`${tr().tokensEarned} +${Math.floor(amount)}`);
}

function renderTokenBalance() {
    if (!tokenStore) return;
    const t = tr();
    const balance = tokenStore.readBalance();
    const time = tokenStore.formatTime(tokenStore.secondsLeft(balance));

    if (tokensPillValue) tokensPillValue.textContent = balance;
    if (tokensPillTime) tokensPillTime.textContent = time;
    if (tokensPill) tokensPill.classList.toggle('low', balance < tokenStore.START_MIN_TOKENS);

    if (tokensModalBalance) tokensModalBalance.textContent = balance;
    if (tokensModalCaption) {
        const minutes = Math.floor(balance / tokenStore.TOKENS_PER_MINUTE);
        tokensModalCaption.textContent = `${balance} ${t.tokensBalance} · ${minutes} ${t.tokensMinutes}`;
    }
    if (tokensModalHint) {
        const low = balance < tokenStore.START_MIN_TOKENS;
        tokensModalHint.textContent = low ? t.tokensLow : t.tokensEnough;
        tokensModalHint.classList.toggle('warn', low);
    }

    const accountTokensLabel = document.getElementById('account-tokens-label');
    if (accountTokensLabel) accountTokensLabel.textContent = `${balance} ${t.tokensBalance}`;
}

function renderTokenModal() {
    if (!tokenStore || !tokensGamesBox) return;
    const t = tr();

    tokensGamesBox.innerHTML = '';
    TOKEN_GAMES.forEach(game => {
        // Новостная карточка нужна только играм, встроенным в лаунчер
        const card = game.href ? null : document.querySelector(`.news-card[data-news-type="${game.type}"]`);
        if (!game.href && !card) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tokens-game';
        button.innerHTML = `<span class="tokens-game-name"></span><span class="tokens-game-reward"></span>`;
        button.querySelector('.tokens-game-name').textContent = t[game.nameKey];
        button.querySelector('.tokens-game-reward').textContent = t[game.rewardKey];
        button.addEventListener('click', () => {
            closeTokenModal();
            if (game.href) openGamePage(game.href);
            else card.click();
        });
        tokensGamesBox.appendChild(button);
    });
}

// Игра на отдельной странице: back — путь относительно неё самой (она лежит в game/).
// Логин тащим с собой, иначе после возврата пропадёт имя аккаунта.
function openGamePage(href) {
    const backPath = currentUser ? `../main.html?user=${encodeURIComponent(currentUser)}` : '../main.html';
    const params = new URLSearchParams({
        lang: currentLang,
        back: backPath
    });
    window.location.href = `${href}?${params.toString()}`;
}

// Смена языка: пилюля перерисовывается всегда, окно — только если открыто
function syncTokensLanguage() {
    if (!tokensControllerReady) return;
    renderTokenBalance();
    if (tokensOverlay && tokensOverlay.style.display !== 'none') renderTokenModal();
}

function openTokenModal() {
    if (!tokensOverlay) return;
    closePanels();
    closeDropdowns();
    renderTokenModal();
    renderTokenBalance();
    tokensOverlay.style.display = 'flex';
}

function closeTokenModal() {
    if (tokensOverlay) tokensOverlay.style.display = 'none';
}

if (tokensPill) tokensPill.addEventListener('click', openTokenModal);
if (tokensCloseBtn) tokensCloseBtn.addEventListener('click', closeTokenModal);
if (tokensOverlay) {
    tokensOverlay.addEventListener('click', (e) => {
        if (e.target === tokensOverlay) closeTokenModal();
    });
}

const accountTokensBtn = document.getElementById('account-tokens-btn');
if (accountTokensBtn) accountTokensBtn.addEventListener('click', openTokenModal);

if (tokenStore) {
    tokenStore.onChange(renderTokenBalance);
    renderTokenBalance();
}
tokensControllerReady = true;

// ==========================================================
// ПОДПИСКИ И ДОСТУП К ПЛАТНЫМ ЧИТАМ (интеграция с ЫPay)
// pricingRules и LICENSE_STORAGE_KEY объявлены в начале файла
// ==========================================================

function readLicenses() {
    if (pricingRules) return pricingRules.readLicenses();
    try {
        const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getLicense(productId) {
    if (!productId) return null;
    const license = readLicenses()[productId];
    if (!license) return null;
    return Number(license.expiresAt) > Date.now() ? license : null;
}

function cardProductId(card) {
    return (card && card.dataset.product) || '';
}

// Цена до скидки — то, что записано в data-price
function cardBasePrice(card) {
    return Number((card && card.dataset.price) || 0);
}

// Цена к оплате: у владельцев ebloX Inclusive остальные читы дешевле на 10%
function cardPrice(card) {
    const base = cardBasePrice(card);
    return pricingRules ? pricingRules.finalPrice(cardProductId(card), base) : base;
}

function cardDiscount(card) {
    const base = cardBasePrice(card);
    return pricingRules ? pricingRules.discountAmount(cardProductId(card), base) : 0;
}

function hasProductAccess(card) {
    if (!card) return true;
    if (cardPrice(card) === 0) return true;
    return Boolean(getLicense(cardProductId(card)));
}

function formatPriceValue(value) {
    return `${value.toLocaleString(currentLang === 'en' ? 'en-US' : 'ru-RU')} ₽`;
}

function licenseDaysLeft(license) {
    return Math.max(1, Math.ceil((Number(license.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)));
}

function renderPriceLabels() {
    const t = translations[currentLang] || {};
    document.querySelectorAll('.library-card').forEach(card => {
        const label = card.querySelector('[data-price-label]');
        if (!label) return;
        const price = cardPrice(card);
        const license = getLicense(cardProductId(card));
        label.classList.toggle('free', price === 0);
        label.classList.toggle('paid', price > 0 && !license);
        label.classList.toggle('owned', Boolean(license));
        const discounted = cardDiscount(card) > 0;
        if (price === 0) label.textContent = t.priceFree || 'Бесплатно';
        else if (license) label.textContent = t.priceOwned || 'Подписка активна';
        else if (discounted) label.textContent = `${formatPriceValue(cardBasePrice(card))} → ${formatPriceValue(price)}${t.perMonth || '/мес.'}`;
        else label.textContent = `${formatPriceValue(price)}${t.perMonth || '/мес.'}`;
        label.classList.toggle('discounted', discounted && !license);
        card.classList.toggle('locked', price > 0 && !license);
    });
}

function openPaymentPage(card) {
    if (!card) return;
    const params = new URLSearchParams({
        product: cardProductId(card),
        name: card.dataset.title || '',
        // передаём цену БЕЗ скидки — ЫPay сам пересчитает её по тем же правилам
        price: String(cardBasePrice(card)),
        lang: currentLang,
        back: 'main.html'
    });
    window.location.href = `ypay.html?${params.toString()}`;
}

function renderProductAccess(card) {
    const t = translations[currentLang] || {};
    const price = cardPrice(card);
    const license = getLicense(cardProductId(card));
    const unlocked = price === 0 || Boolean(license);

    const buyBtn = document.getElementById('buy-btn');
    const buyText = document.getElementById('buy-text');
    const buyPrice = document.getElementById('buy-price');
    if (buyBtn) {
        if (price === 0) {
            buyBtn.style.display = 'none';
        } else {
            buyBtn.style.display = 'flex';
            if (buyText) buyText.textContent = license ? (t.buyAgain || 'Продлить') : (t.buy || 'Купить');
            if (buyPrice) buyPrice.textContent = `${formatPriceValue(price)}${t.perMonth || '/мес.'}`;
            buyBtn.classList.toggle('discounted', cardDiscount(card) > 0);
        }
    }

    const injectButton = document.getElementById('inject-btn');
    if (injectButton) {
        injectButton.classList.toggle('locked', !unlocked);
        injectButton.title = unlocked ? '' : (t.needSubscription || '');
    }

    const licenseBox = document.getElementById('detail-license');
    if (licenseBox) {
        licenseBox.classList.remove('active', 'locked');
        if (price === 0) {
            licenseBox.textContent = t.licenseFree || '';
        } else if (license) {
            licenseBox.classList.add('active');
            licenseBox.textContent = `${t.licenseActive || 'Подписка активна ещё'} ${licenseDaysLeft(license)} ${t.licenseDays || 'дн.'}`;
        } else {
            licenseBox.classList.add('locked');
            const priceText = `${formatPriceValue(price)}${t.perMonth || '/мес.'}`;
            licenseBox.textContent = cardDiscount(card) > 0
                ? `${t.licenseLocked || 'Чит доступен по подписке'} — ${priceText} · ${t.inclusiveDiscount || 'скидка 10% за ebloX Inclusive'}`
                : `${t.licenseLocked || 'Чит доступен по подписке'} — ${priceText}`;
        }
    }
}

const buyButtonEl = document.getElementById('buy-btn');
if (buyButtonEl) {
    buyButtonEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPaymentPage(currentDetailCard);
    });
}

// Возврат из ЫPay: ?paid=<product> — какая подписка только что оплачена
function handlePaymentReturn() {
    const query = new URLSearchParams(window.location.search);
    const paid = query.get('paid');
    renderPriceLabels();

    if (!paid) return;

    const t = translations[currentLang] || {};
    const card = document.querySelector(`.library-card[data-product="${paid}"]`);
    try {
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        // игнорируем, если history недоступен
    }
    if (card) {
        openDetail(card);
        if (getLicense(paid)) showNotification(t.paidSuccess || 'Подписка оформлена');
    }

    // Покупка Inclusive удешевляет остальные читы — сообщаем об этом
    if (paid === 'eblox-inclusive' && getLicense(paid)) {
        setTimeout(() => showNotification(t.inclusiveDiscountOn || 'ebloX Inclusive активен: −10% на все остальные читы'), 2600);
    }
}

handlePaymentReturn();

// Возврат из игры на отдельной странице: ?earnedTokens=<начислено за забеги>
// Токены уже лежат в хранилище — здесь только уведомление
function handleGameReturn() {
    const query = new URLSearchParams(window.location.search);
    const earned = Math.floor(Number(query.get('earnedTokens')));

    if (!earned || earned <= 0) return;

    try {
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        // игнорируем, если history недоступен
    }

    showNotification(`${tr().tokensEarned} +${earned}`);
}

handleGameReturn();
