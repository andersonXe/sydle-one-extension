// scripts/query-ui.js
(function () {

    const INLINE_BUTTON_CSS = `
        #sydle-query-inline-btn {
            /* Tokens do design system SYDLE ONE — outlined variant sem cor */
            color: var(--sy-foreground-medium-emphasis, inherit);
            background-color: transparent;
            border-color: var(--sy-border, currentColor);
            border-style: solid;
            border-width: 1px;
            border-radius: var(--sy-border-radius-rounded, 50px);
            padding: calc(var(--sy-spacer-2, 8px) - 1px) calc(var(--sy-spacer-4, 16px) - 1px);

            /* Layout */
            display: inline-flex;
            align-items: center;
            justify-content: center;
            align-self: center;
            vertical-align: middle;
            transform: translateY(-7px);
            min-width: fit-content;
            gap: var(--sy-spacer-2, 8px);
            margin-left: var(--sy-spacer-2, 8px);

            /* Tipografia — espelha .sy-btn */
            font-size: var(--sy-content-regular-body-font-size, 14px);
            font-family: var(--sy-content-regular-body-font-family, inherit);
            font-weight: var(--sy-content-regular-body-font-weight, inherit);
            font-style: var(--sy-content-regular-body-font-style, normal);
            letter-spacing: var(--sy-content-regular-body-letter-spacing, normal);
            line-height: var(--sy-content-regular-body-line-height, normal);
            text-decoration: none;
            text-align: center;
            text-transform: none;

            cursor: pointer;
            user-select: none;
            outline: 0;
            transition: var(--sy-button-transition, none);
        }
        #sydle-query-inline-btn:hover {
            background-color: var(--sy-surface-hover, rgba(128,128,128,0.15));
        }
        #sydle-query-inline-btn:active {
            background-color: var(--sy-surface-active, rgba(128,128,128,0.25));
        }
    `;

    // State to store captured queries
    let capturedQueries = [];

    // Inject styles inside a shadow root
    function injectStyles(shadowRoot) {
        if (shadowRoot.getElementById('sydle-query-inline-styles')) return;
        const style = document.createElement('style');
        style.id = 'sydle-query-inline-styles';
        style.textContent = INLINE_BUTTON_CSS;
        shadowRoot.appendChild(style);
    }

    // Find all visible filter/funnel buttons piercing shadow DOM.
    // Scoped: starts from known SYDLE ONE list/toolbar host elements to avoid
    // querying the entire document every tick.
    function findFunnelButtonsGlobally() {
        // Candidate host selectors — narrows the search surface significantly
        const HOST_SELECTORS = [
            'sy-one-view-app-bar',
            'sy-one-object-list-filter',
            'sy-one-filter-menu',
            'sy-one-list',
            'sy-one-group-cards-list',
            'sy-toolbar',
            'sy-list',
            'sy-one-workspace',
        ];

        // Collect candidate roots (host elements + document fallback)
        const roots = [];
        for (const sel of HOST_SELECTORS) {
            document.querySelectorAll(sel).forEach(el => roots.push(el));
        }
        if (roots.length === 0) roots.push(document); // fallback

        const seen = new Set();
        const results = [];

        for (const root of roots) {
            const buttons = getAllElementInShadowRoots(root, 'button, sy-button, [role="button"]');
            for (const btn of buttons) {
                if (seen.has(btn)) continue;
                seen.add(btn);

                // Ignore our own injected button
                if (btn.id === 'sydle-query-inline-btn') continue;

                // ── Exclusão 1: <button> nativo que é implementação interna de <sy-button> ──
                const rootNode = btn.getRootNode();
                if (
                    rootNode instanceof ShadowRoot &&
                    btn.tagName.toLowerCase() === 'button' &&
                    /^sy-button$/i.test(rootNode.host?.tagName)
                ) continue;

                // Must be visible
                if (btn.offsetHeight === 0 || btn.offsetWidth === 0) continue;

                const iconAttr  = btn.getAttribute('icon') || '';
                const ariaLabel = btn.getAttribute('aria-label') || '';
                const title     = btn.getAttribute('title') || '';
                const classList = Array.from(btn.classList || []).join(' ');
                const nameAttr  = btn.getAttribute('name') || '';

                // ── Exclusão 2: botões de ação sobre filtros (desabilitar, remover, adicionar, _off) ──
                const combinedAttrs = (iconAttr + ' ' + ariaLabel + ' ' + title).toLowerCase();
                if (
                    combinedAttrs.includes('_off') ||
                    combinedAttrs.includes('desabili') ||
                    combinedAttrs.includes('remov') ||
                    combinedAttrs.includes('delete') ||
                    combinedAttrs.includes('delet') ||
                    combinedAttrs.includes('adicionar') ||
                    iconAttr.toLowerCase() === 'add'
                ) continue;

                // ── Detecção do botão de filtro ──
                const isFilter =
                    iconAttr.toLowerCase().includes('filter') ||
                    iconAttr.toLowerCase().includes('funnel') ||
                    ariaLabel.toLowerCase().includes('filter') ||
                    ariaLabel.toLowerCase().includes('filtrar') ||
                    ariaLabel.toLowerCase().includes('funnel') ||
                    title.toLowerCase().includes('filter') ||
                    title.toLowerCase().includes('filtrar') ||
                    classList.toLowerCase().includes('filter') ||
                    classList.toLowerCase().includes('funnel') ||
                    nameAttr.toLowerCase().includes('filter') ||
                    btn.querySelector('sy-icon[name*="filter"]') ||
                    btn.querySelector('sy-icon[name*="funnel"]');

                if (isFilter) results.push(btn);
            }
        }
        return results;
    }

    // Copy latest query to clipboard
    // Ordenação: lida do seletor "Organizado por" na tela; se falhar, tenta a do payload capturado
    async function getSort(current, parser) {
        try {
            const domSort = await window.SydleSortReader?.readSortFromDom();
            if (domSort) return domSort;
        } catch (e) {
            console.warn('[SYDLE Extension] Falha ao ler ordenação da tela:', e);
        }
        return current ? parser.toElasticsearchSort(current.sort) : null;
    }

    async function copyLatestQuery(btn) {
        const current = capturedQueries[0] || null;
        const parser  = window.SydleQueryParser;
        if (!parser) return;

        try {
            const esQueryCompiled = current ? parser.toElasticsearch(current.esQuery) : null;
            const esSort          = await getSort(current, parser);
            if (!esQueryCompiled && !esSort) {
                const originalText = btn.textContent;
                btn.textContent = 'Vazio';
                setTimeout(() => { btn.textContent = originalText; }, 1500);
                return;
            }

            // Sem ordenação mantém o formato antigo (só a cláusula); com ordenação vira um corpo de _search
            const output = esSort
                ? { query: esQueryCompiled || { match_all: {} }, sort: esSort }
                : esQueryCompiled;

            const queryJson = JSON.stringify(output, null, 2);

            navigator.clipboard.writeText(queryJson).then(() => {
                const originalText = btn.textContent;
                btn.textContent = 'COPIADO!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('copied');
                }, 1500);
            }).catch(err => {
                console.error('[SYDLE Extension] Failed to copy query:', err);
                btn.textContent = 'ERRO';
                setTimeout(() => { btn.textContent = 'Query'; }, 1500);
            });
        } catch (e) {
            console.error('[SYDLE Extension] Error compiling query:', e);
            btn.textContent = 'ERRO';
            setTimeout(() => { btn.textContent = 'QUERY'; }, 1500);
        }
    }

    // Debounce helper — coalesces rapid calls (MutationObserver fires many times per render)
    function debounce(fn, delay) {
        let timer = null;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    function doUpdateInlineQueryButton() {
        const funnelBtns = findFunnelButtonsGlobally();

        funnelBtns.forEach(funnelBtn => {
            // Use a dataset marker so we never inject twice for the same funnel button,
            // even if it's returned multiple times by the shadow-DOM traversal.
            if (funnelBtn.dataset.sydleQueryInjected === '1') {
                // Verify the QUERY button still exists next to it; if the component
                // re-rendered and removed it, clear the marker so we re-inject.
                const parent = funnelBtn.parentNode;
                if (parent && parent.querySelector('#sydle-query-inline-btn')) return;
                delete funnelBtn.dataset.sydleQueryInjected;
            }

            const root = funnelBtn.getRootNode();
            if (!root) return;

            injectStyles(root);

            const queryBtn = document.createElement('button');
            queryBtn.id = 'sydle-query-inline-btn';
            queryBtn.textContent = 'Query';
            queryBtn.title = 'Copiar query do Elasticsearch dos filtros e ordenação aplicados';

            queryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                copyLatestQuery(queryBtn);
            });

            funnelBtn.parentNode.insertBefore(queryBtn, funnelBtn.nextSibling);
            funnelBtn.dataset.sydleQueryInjected = '1';
        });
    }

    // Expose debounced version — safe to call from MutationObserver and setInterval
    window.updateInlineQueryButton = debounce(doUpdateInlineQueryButton, 300);

    // Remove all injected QUERY buttons and reset markers
    window.removeInlineQueryButton = function () {
        const allBtns = getAllElementInShadowRoots(document, '#sydle-query-inline-btn');
        allBtns.forEach(btn => {
            const prev = btn.previousElementSibling;
            if (prev && prev.dataset) delete prev.dataset.sydleQueryInjected;
            btn.remove();
        });
        capturedQueries = [];
    };

    // Public handler exposed globally to intercept and save queries
    window.handleCapturedQuery = function (msg) {
        const parsed = window.SydleQueryParser;
        if (!parsed) return;

        const esQuery = parsed.extractESQuery(msg.payload);

        const entry = {
            url:       msg.url,
            method:    msg.method,
            payload:   msg.payload,
            esQuery:   esQuery,
            sort:      parsed.extractSort(msg.payload),
            timestamp: msg.timestamp
        };

        capturedQueries.unshift(entry);
        if (capturedQueries.length > 10) capturedQueries.pop(); // Keep history small
    };
})();
