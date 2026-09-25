// ==========================================================
// ebloX — общие правила цен и скидок
// Владельцы активной подписки ebloX Inclusive получают
// скидку 10% на все остальные платные читы.
// Подключается и в лаунчере (main.html), и в ЫPay (ypay.html).
// ==========================================================

(() => {
    const LICENSE_STORAGE_KEY = 'eblox-licenses';
    const INCLUSIVE_PRODUCT_ID = 'eblox-inclusive';
    const INCLUSIVE_DISCOUNT = 0.10;

    const readLicenses = () => {
        try {
            const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    };

    const isLicenseActive = (license) => Boolean(license) && Number(license.expiresAt) > Date.now();

    const hasInclusive = () => isLicenseActive(readLicenses()[INCLUSIVE_PRODUCT_ID]);

    // Скидка не применяется к самому Inclusive и к бесплатным читам
    const discountApplies = (productId, basePrice) =>
        Number(basePrice) > 0 && productId !== INCLUSIVE_PRODUCT_ID && hasInclusive();

    const discountRate = (productId, basePrice) =>
        discountApplies(productId, basePrice) ? INCLUSIVE_DISCOUNT : 0;

    // Округляем вверх до рубля, чтобы итог совпадал в лаунчере и на оплате
    const finalPrice = (productId, basePrice) => {
        const base = Number(basePrice) || 0;
        if (!discountApplies(productId, base)) return base;
        return Math.ceil(base * (1 - INCLUSIVE_DISCOUNT));
    };

    const discountAmount = (productId, basePrice) => {
        const base = Number(basePrice) || 0;
        return base - finalPrice(productId, base);
    };

    window.EbloxPricing = {
        LICENSE_STORAGE_KEY,
        INCLUSIVE_PRODUCT_ID,
        INCLUSIVE_DISCOUNT,
        readLicenses,
        isLicenseActive,
        hasInclusive,
        discountApplies,
        discountRate,
        finalPrice,
        discountAmount
    };
})();
