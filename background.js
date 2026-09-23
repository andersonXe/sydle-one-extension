chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // Aceita apenas mensagens vindas de content scripts da própria extensão
    if (!sender.tab) return;

    if (request.url) {
        // Valida que a URL usa um protocolo seguro antes de abrir nova aba
        try {
            const parsed = new URL(request.url);
            if (!['https:', 'http:', 'chrome-extension:'].includes(parsed.protocol)) return;
        } catch (e) {
            return;
        }
        chrome.tabs.create({ url: request.url });
    }
});