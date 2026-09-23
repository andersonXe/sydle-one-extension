// scripts/info-panel.js
(function () {

    const INFO_PANEL_CSS = `
        .info-panel {
            cursor: default;
        }
        .info-panel-detail {
            position: absolute;
            top: 46px;
            right: 14px;
            z-index: 1000;
            background-color: transparent;
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            border-radius: 8px;
            padding: 6px;
            border: none;
            box-shadow: none;
        }
        .sy-info {
            font-size: 72%;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            position: relative;
            padding: 0 16px;
        }
        .info-icon-container {
            text-align: center;
            font-size: 1.1rem;
        }
        .icon-id {
            cursor: pointer;
            color: inherit;
            opacity: 0.5;
        }
        .style-buttons {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            min-height: 30px;
            padding: 0;
            bottom: 0;
            right: 0;
            flex-direction: row;
            gap: 5px;
            border-radius: 10px;
        }
        .sy-btn {
            color: var(--sy-foreground-medium-emphasis, inherit);
            cursor: pointer;
            background-color: transparent;
            border-color: var(--sy-border, currentColor);
            border-style: solid;
            border-width: 1px;
            border-radius: var(--sy-border-radius-rounded, 50px);
            padding: 4px 12px;
            display: flex;
            min-width: fit-content;
            gap: 5px;
            justify-content: flex-start;
            align-items: center;
            outline: 0;
            user-select: none;
        }
        .sy-btn:hover {
            background-color: var(--sy-surface-hover, rgba(128,128,128,0.15));
        }
        .sy-btn:active {
            background-color: var(--sy-surface-active, rgba(128,128,128,0.25));
        }
        .others {
            display: flex;
        }
        .others .card-feature-label {
            color: inherit;
            opacity: 0.7;
        }
        .others .fix-userTask-name {
            color: inherit;
            cursor: default;
            user-select: text;
        }
    `;

    // Injeta o CSS do info-panel uma única vez por root node (document ou ShadowRoot)
    const _styledRoots = new WeakSet();
    function injectInfoPanelStyles(root) {
        if (!root || _styledRoots.has(root)) return;
        _styledRoots.add(root);
        const style = document.createElement('style');
        style.textContent = INFO_PANEL_CSS;
        // ShadowRoot é um DocumentFragment (nodeType 11); document usa .head
        const target = root.nodeType === 11 ? root : document.head;
        target.appendChild(style);
    }

    function getInfoPanel(dataCardId, dataCardClassId) {
        const infoPanel     = createInfoPanel();
        const iconContainer = createIconContainer();
        infoPanel.appendChild(iconContainer);

        const syInfo = createSyInfoSection();
        syInfo.appendChild(createInfoContainer('_id: ',       dataCardId,      dataCardId));
        syInfo.appendChild(createInfoContainer('class._id: ', dataCardClassId, dataCardClassId));

        const extraButtons = createExtraButtonsHolder();
        extraButtons.appendChild(createButton('_class',   'clickobject ti-export', { classidaux: dataCardClassId }));
        extraButtons.appendChild(createButton('JSON',     'getJSON ti-search',     { classidaux: dataCardClassId, idaux: dataCardId }));
        extraButtons.appendChild(createButton('Get Path', 'copyGetPath ti-layers', { classidaux: dataCardClassId, idaux: dataCardId }));

        syInfo.appendChild(extraButtons);
        infoPanel.appendChild(syInfo);
        return infoPanel;
    }

    /************************************* INITIALIZERS *****************************************/

    function createInfoPanel() {
        const infoPanel = document.createElement('div');
        infoPanel.className = 'info-panel';
        infoPanel.onclick = function (event) {
            event.preventDefault();
            event.stopPropagation();
        };
        return infoPanel;
    }

    function createSyInfoSection() {
        const syInfo = document.createElement('div');
        syInfo.className = 'sy-info';
        return syInfo;
    }

    function createIconContainer() {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'info-icon-container';
        iconContainer.appendChild(createSpan('', 'ti-info-alt icon-id'));
        return iconContainer;
    }

    function createExtraButtonsHolder() {
        const extraButtons = document.createElement('div');
        extraButtons.className = 'style-buttons';
        return extraButtons;
    }

    /************************************ REUSABLES *********************************************/

    function createButton(text, className, attributes = {}) {
        return createSpan(text, className + ' sy-btn', attributes);
    }

    function createInfoContainer(labelText, valueText, titleText) {
        const container = document.createElement('div');
        container.className = 'others';
        container.appendChild(createSpan(labelText, 'card-feature-label user-select-none'));
        container.appendChild(createSpan(valueText, 'truncate fix-userTask-name copyable', { title: titleText }));
        return container;
    }

    function createSpan(text, className, attributes = {}) {
        const span = document.createElement('span');
        span.className   = className;
        span.textContent = text;
        for (const key of Object.keys(attributes)) {
            span.setAttribute(key, attributes[key]);
        }
        return span;
    }

    /************************************ PUBLIC API ********************************************/

    window.getInfoPanel           = getInfoPanel;
    window.injectInfoPanelStyles  = injectInfoPanelStyles;

})();
