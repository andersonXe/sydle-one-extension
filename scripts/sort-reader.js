// scripts/sort-reader.js
// Lê a ordenação selecionada no seletor "Organizado por" da listagem e converte
// para o formato `sort` do Elasticsearch.
(function () {

    const CLASS_OF_CLASSES = '000000000000000000000000';

    // IDs de campos de sistema que podem não aparecer em `fields` da classe.
    const SYSTEM_FIELDS = {
        '_id':                      { identifier: '_id' },
        '_classId':                 { identifier: '_classId' },
        '00ff00000000000000000113': { identifier: '_creationDate',   type: 'DATE' },
        '00ff00000000000000000148': { identifier: '_lastUpdateDate', type: 'DATE' },
        '00ff00000000000000000150': { identifier: '_createdBy',      type: 'REFERENCE' },
        '00ff00000000000000000149': { identifier: '_lastUpdatedBy',  type: 'REFERENCE' },
    };

    // Rótulos exibidos no seletor para campos de sistema (fallback quando a árvore não está no DOM)
    const SYSTEM_LABELS = {
        'ID':                       '_id',
        'Data da criação':          '00ff00000000000000000113',
        'Data da última alteração': '00ff00000000000000000148',
    };

    const classCache = new Map();

    function getToken() {
        try {
            const user = JSON.parse(localStorage.getItem('explorer_user_map'));
            return user.main.users[0].accessToken.token;
        } catch (e) {
            return null;
        }
    }

    // Busca a definição da classe e indexa os campos por _id
    async function getClassFields(classId) {
        if (classCache.has(classId)) return classCache.get(classId);

        const promise = (async () => {
            const token = getToken();
            const res = await fetch(`${window.location.origin}/api/1/main/_classId/${CLASS_OF_CLASSES}/_get/${classId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar classe ${classId}`);
            const cls = await res.json();

            const byId = {};
            (cls.fields || cls._fields || []).forEach(f => {
                if (!f || !f._id) return;
                byId[f._id] = {
                    identifier: f.identifier || f._identifier,
                    name:       f.name,
                    type:       (f.type || '').toString().toUpperCase(),
                    multiple:   !!f.multiple,
                    embedded:   !!f.embedded,
                    refClassId: f.refClass?._id || f.refClassId || f.referenceClass?._id || null
                };
            });
            return byId;
        })();

        classCache.set(classId, promise);
        promise.catch(() => classCache.delete(classId));
        return promise;
    }

    // Converte "idCampo.idSubcampo" em "identificador.subidentificador", navegando por referências
    async function resolveFieldPath(classId, idPath) {
        const ids = idPath.split('.');
        const identifiers = [];
        let currentClass = classId;
        let lastField = null;
        let nestedPath = null;

        for (const id of ids) {
            let field = null;
            if (currentClass) {
                try {
                    const fields = await getClassFields(currentClass);
                    field = fields[id] || null;
                } catch (e) {
                    console.warn('[SYDLE Extension]', e.message);
                }
            }
            field = field || SYSTEM_FIELDS[id];
            if (!field?.identifier) {
                throw new Error(`Não foi possível resolver o campo ${id} (caminho ${idPath})`);
            }

            identifiers.push(field.identifier);
            if (field.multiple && field.embedded && !nestedPath) nestedPath = identifiers.join('.');
            currentClass = field.refClassId || null;
            lastField = field;
        }

        let esField = identifiers.join('.');
        // Campos texto são ordenados pelo sub-campo keyword (mesma convenção dos filtros)
        if (lastField?.type === 'STRING') esField += '.keyword';
        return { esField, nestedPath };
    }

    function isVisible(el) {
        return el && el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    // Descobre a direção pelo botão de ordem ao lado do seletor:
    // <sy-button class="order-button" title="Decrescente" icon="arrow_downward_alt">
    function readDirection(container) {
        const scope = container?.parentNode || container;
        if (!scope) return { order: 'asc', source: null };

        const orderButton = scope.querySelector('.order-button');
        const buttons = orderButton
            ? [orderButton]
            : Array.from(scope.querySelectorAll('sy-button, button'))
                .filter(b => b.id !== 'organizer-button' && !b.closest('sy-dropdown'));

        for (const b of buttons) {
            const text = [
                b.getAttribute('icon'), b.getAttribute('title'),
                b.getAttribute('accessible-label'), b.getAttribute('aria-label')
            ].join(' ').toLowerCase();

            // O botão exibe a AÇÃO (próxima ordem), não o estado atual — por isso invertido
            if (/desc|decrescente|downward|arrow_down/.test(text)) return { order: 'asc',  source: b };
            if (/asc|crescente|upward|arrow_up/.test(text))        return { order: 'desc', source: b };
        }
        return { order: 'asc', source: null };
    }

    // Sobe pelos shadow hosts até a view da listagem (<sy-one-object-list-view class-id="...">)
    function getListClassId(fromEl) {
        let node = fromEl;
        while (node) {
            if (node.getAttribute?.('class-id')) return node.getAttribute('class-id');
            node = node.parentElement || node.getRootNode?.().host || null;
        }
        try {
            const { cards } = getObjectListCards();
            const href = cards?.[0]?.getAttribute('href');
            if (href) return href.split('/').slice(2)[0] || null;
        } catch (e) {}
        return null;
    }

    // Sem a árvore no DOM (menu nunca aberto), resolve pelo rótulo do botão ("Organizado por: Login")
    async function idPathFromLabel(classId, label) {
        if (!label) return null;
        if (SYSTEM_LABELS[label]) return SYSTEM_LABELS[label];
        const fields = await getClassFields(classId);
        const id = Object.keys(fields).find(k => fields[k].name === label);
        return id || null;
    }

    // Retorna { sort: [...] } ou null quando a ordenação é "Padrão" / não encontrada
    async function readSortFromDom() {
        const organizer = getAllElementInShadowRoots(document, '#organizer-button').find(isVisible);
        if (!organizer) {
            console.log('[SYDLE Extension] Seletor de ordenação (#organizer-button) não encontrado.');
            return null;
        }

        const container = organizer.closest('.mode-field-container') || organizer.parentNode;
        const classId = getListClassId(organizer);

        // A árvore fica em shadow roots aninhados (field-reference-control → searchable-tree)
        const activeNode = findElementInShadowRoots(container, 'sy-tree-node[active]');
        let idPath = activeNode ? activeNode.id.replace(/^tree-node-/, '') : null;
        if (activeNode && !idPath) return null; // "Padrão"

        if (!idPath) {
            const label = organizer.getAttribute('title');
            if (!label || label === 'Padrão') return null;
            idPath = await idPathFromLabel(classId, label);
            if (!idPath) {
                console.warn(`[SYDLE Extension] Campo de ordenação "${label}" não resolvido na classe ${classId}.`);
                return null;
            }
        }

        const { esField, nestedPath } = await resolveFieldPath(classId, idPath);
        const { order, source } = readDirection(container);

        if (!source) {
            console.log('[SYDLE Extension] Botão de direção da ordenação não identificado; usando "asc". Contêiner:', container?.parentNode?.outerHTML?.slice(0, 2000));
        }

        const spec = { order };
        if (nestedPath) spec.nested = { path: nestedPath };
        return [{ [esField]: spec }];
    }

    window.SydleSortReader = { readSortFromDom, resolveFieldPath };
})();
