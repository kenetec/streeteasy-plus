// Content script: runs inside StreetEasy search pages.
//
// Skeleton stage: proves injection works and the popup can reach us. Card
// discovery, coordinate extraction, and filtering come in build-plan steps 2-5.

console.log('[commute-filter] content script loaded on', location.pathname);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'APPLY_FILTER') {
    console.log('[commute-filter] APPLY_FILTER received', msg.settings);
    applyFilter(msg.settings);
  } else if (msg?.type === 'CLEAR_FILTER') {
    console.log('[commute-filter] CLEAR_FILTER received');
    clearFilter();
  }
});

// On page load, re-apply any saved filter so the user doesn't have to
// reopen the popup on every search page.
chrome.storage.sync.get('commuteSettings').then(({ commuteSettings }) => {
  if (commuteSettings) applyFilter(commuteSettings);
});

async function applyFilter(settings) {
  // Ask the service worker for the isochrone. In the skeleton this returns
  // a stub error — the visible banner proves the full round trip works:
  // popup -> content script -> service worker -> content script.
  const response = await chrome.runtime.sendMessage({
    type: 'GET_ISOCHRONE',
    settings,
  });

  if (!response?.ok) {
    showBanner(
      `Commute filter: ${settings.maxMinutes} min by ${settings.mode} ` +
        `from "${settings.workAddress}" — ${response?.error ?? 'no response'}`
    );
    return;
  }

  // TODO (steps 2-5): discover listing cards, extract coordinates,
  // point-in-polygon test against response.polygon, dim/badge cards,
  // and re-run via MutationObserver as new cards render.
}

function clearFilter() {
  removeBanner();
  // TODO (step 5): remove .commute-filtered-out classes and badges.
}

// --- Minimal on-page status banner (skeleton verification aid) ------------

const BANNER_ID = 'commute-filter-banner';

function showBanner(text) {
  removeBanner();
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.textContent = text;
  document.body.appendChild(el);
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}
