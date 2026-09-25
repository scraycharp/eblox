// ==========================================================
// ЫPay — внутренняя "банковская система" ebloX
// Обрабатывает оплату подписки на платные читы.
// ==========================================================

const LICENSE_STORAGE_KEY = window.EbloxPricing ? window.EbloxPricing.LICENSE_STORAGE_KEY : 'eblox-licenses';
const PAYMENTS_STORAGE_KEY = 'eblox-payments';
const SUBSCRIPTION_DAYS = 30;

const PRODUCTS = {
    'liteway': { name: 'Liteway', price: 0 },
    'debute': { name: 'Debute', price: 500 },
    'eblox-inclusive': { name: 'ebloX Inclusive', price: 1300 }
};

const i18n = {
    ru: {
        back: 'Назад в ebloX',
        secure: 'Защищённая оплата подписки',
        orderTitle: 'Ваш заказ',
        formTitle: 'Данные карты',
        product: 'Товар',
        period: 'Период',
        month1: '1 месяц',
        merchant: 'Получатель',
        total: 'К оплате',
        perMonth: 'за 1 месяц',
        subtotal: 'Стоимость',
        discount: 'Скидка',
        note: 'Подписка активируется сразу после подтверждения платежа и действует 30 дней.',
        trustNoAuto: 'Без автопродления — списание только сейчас',
        trustNoFee: 'Без скрытых комиссий',
        trustSecure: 'Данные карты не сохраняются',
        cardNumber: 'Номер карты',
        holder: 'Держатель',
        holderFull: 'Держатель карты',
        validThru: 'Срок',
        validThruFull: 'Срок действия',
        helpNumber: '16 цифр с лицевой стороны карты',
        helpCvc: '3 цифры на обороте',
        payNow: 'Оплатить',
        secureHint: 'Платёж защищён протоколом ЫSecure 3.0',
        errNumber: 'Введите корректный номер карты (16 цифр)',
        errHolder: 'Укажите имя держателя карты',
        errExp: 'Неверный срок действия карты',
        errExpired: 'Срок действия карты истёк',
        errCvc: 'CVC должен содержать 3 цифры',
        errDeclined: 'Банк отклонил операцию. Проверьте данные карты.',
        processing: 'Обработка платежа...',
        processingSub: 'Не закрывайте окно',
        confirming: 'Подтверждение в ЫSecure 3.0...',
        confirmingSub: 'Связь с банком-эмитентом',
        success: 'Оплата прошла успешно',
        successSub: 'Возвращаем в ebloX...',
        free: 'Этот чит бесплатный'
    },
    en: {
        back: 'Back to ebloX',
        secure: 'Secure subscription payment',
        orderTitle: 'Your order',
        formTitle: 'Card details',
        product: 'Product',
        period: 'Period',
        month1: '1 month',
        merchant: 'Merchant',
        total: 'Total',
        perMonth: 'per 1 month',
        subtotal: 'Subtotal',
        discount: 'Discount',
        note: 'The subscription is activated right after the payment is confirmed and lasts 30 days.',
        trustNoAuto: 'No auto-renewal — charged once, right now',
        trustNoFee: 'No hidden fees',
        trustSecure: 'Card data is never stored',
        cardNumber: 'Card number',
        holder: 'Holder',
        holderFull: 'Card holder',
        validThru: 'Valid thru',
        validThruFull: 'Expiry date',
        helpNumber: '16 digits on the front of the card',
        helpCvc: '3 digits on the back',
        payNow: 'Pay',
        secureHint: 'Payment protected by ЫSecure 3.0',
        errNumber: 'Enter a valid card number (16 digits)',
        errHolder: 'Enter the card holder name',
        errExp: 'Invalid expiry date',
        errExpired: 'The card has expired',
        errCvc: 'CVC must contain 3 digits',
        errDeclined: 'The bank declined the operation. Check your card details.',
        processing: 'Processing payment...',
        processingSub: 'Do not close the window',
        confirming: 'Confirming with ЫSecure 3.0...',
        confirmingSub: 'Contacting the issuing bank',
        success: 'Payment successful',
        successSub: 'Returning to ebloX...',
        free: 'This cheat is free'
    }
};

const params = new URLSearchParams(window.location.search);
const backUrl = params.get('back') || 'main.html';

const productId = params.get('product') || '';
const product = PRODUCTS[productId] || null;

const lang = (params.get('lang') || localStorage.getItem('eblox-language') || 'ru') === 'en' ? 'en' : 'ru';
const t = i18n[lang];

const productName = params.get('name') || (product ? product.name : '—');

const basePrice = Number(params.get('price') || (product ? product.price : 0));

// ---------- Скидка 10% для владельцев ebloX Inclusive ----------
const pricing = window.EbloxPricing || null;
const price = pricing ? pricing.finalPrice(productId, basePrice) : basePrice;
const discount = pricing ? pricing.discountAmount(productId, basePrice) : 0;
const hasDiscount = discount > 0;

// ---------- Локализация статики ----------
document.documentElement.lang = lang;
document.querySelectorAll('[data-i18n]').forEach(el => {
    const value = t[el.dataset.i18n];
    if (value) el.textContent = value;
});

// ---------- Заказ ----------
const formatSum = (value) => `${value.toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU')} ₽`;

document.getElementById('order-product').textContent = productName;
document.getElementById('order-total').textContent = formatSum(price);
document.getElementById('pay-submit-sum').textContent = formatSum(price);

if (hasDiscount) {
    const rate = Math.round((discount / basePrice) * 100);
    document.getElementById('order-subtotal').textContent = formatSum(basePrice);
    document.getElementById('order-discount').textContent = `−${formatSum(discount)}`;
    document.getElementById('order-discount-badge').textContent = `−${rate}%`;
    document.getElementById('order-subtotal-row').hidden = false;
    document.getElementById('order-discount-row').hidden = false;
}

// ---------- Окно ----------
const bridge = window.EbloxBridge;
const sendWindow = (channel) => { if (bridge) bridge.send(channel); };

document.getElementById('btn-minimize').onclick = () => sendWindow('window-minimize');
document.getElementById('btn-maximize').onclick = () => sendWindow('window-maximize');
document.getElementById('btn-close').onclick = () => sendWindow('window-close');

const goBack = (paidProduct) => {
    const query = paidProduct ? `?paid=${encodeURIComponent(paidProduct)}` : '';
    window.location.href = `${backUrl}${query}`;
};

document.getElementById('pay-back').onclick = () => goBack(null);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') goBack(null); });

// ---------- Поля карты ----------
const numberInput = document.getElementById('card-number');
const holderInput = document.getElementById('card-holder');
const expInput = document.getElementById('card-exp');
const cvcInput = document.getElementById('card-cvc');
const errorBox = document.getElementById('pay-error');
const submitBtn = document.getElementById('pay-submit');

const numberPreview = document.getElementById('card-number-preview');
const holderPreview = document.getElementById('card-holder-preview');
const expPreview = document.getElementById('card-exp-preview');
const typePreview = document.getElementById('card-type');

const digitsOnly = (value) => value.replace(/\D/g, '');

const detectCardType = (digits) => {
    if (/^4/.test(digits)) return 'VISA';
    if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
    if (/^2(2[2-9]|[3-7])/.test(digits)) return 'МИР';
    if (/^3[47]/.test(digits)) return 'AMEX';
    return 'CARD';
};

numberInput.addEventListener('input', () => {
    const digits = digitsOnly(numberInput.value).slice(0, 16);
    numberInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
    numberInput.classList.remove('invalid');

    const masked = (digits + '•'.repeat(16 - digits.length)).replace(/(.{4})/g, '$1 ').trim();
    numberPreview.textContent = masked;
    typePreview.textContent = detectCardType(digits);
});

holderInput.addEventListener('input', () => {
    holderInput.value = holderInput.value.replace(/[^a-zA-Zа-яА-ЯёЁ .-]/g, '').toUpperCase();
    holderInput.classList.remove('invalid');
    holderPreview.textContent = holderInput.value.trim() || 'CARD HOLDER';
});

expInput.addEventListener('input', () => {
    const digits = digitsOnly(expInput.value).slice(0, 4);
    expInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    expInput.classList.remove('invalid');
    expPreview.textContent = expInput.value || 'MM/YY';
});

cvcInput.addEventListener('input', () => {
    cvcInput.value = digitsOnly(cvcInput.value).slice(0, 3);
    cvcInput.classList.remove('invalid');
});

// ---------- Валидация ----------
const luhnValid = (digits) => {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let value = Number(digits[i]);
        if (double) {
            value *= 2;
            if (value > 9) value -= 9;
        }
        sum += value;
        double = !double;
    }
    return digits.length > 0 && sum % 10 === 0;
};

const showError = (message, field) => {
    errorBox.textContent = message;
    if (field) {
        field.classList.add('invalid');
        field.focus();
    }
};

const validate = () => {
    errorBox.textContent = '';

    const digits = digitsOnly(numberInput.value);
    if (digits.length !== 16 || !luhnValid(digits)) {
        showError(t.errNumber, numberInput);
        return false;
    }

    if (holderInput.value.trim().length < 3) {
        showError(t.errHolder, holderInput);
        return false;
    }

    const expDigits = digitsOnly(expInput.value);
    if (expDigits.length !== 4) {
        showError(t.errExp, expInput);
        return false;
    }

    const month = Number(expDigits.slice(0, 2));
    const year = 2000 + Number(expDigits.slice(2));
    if (month < 1 || month > 12) {
        showError(t.errExp, expInput);
        return false;
    }

    const expiry = new Date(year, month, 0, 23, 59, 59);
    if (expiry.getTime() < Date.now()) {
        showError(t.errExpired, expInput);
        return false;
    }

    if (cvcInput.value.length !== 3) {
        showError(t.errCvc, cvcInput);
        return false;
    }

    return true;
};

// ---------- Сохранение лицензии ----------
const readJson = (key) => {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
};

const saveLicense = () => {
    const licenses = readJson(LICENSE_STORAGE_KEY);
    const now = Date.now();
    const current = licenses[productId];
    const base = current && Number(current.expiresAt) > now ? Number(current.expiresAt) : now;

    licenses[productId] = {
        product: productId,
        name: productName,
        price: price,
        basePrice: basePrice,
        discountApplied: hasDiscount ? discount / basePrice : 0,
        purchasedAt: now,
        expiresAt: base + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000
    };

    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenses, null, 4));

    const payments = readJson(PAYMENTS_STORAGE_KEY);
    const history = Array.isArray(payments.history) ? payments.history : [];
    history.push({
        id: `YPAY-${now.toString(36).toUpperCase()}`,
        product: productId,
        name: productName,
        amount: price,
        baseAmount: basePrice,
        discount: hasDiscount ? discount : 0,
        card: `**** ${digitsOnly(numberInput.value).slice(-4)}`,
        date: new Date(now).toISOString()
    });
    localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify({ history }, null, 4));
};

// ---------- Процесс оплаты ----------
const overlay = document.getElementById('pay-overlay');
const modal = document.querySelector('.pay-modal');
const statusEl = document.getElementById('pay-status');
const statusSubEl = document.getElementById('pay-status-sub');

const setStatus = (title, sub) => {
    statusEl.textContent = title;
    statusSubEl.textContent = sub;
};

document.getElementById('pay-form').addEventListener('submit', (e) => {
    e.preventDefault();

    if (price === 0) {
        goBack(productId);
        return;
    }

    if (!validate()) return;

    submitBtn.disabled = true;
    overlay.classList.add('show');
    modal.classList.remove('success');
    setStatus(t.processing, t.processingSub);

    setTimeout(() => setStatus(t.confirming, t.confirmingSub), 1400);

    setTimeout(() => {
        saveLicense();
        modal.classList.add('success');
        setStatus(t.success, t.successSub);
        setTimeout(() => goBack(productId), 1600);
    }, 3000);
});

// Бесплатный продукт оплачивать не нужно
if (price === 0) {
    errorBox.textContent = t.free;
    submitBtn.disabled = true;
}
