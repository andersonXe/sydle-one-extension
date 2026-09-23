// Inject the main-world network interceptor
try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('scripts/injected.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
} catch (e) {
    console.error('[SYDLE Extension] Failed to inject interceptor:', e);
}

// Listen for intercepted queries from the main world
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    // Payload é enviado como string JSON para não disparar erros no listener do SYDLE ONE
    let msg = event.data;
    if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch (e) { return; }
    }
    if (msg && msg.source === 'sydle-query-interceptor') {
        if (window.handleCapturedQuery) {
            window.handleCapturedQuery(msg);
        }
    }
});


const mutationObserver = new MutationObserver(callback);

mutationObserver.observe(document, { childList: true, subtree: true });

let currentSettings = {
    showInList: true,
    showInDetail: false,
    showQuery: true
};

chrome.storage.sync.get(['showInList', 'showInDetail', 'showQuery'], function(items) {
    if (items.showInList   !== undefined) currentSettings.showInList   = items.showInList;
    if (items.showInDetail !== undefined) currentSettings.showInDetail = items.showInDetail;
    if (items.showQuery    !== undefined) currentSettings.showQuery    = items.showQuery;
    applyRules();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.showInList) {
            currentSettings.showInList = changes.showInList.newValue;
            handleListToggle(changes.showInList.newValue);
        }
        if (changes.showInDetail) {
            currentSettings.showInDetail = changes.showInDetail.newValue;
            handleDetailToggle(changes.showInDetail.newValue);
        }
        if (changes.showQuery) {
            currentSettings.showQuery = changes.showQuery.newValue;
            handleQueryToggle(changes.showQuery.newValue);
        }
    }
});

function handleListToggle(show) {
    if (show) {
        showCardId();
    } else {
        const { cards } = getObjectListCards();
        if (cards) {
            cards.forEach(card => {
                const panels = getAllElementInShadowRoots(card, '.info-panel');
                panels.forEach(p => p.remove());
                const direct = card.querySelector('.info-panel');
                if (direct) direct.remove();
            });
        }
        firstCardId = null;
        cardsSize = 0;
    }
}

function handleDetailToggle(show) {
    if (show) {
        showDetailInfo();
    } else {
        findAllObjectViews(document).forEach(objectView => {
            const targetContainer = objectView.shadowRoot || objectView;
            targetContainer.querySelectorAll('.info-panel').forEach(p => p.remove());
        });
    }
}

// Debounce do MutationObserver: o SYDLE ONE gera centenas de mutations por segundo
// (re-renders do Stencil). Sem debounce, applyRules() dispara em cada uma delas.
let _applyRulesTimer = null;
function callback(arrMutationRecord, observer) {
    clearTimeout(_applyRulesTimer);
    _applyRulesTimer = setTimeout(applyRules, 150);
}

function applyRules() {
    // Check if extension context is valid
    if (!chrome.runtime?.id) {
        // If context is invalid (e.g. extension reloaded/disabled), stop observing to prevent errors
        if (typeof mutationObserver !== 'undefined') {
            mutationObserver.disconnect();
        }
        return;
    }

    if (currentSettings.showInList !== false) {
        showCardId();
    }

    if (currentSettings.showInDetail === true) {
        showDetailInfo();
    }

    if (currentSettings.showQuery !== false) {
        if (window.updateInlineQueryButton) window.updateInlineQueryButton();
    }
}

function handleQueryToggle(show) {
    if (show) {
        if (window.updateInlineQueryButton) window.updateInlineQueryButton();
    } else {
        if (window.removeInlineQueryButton) window.removeInlineQueryButton();
    }
}

let firstCardId = null;
let cardsSize   = 0;

function bindCardListeners(container) {
    const iconId = container.getElementsByClassName('icon-id')[0];
    if (iconId) iconId.addEventListener('click', infoClick);

    const handlers = {
        copyable:     copyToClipboard,
        clickobject:  redirectToClassObject,
        getJSON:      getJSON,
        copyGetPath:  copyGetPath
    };
    for (const cls in handlers) {
        Array.from(container.getElementsByClassName(cls)).forEach(el => {
            el.addEventListener('click', handlers[cls]);
        });
    }
}

function showCardId() {
    const { cards } = getObjectListCards();
    if (!cards || !cards.length) return;

    const href = cards[0]?.getAttribute("href");
    if (!href) return;

    const [, firstId] = href.split("/").slice(2);

    // Alterou a listagem de objetos ou aplicou filtros
    if (firstCardId !== firstId || cardsSize !== cards.length) {
        firstCardId = firstId;
        cardsSize   = cards.length;

        for (let i = 0; i < cards.length; i++) {
            const cardBody = cards[i];
            const [dataCardClassId, dataCardId] = cardBody.getAttribute("href").split("/").slice(2);

            if (!cardBody.getElementsByClassName('info-panel').length) {
                injectInfoPanelStyles(cardBody.getRootNode());
                const infoPanel = getInfoPanel(dataCardId, dataCardClassId);
                cardBody.appendChild(infoPanel);
                bindCardListeners(cardBody);
            }
        }
    }
}

function getObjectListCards() {
    const accordionItems = findElementInShadowRoots(document, "sy-one-group-cards-list");

    if (accordionItems) {
        return {
            cards: getAllElementInShadowRoots(accordionItems.shadowRoot, "sy-card"),
            accordionItems
        };
    }
    return { cards: null, accordionItems: null };
}

function infoClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const icon   = event.currentTarget;
    const syInfo = icon?.parentElement?.parentElement?.getElementsByClassName('sy-info')[0];
    if (!icon || !syInfo) return;

    // Trata estado inicial (display vazio) como visível
    const isVisible = syInfo.style.display !== 'none';
    syInfo.style.display = isVisible ? 'none'    : 'flex';
    icon.style.color     = 'inherit';
    icon.style.opacity   = isVisible ? '0.5'     : '1';
}


function showDetailInfo() {
    try {
        const objectViews = findAllObjectViews(document);
        if (!objectViews || objectViews.length === 0) {
            return;
        }

        objectViews.forEach(objectView => {
            let classId = objectView.getAttribute('class-id') || objectView.getAttribute('classid');
            let objectId = objectView.getAttribute('object-id') || objectView.getAttribute('objectid') || objectView.getAttribute('id');

            if (!classId || !objectId) {
                const url = window.location.href;
                const match = url.match(/(?:class|classId|_classId)\/([a-zA-Z0-9]+)\/(?:object|id|_id|_get)\/([a-zA-Z0-9]+)/i);
                if (match) {
                    classId = match[1];
                    objectId = match[2];
                }
            }

            if (!classId || !objectId) {
                return;
            }

            const targetContainer = objectView.shadowRoot || objectView;

            // Check if the correct panel is already present
            const existingPanel = targetContainer.querySelector(`.info-panel[data-object-id="${objectId}"][data-class-id="${classId}"]`);
            if (existingPanel) {
                adjustPanelPosition(objectView, existingPanel);
                return;
            }

            // Remove any stale panels
            targetContainer.querySelectorAll('.info-panel').forEach(p => p.remove());

            injectInfoPanelStyles(targetContainer instanceof ShadowRoot ? targetContainer : targetContainer.getRootNode());
            const infoPanel = getInfoPanel(objectId, classId);
            infoPanel.classList.add('info-panel-detail');
            infoPanel.setAttribute('data-object-id', objectId);
            infoPanel.setAttribute('data-class-id', classId);

            targetContainer.appendChild(infoPanel);
            adjustPanelPosition(objectView, infoPanel);
            bindCardListeners(infoPanel);
        });
    } catch (error) {
        console.debug('[SYDLE Extension] showDetailInfo error:', error);
    }
}

function getDetailPanelStatus(objectView) {
    if (!objectView.shadowRoot) return true;
    const detailPanel = findElementInShadowRoots(objectView.shadowRoot, '#detailPanel-panel');
    if (detailPanel) return !detailPanel.classList.contains('hidden-panel');
    return true; // Default to active if we can't find it
}

function adjustPanelPosition(objectView, infoPanel) {
    const isDetailsActive = getDetailPanelStatus(objectView);

    if (isDetailsActive) {
        infoPanel.style.display = 'flex';
        infoPanel.style.right = '14px';
    } else {
        infoPanel.style.display = 'none';
    }
}

// Checa posição do painel de detalhe. 1000ms é suficiente — o painel não
// muda de estado mais rápido que uma interação do usuário.
setInterval(() => {
    const objectViews = findAllObjectViews(document);
    objectViews.forEach(objectView => {
        const infoPanel = findElementInShadowRoots(objectView, '.info-panel');
        if (infoPanel) {
            adjustPanelPosition(objectView, infoPanel);
        }
    });
}, 1000);

// Periodically verify the inline QUERY button is present next to the filter toggle button.
// Intervalo maior porque updateInlineQueryButton já tem debounce interno de 150ms e o
// MutationObserver é o trigger principal. Aqui serve só de fallback para navegações SPA.
setInterval(() => {
    if (currentSettings.showQuery !== false && window.updateInlineQueryButton) {
        window.updateInlineQueryButton();
    }
}, 2000);

