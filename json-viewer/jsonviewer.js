var editor = ace.edit("editor");
editor.setTheme("ace/theme/dracula");
editor.session.setMode("ace/mode/json");


const params = new URLSearchParams(window.location.search);
loadEditorOptions();

const jsonObjectEncoded = params.get('jso');
const jsonObject = JSON.parse(jsonObjectEncoded)
editor.setValue(JSON.stringify(jsonObject, null, 2));


function loadEditorOptions() {
    chrome.storage.sync.get({
        selectedTheme: 'styles/dracula.css',
        fontFamily: 'fontFamilies/monospace.css',
        fontSize: '16',
        showId: false
    }, function (items) {
        const theme = items.selectedTheme.split(".")[0].split("/")[1];
        const fontSize = items.fontSize;
        editor.setTheme("ace/theme/" + theme);
        editor.setOptions({

            fontSize: fontSize + "px",
        });
    });
}


