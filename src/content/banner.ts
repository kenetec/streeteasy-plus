// Minimal on-page status banner (skeleton verification aid — design doc §4).

const BANNER_ID = 'commute-filter-banner';

export function showBanner(text: string): void {
  removeBanner();
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.textContent = text;
  document.body.appendChild(el);
}

export function removeBanner(): void {
  document.getElementById(BANNER_ID)?.remove();
}
