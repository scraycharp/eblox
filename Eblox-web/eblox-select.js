// Кастомные выпадающие списки для комбобоксов настроек.
// Нативный <select> остаётся источником правды: его читает collectSettings(),
// а fillSettingsForm()/applyLanguage() пишут в него напрямую. Поэтому здесь
// только надстройка над ним — выбор всегда идёт через select.selectedIndex
// с последующим ручным dispatch('change'), которого нет у программной записи.
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SELECTOR = 'select.select-input';
    const instances = [];

    function makeIcon(id, className) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', className ? `icon ${className}` : 'icon');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', `#${id}`);
        svg.appendChild(use);
        return svg;
    }

    function closeAll(except) {
        instances.forEach(inst => {
            if (inst !== except && inst.close) inst.close();
        });
    }

    function enhance(select) {
        if (select.dataset.comboReady === '1') return;
        select.dataset.comboReady = '1';

        const field = document.createElement('div');
        field.className = 'combo-field';
        select.parentNode.insertBefore(field, select);
        field.appendChild(select);
        select.classList.add('combo-field-native');
        select.setAttribute('tabindex', '-1');
        select.setAttribute('aria-hidden', 'true');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'combo-field-btn';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');

        const label = document.createElement('span');
        label.className = 'combo-field-label';
        btn.appendChild(label);
        btn.appendChild(makeIcon('i-chevron', 'combo-field-arrow'));

        const list = document.createElement('div');
        list.className = 'combo-field-list';
        list.setAttribute('role', 'listbox');

        field.appendChild(btn);
        field.appendChild(list);

        const inst = { select, field, btn, list, cursor: -1 };
        instances.push(inst);

        const isOpen = () => field.classList.contains('open');

        // Перерисовка нужна не только после выбора: applyLanguage() переписывает
        // текст <option> через data-i18n, а fillSettingsForm() — сам value.
        function rebuild() {
            const current = select.options[select.selectedIndex];
            label.textContent = current ? current.textContent : '';
            list.textContent = '';
            Array.from(select.options).forEach((opt, i) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'combo-option';
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
                if (opt.selected) item.classList.add('selected');
                if (opt.disabled) item.disabled = true;

                const text = document.createElement('span');
                text.className = 'combo-option-text';
                text.textContent = opt.textContent;
                item.appendChild(text);
                item.appendChild(makeIcon('i-check', 'combo-option-check'));

                item.addEventListener('click', () => pick(i));
                list.appendChild(item);
            });
            paintCursor();
        }

        function paintCursor() {
            Array.from(list.children).forEach((el, i) => {
                el.classList.toggle('active', i === inst.cursor);
            });
        }

        function pick(index) {
            const opt = select.options[index];
            if (!opt || opt.disabled) return;
            if (select.selectedIndex !== index) {
                select.selectedIndex = index;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            rebuild();
            close();
            btn.focus();
        }

        // Список абсолютный внутри .settings-body с overflow-y: auto, поэтому
        // сам он не обрежется по краям панели только если поместится в неё.
        function place() {
            field.classList.remove('up');
            const scroller = select.closest('.settings-body') || select.closest('.panel-body');
            if (!scroller) return;
            const bounds = scroller.getBoundingClientRect();
            const anchor = btn.getBoundingClientRect();
            let rect = list.getBoundingClientRect();
            const below = bounds.bottom - anchor.bottom;
            const above = anchor.top - bounds.top;
            if (rect.height + 12 > below && above > below) {
                field.classList.add('up');
                rect = list.getBoundingClientRect();
            }
            const overBottom = rect.bottom - (bounds.bottom - 8);
            const overTop = (bounds.top + 8) - rect.top;
            if (overBottom > 0) scroller.scrollTop += overBottom;
            else if (overTop > 0) scroller.scrollTop -= overTop;
        }

        function open() {
            closeAll(inst);
            rebuild();
            field.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            inst.cursor = select.selectedIndex;
            paintCursor();
            place();
            const active = list.children[inst.cursor];
            if (active) active.scrollIntoView({ block: 'nearest' });
        }

        function close() {
            field.classList.remove('open', 'up');
            btn.setAttribute('aria-expanded', 'false');
            inst.cursor = -1;
            paintCursor();
        }

        function move(step) {
            const total = select.options.length;
            if (!total) return;
            let i = inst.cursor < 0 ? (step > 0 ? -1 : 0) : inst.cursor;
            for (let k = 0; k < total; k++) {
                i = (i + step + total) % total;
                if (!select.options[i].disabled) break;
            }
            inst.cursor = i;
            paintCursor();
            const active = list.children[i];
            if (active) active.scrollIntoView({ block: 'nearest' });
        }

        // Клик не гасим: свой document-обработчик пропускает всё внутри
        // .combo-field, зато closeDropdowns() из main-page.js успевает закрыть
        // выпадашки шапки.
        btn.addEventListener('click', () => {
            if (isOpen()) close();
            else open();
        });

        btn.addEventListener('keydown', event => {
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                    event.preventDefault();
                    if (!isOpen()) open();
                    else move(event.key === 'ArrowDown' ? 1 : -1);
                    break;
                case 'Home':
                case 'End':
                    if (!isOpen()) return;
                    event.preventDefault();
                    inst.cursor = event.key === 'Home' ? -1 : 0;
                    move(event.key === 'Home' ? 1 : -1);
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (isOpen() && inst.cursor >= 0) pick(inst.cursor);
                    else if (!isOpen()) open();
                    break;
                case 'Tab':
                    close();
                    break;
            }
        });

        inst.isOpen = isOpen;
        inst.rebuild = rebuild;
        inst.close = close;
        rebuild();
    }

    function init(root) {
        (root || document).querySelectorAll(SELECTOR).forEach(enhance);
    }

    function syncAll() {
        instances.forEach(inst => {
            if (inst.rebuild) inst.rebuild();
        });
    }

    document.addEventListener('click', event => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function' || !target.closest('.combo-field')) {
            closeAll();
        }
    });

    // Escape гасим целиком: обработчик main-page.js висит на том же document и
    // зарегистрирован позже, иначе одно нажатие закрыло бы и список, и панель.
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const opened = instances.filter(inst => inst.isOpen && inst.isOpen());
        if (!opened.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeAll();
        opened[0].btn.focus();
    });

    window.initCustomSelects = init;
    window.syncCustomSelects = syncAll;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }
})();
