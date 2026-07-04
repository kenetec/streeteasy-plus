// Popup: collects settings, persists them, and notifies the active tab.
// No API calls happen here — that's the service worker's job (later step).

const els = {
  address: document.getElementById('address'),
  minutes: document.getElementById('minutes'),
  mode: document.getElementById('mode'),
  apply: document.getElementById('apply'),
  clear: document.getElementById('clear'),
  status: document.getElementById('status'),
};

// Restore saved settings when the popup opens.
init();

async function init() {
  const { commuteSettings } = await chrome.storage.sync.get('commuteSettings');
  if (commuteSettings) {
    els.address.value = commuteSettings.workAddress ?? '';
    els.minutes.value = commuteSettings.maxMinutes ?? 30;
    els.mode.value = commuteSettings.mode ?? 'transit';
  }
}

els.apply.addEventListener('click', async () => {
  const settings = readAndValidate();
  if (!settings) return;

  await chrome.storage.sync.set({ commuteSettings: settings });

  const sent = await notifyActiveTab({ type: 'APPLY_FILTER', settings });
  setStatus(
    sent
      ? 'Filter applied.'
      : 'Settings saved. Open a StreetEasy search page to see the filter.'
  );
});

els.clear.addEventListener('click', async () => {
  await chrome.storage.sync.remove('commuteSettings');
  els.address.value = '';
  els.minutes.value = 30;
  els.mode.value = 'transit';
  await notifyActiveTab({ type: 'CLEAR_FILTER' });
  setStatus('Filter cleared.');
});

function readAndValidate() {
  const workAddress = els.address.value.trim();
  // Clamp to Geoapify's 60-minute isochrone cap (design doc §10).
  const maxMinutes = Math.min(
    60,
    Math.max(1, parseInt(els.minutes.value, 10) || 0)
  );
  els.minutes.value = maxMinutes;

  if (!workAddress) {
    setStatus('Enter a work address first.', true);
    return null;
  }
  return { workAddress, maxMinutes, mode: els.mode.value };
}

// Sends a message to the content script in the active tab.
// Returns false if the active tab isn't a StreetEasy search page
// (no content script there to receive the message).
async function notifyActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false;
  }
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}
