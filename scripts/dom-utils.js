function findElementInShadowRootsByClass(root, className) {
    return findElementInShadowRoots(root, '.' + className);
}

function findElementInShadowRoots(root, selector) {
    if (!root) return null;

    if (root.querySelector) {
        const found = root.querySelector(selector);
        if (found) return found;
    }

    const shadowRoots = [];
    if (root.shadowRoot) {
        const found = root.shadowRoot.querySelector(selector);
        if (found) return found;
        shadowRoots.push(root.shadowRoot);
    }

    if (root.querySelectorAll) {
        for (const child of root.querySelectorAll('*')) {
            if (child.shadowRoot) shadowRoots.push(child.shadowRoot);
        }
    }

    for (const sr of shadowRoots) {
        const found = findElementInShadowRoots(sr, selector);
        if (found) return found;
    }

    return null;
}

function getAllElementInShadowRoots(root, selector) {
    const elements = [];
    if (!root) return elements;

    if (root.querySelectorAll) {
        root.querySelectorAll(selector).forEach(f => elements.push(f));
    }

    const shadowRoots = [];
    if (root.shadowRoot) {
        root.shadowRoot.querySelectorAll(selector).forEach(f => elements.push(f));
        shadowRoots.push(root.shadowRoot);
    }

    if (root.querySelectorAll) {
        for (const child of root.querySelectorAll('*')) {
            if (child.shadowRoot) shadowRoots.push(child.shadowRoot);
        }
    }

    for (const sr of shadowRoots) {
        elements.push(...getAllElementInShadowRoots(sr, selector));
    }

    // Deduplica
    return [...new Set(elements)];
}

function findAllObjectViews(root) {
    const views = new Set();
    if (!root) return [];

    function search(node) {
        if (!node) return;
        if (node.tagName?.toLowerCase() === 'sy-one-object-view') views.add(node);
        if (node.querySelectorAll) {
            node.querySelectorAll('sy-one-object-view').forEach(v => views.add(v));
            node.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) search(el.shadowRoot);
            });
        }
    }

    search(root);
    return [...views];
}
