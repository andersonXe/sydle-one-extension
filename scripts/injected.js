// scripts/injected.js
(function() {
    if (window.__sydleQueryInterceptorActive) return;
    window.__sydleQueryInterceptorActive = true;

    function sendPayload(url, method, rawBody) {
        try {
            if (!rawBody) return;
            let parsedBody = null;
            if (typeof rawBody === 'string') {
                try { parsedBody = JSON.parse(rawBody); } catch (e) { return; }
            } else if (typeof rawBody === 'object') {
                parsedBody = rawBody;
            }
            if (parsedBody && isQueryPayload(parsedBody, url)) {
                // Serializa como string para não conflitar com listeners de postMessage
                // do próprio SYDLE ONE que chamam JSON.parse(event.data) em tudo.
                window.postMessage(JSON.stringify({
                    source: 'sydle-query-interceptor',
                    url: url,
                    method: method,
                    payload: parsedBody,
                    timestamp: Date.now()
                }), window.location.origin);
            }
        } catch (err) {}
    }

    // Try to extract _body param from GET URLs (SYDLE ONE pattern)
    function tryExtractBodyFromUrl(url) {
        try {
            const fullUrl = url.startsWith('http') ? url : (window.location.origin + url);
            const parsed = new URL(fullUrl);
            const bodyParam = parsed.searchParams.get('_body');
            if (bodyParam) {
                return JSON.parse(decodeURIComponent(bodyParam));
            }
        } catch (e) {}
        return null;
    }

    function isQueryPayload(body, url) {
        // SYDLE-specific patterns
        if (body.searchParams || body.filters || body.getCardsOptions) return true;

        const queryKeys = ['query', 'bool', 'must', 'filter', '_query', 'constraints', 'search', 'sort', 'aggs', 'where', 'searchText', 'sorters'];
        const hasQueryUrl = /\/(query|search|list|getObjectList|graphql)/i.test(url);
        if (hasQueryUrl) return true;

        function hasKeys(obj, depth) {
            if (depth > 5 || !obj || typeof obj !== 'object') return false;
            for (let k in obj) {
                if (queryKeys.includes(k)) return true;
                if (typeof obj[k] === 'object' && hasKeys(obj[k], depth + 1)) return true;
            }
            return false;
        }
        return hasKeys(body, 0);
    }

    // --- Intercept Fetch ---
    const originalFetch = window.fetch;
    window.fetch = async function(resource, init) {
        try {
            const url = (typeof resource === 'string') ? resource : (resource?.url || '');
            const method = (init?.method || 'GET').toUpperCase();

            if (method === 'GET' || method === 'HEAD') {
                // Try to extract payload from URL _body param
                const bodyFromUrl = tryExtractBodyFromUrl(url);
                if (bodyFromUrl) sendPayload(url, method, bodyFromUrl);
            } else if (init?.body) {
                sendPayload(url, method, init.body);
            }
        } catch (e) {}
        return originalFetch.apply(this, arguments);
    };

    // --- Intercept XMLHttpRequest ---
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = (method || 'GET').toUpperCase();
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        try {
            if (this._method === 'GET' || this._method === 'HEAD') {
                const bodyFromUrl = tryExtractBodyFromUrl(this._url);
                if (bodyFromUrl) sendPayload(this._url, this._method, bodyFromUrl);
            } else if (body) {
                sendPayload(this._url, this._method, body);
            }
        } catch (e) {}
        return originalSend.apply(this, arguments);
    };
})();

