// Content script: runs inside StreetEasy search pages.
//
// Skeleton stage: proves injection works and the popup can reach us. Card
// discovery, coordinate extraction, and filtering come in build-plan steps 2-5.

import { APPLY_FILTER, CLEAR_FILTER, GET_ISOCHRONE } from '../lib/messages';
import { removeBanner, showBanner } from './banner';
import { log } from '../lib/log';
import type {
  CommuteSettings,
  GetIsochroneMessage,
  GetIsochroneResponse,
  PopupToContentMessage,
} from '../types';

log('content script loaded on', location.pathname);

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const message = msg as PopupToContentMessage;
  if (message?.type === APPLY_FILTER) {
    log('APPLY_FILTER received', message.settings);
    applyFilter(message.settings);
  } else if (message?.type === CLEAR_FILTER) {
    log('CLEAR_FILTER received');
    clearFilter();
  }
});

// On page load, re-apply any saved filter so the user doesn't have to
// reopen the popup on every search page.
chrome.storage.sync.get('commuteSettings').then((stored) => {
  const { commuteSettings } = stored as { commuteSettings?: CommuteSettings };
  if (commuteSettings) applyFilter(commuteSettings);
});

async function applyFilter(settings: CommuteSettings): Promise<void> {
  // Ask the service worker for the isochrone. In the skeleton this returns
  // a stub error — the visible banner proves the full round trip works:
  // popup -> content script -> service worker -> content script.
  const request: GetIsochroneMessage = { type: GET_ISOCHRONE, settings };
  const response = (await chrome.runtime.sendMessage(
    request
  )) as GetIsochroneResponse | undefined;

  log('received', response);

  if (!response?.ok) {
    const error =
      response && !response.ok ? response.error : 'no response';
    showBanner(
      `Commute filter: ${settings.maxMinutes} min by ${settings.mode} ` +
      `from "${settings.workAddress}" — ${error}`
    );
    return;
  }

  // TODO (steps 2-5): discover listing cards, extract coordinates,
  // point-in-polygon test against response.polygon, dim/badge cards,
  // and re-run via MutationObserver as new cards render.
}

function clearFilter(): void {
  removeBanner();
  // TODO (step 5): remove .commute-filtered-out classes and badges.
}
