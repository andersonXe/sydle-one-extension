document.addEventListener('DOMContentLoaded', function () {
    const toggleList   = document.getElementById('toggleList');
    const toggleDetail = document.getElementById('toggleDetail');
    const toggleQuery  = document.getElementById('toggleQuery');

    // Load saved settings
    chrome.storage.sync.get(['showInList', 'showInDetail', 'showQuery'], function (items) {
        toggleList.checked   = items.showInList   !== false; // Default true
        toggleDetail.checked = items.showInDetail === true;  // Default false
        toggleQuery.checked  = items.showQuery    !== false; // Default true
    });

    toggleList.addEventListener('change', function () {
        chrome.storage.sync.set({ showInList: toggleList.checked });
    });

    toggleDetail.addEventListener('change', function () {
        chrome.storage.sync.set({ showInDetail: toggleDetail.checked });
    });

    toggleQuery.addEventListener('change', function () {
        chrome.storage.sync.set({ showQuery: toggleQuery.checked });
    });
});
