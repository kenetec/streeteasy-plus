// Popup: collects settings, persists them, and notifies the active tab.
// No API calls happen here — that's the service worker's job (later step).

import { APPLY_FILTER, CLEAR_FILTER } from '../lib/messages';
import { clampMinutes, validateSettings } from './settings';
import type { CommuteSettings, PopupToContentMessage, TravelMode } from '../types';

const els = {
  address: document.getElementById('address') as HTMLInputElement,
  minutes: document.getElementById('minutes') as HTMLInputElement,
  mode: document.getElementById('mode') as HTMLSelectElement,
  apply: document.getElementById('apply') as HTMLButtonElement,
  clear: document.getElementById('clear') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLParagraphElement,
};

// Restore saved settings when the popup opens.
init();

async function init(): Promise<void> {
  const stored = await chrome.storage.sync.get('commuteSettings');
  const { commuteSettings } = stored as { commuteSettings?: CommuteSettings };
  if (commuteSettings) {
    els.address.value = commuteSettings.workAddress ?? '';
    els.minutes.value = String(commuteSettings.maxMinutes ?? 30);
    els.mode.value = commuteSettings.mode ?? 'transit';
  }
}

els.apply.addEventListener('click', async () => {
  // Clamped value is always reflected in the field, even if the address
  // turns out to be invalid below.
  const maxMinutes = clampMinutes(parseInt(els.minutes.value, 10));
  els.minutes.value = String(maxMinutes);

  const settings = validateSettings({
    workAddress: els.address.value,
    maxMinutes,
    mode: els.mode.value as TravelMode,
  });

  if (!settings) {
    setStatus('Enter a work address first.', true);
    return;
  }

  await chrome.storage.sync.set({ commuteSettings: settings });

  const sent = await notifyActiveTab({ type: APPLY_FILTER, settings });
  setStatus(
    sent
      ? 'Filter applied.'
      : 'Settings saved. Open a StreetEasy search page to see the filter.'
  );
});

els.clear.addEventListener('click', async () => {
  await chrome.storage.sync.remove('commuteSettings');
  els.address.value = '';
  els.minutes.value = '30';
  els.mode.value = 'transit';
  await notifyActiveTab({ type: CLEAR_FILTER });
  setStatus('Filter cleared.');
});

// Sends a message to the content script in the active tab.
// Returns false if the active tab isn't a StreetEasy search page
// (no content script there to receive the message).
async function notifyActiveTab(
  message: PopupToContentMessage
): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch {
    return false;
  }
}

function setStatus(text: string, isError = false): void {
  els.status.textContent = text;
  els.status.classList.toggle('error', isError);
}
