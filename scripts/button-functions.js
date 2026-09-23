function copyToClipboard(event) {
    const btn  = event.currentTarget;
    const text = btn.textContent.replace('Copiado!', '');

    navigator.clipboard.writeText(text).catch(() => {
        // Fallback para navegadores sem suporte à Clipboard API
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    });

    if (!btn.getElementsByClassName('tooltip').length) {
        const tooltip = document.createElement('span');
        tooltip.classList.add('tooltip');
        tooltip.textContent = 'Copiado!';
        Object.assign(tooltip.style, {
            visibility: 'visible',
            opacity: '1',
            backgroundColor: '#000000',
            color: '#ffffff',
            textAlign: 'center',
            position: 'absolute',
            borderRadius: '6px',
            padding: '2px',
            top: '60%',
            zIndex: '1'
        });
        btn.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 1000);
    }
}

function redirectToClassObject(event) {
    const classid = event.currentTarget.getAttribute('classidaux');
    window.postMessage(JSON.stringify({
        source: "SYDLE_EXPLORER",
        subject: "_open",
        body: {
            queryParameters: { cid: "000000000000000000000000", id: classid },
            view: null,
            stack: "push",
            target: null
        },
        delay: 0,
        targetOrigin: window.location.origin,
        recipient: { slot: 0, target: "_workspace" },
        sourceSlot: "_self"
    }), window.location.origin);
}

function getJSON(event) {
    const classid = event.currentTarget.getAttribute('classidaux');
    const id      = event.currentTarget.getAttribute('idaux');

    let mytoken;
    try {
        const user = JSON.parse(localStorage.getItem("explorer_user_map"));
        mytoken     = user.main.users[0].accessToken.token;
    } catch (e) {
        console.error('[SYDLE Extension] Não foi possível ler o token do localStorage:', e);
        return;
    }

    const url = `${window.location.origin}/api/1/main/_classId/${classid}/_get/${id}`;

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${mytoken}`);

    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
            try {
                const jsonObject = JSON.parse(xhr.responseText);
                const beautifyUrl = chrome.runtime.getURL("json-viewer/jsonviewer.html") + "?jso=" + encodeURIComponent(JSON.stringify(jsonObject));
                chrome.runtime.sendMessage({ url: beautifyUrl });
            } catch (e) {
                console.error('[SYDLE Extension] Erro ao processar resposta JSON:', e);
            }
        } else {
            console.error(`[SYDLE Extension] getJSON falhou com status: ${xhr.status}`);
        }
    };

    xhr.send();
}

function copyGetPath(event) {
    const btn       = event.currentTarget;
    const classid   = btn.getAttribute('classidaux');
    const id        = btn.getAttribute('idaux');
    const copypath  = `const el = _utils.getMethod('_classId', '${classid}', '_get')({_id: '${id}'});`;

    const showFeedback = (text) => {
        const original = btn.textContent;
        btn.textContent = text;
        setTimeout(() => { btn.textContent = original; }, 1500);
    };

    navigator.clipboard.writeText(copypath)
        .then(() => showFeedback('Copiado!'))
        .catch(() => {
            // Fallback para navegadores sem suporte à Clipboard API
            const ta = document.createElement('textarea');
            ta.value = copypath;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showFeedback('Copiado!');
            } catch (e) {
                showFeedback('Erro');
            }
            ta.remove();
        });
}
