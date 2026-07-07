// Fake timers throughout: startObserving's debounce uses setTimeout, and
// jsdom's MutationObserver callback delivery is a microtask that
// vi.advanceTimersByTimeAsync flushes along with the fake-timed debounce
// (verified empirically — a plain vi.advanceTimersByTimeAsync(debounceMs)
// after a DOM mutation is sufficient; no separate microtask flush needed).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRelevantMutation,
  startObserving,
} from '../src/content/observer';
import { BADGE_ATTR } from '../src/content/decorate';

const DEBOUNCE_MS = 250;

function fakeRecord(overrides: Partial<MutationRecord>): MutationRecord {
  return {
    type: 'childList',
    target: document.createElement('div'),
    addedNodes: [] as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
    ...overrides,
  } as MutationRecord;
}

function badgeElement(): Element {
  const el = document.createElement('span');
  el.setAttribute(BADGE_ATTR, '');
  return el;
}

function realCardElement(): Element {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'listing-card');
  return el;
}

describe('startObserving', () => {
  let target: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    vi.useRealTimers();
    target.remove();
  });

  it('fires exactly one callback 250ms after a real node is appended', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    target.appendChild(realCardElement());

    expect(onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    handle.disconnect();
  });

  it('coalesces ten rapid mutations into exactly one callback, 250ms after the last', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    for (let i = 0; i < 10; i++) {
      target.appendChild(realCardElement());
      // Advance less than the debounce window between each mutation so a
      // naive (non-debounced) implementation would still coalesce here by
      // luck; the real assertion is the total call count below.
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    handle.disconnect();
  });

  it('does not fire when a badge element is inserted (loop-guard: our own decorate.ts writes)', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    const badge = badgeElement();
    target.appendChild(badge);
    // A child appended after the badge is already attached — "nested
    // inside a badge-rooted subtree" rather than the badge root itself.
    badge.appendChild(document.createElement('b'));

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();

    handle.disconnect();
  });

  it('does not fire when a badge element is removed (verdict flip to beyond)', async () => {
    const badge = badgeElement();
    target.appendChild(badge);

    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    badge.remove();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();

    handle.disconnect();
  });

  it('fires when a mutation adds a badge alongside a real node', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    // Both nodes land in the same childList mutation record when added via
    // a single fragment append.
    const fragment = document.createDocumentFragment();
    fragment.appendChild(badgeElement());
    fragment.appendChild(realCardElement());
    target.appendChild(fragment);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    handle.disconnect();
  });

  it('disconnect() stops future callbacks', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);
    handle.disconnect();

    target.appendChild(realCardElement());
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('disconnect() cancels a pending debounced call', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    target.appendChild(realCardElement());
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 50);
    handle.disconnect();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a no-op when disconnect() is called twice', async () => {
    const onChange = vi.fn();
    const handle = startObserving(target, onChange, DEBOUNCE_MS);

    expect(() => {
      handle.disconnect();
      handle.disconnect();
    }).not.toThrow();

    target.appendChild(realCardElement());
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('isRelevantMutation', () => {
  it('is irrelevant when the only added node is a badge', () => {
    const record = fakeRecord({ addedNodes: [badgeElement()] as unknown as NodeList });
    expect(isRelevantMutation(record)).toBe(false);
  });

  it('is irrelevant when the added node is nested inside a badge-rooted subtree', () => {
    const badge = badgeElement();
    const inner = document.createElement('b');
    badge.appendChild(inner);
    const record = fakeRecord({ addedNodes: [inner] as unknown as NodeList });
    expect(isRelevantMutation(record)).toBe(false);
  });

  it('is irrelevant when the only removed node is a badge', () => {
    const record = fakeRecord({ removedNodes: [badgeElement()] as unknown as NodeList });
    expect(isRelevantMutation(record)).toBe(false);
  });

  it('is relevant when a mutation adds a badge alongside a real node', () => {
    const record = fakeRecord({
      addedNodes: [badgeElement(), realCardElement()] as unknown as NodeList,
    });
    expect(isRelevantMutation(record)).toBe(true);
  });

  it('is relevant when a real (non-badge) node is added', () => {
    const record = fakeRecord({ addedNodes: [realCardElement()] as unknown as NodeList });
    expect(isRelevantMutation(record)).toBe(true);
  });

  it('is irrelevant for text-node-only changes', () => {
    const record = fakeRecord({
      addedNodes: [document.createTextNode('hi')] as unknown as NodeList,
    });
    expect(isRelevantMutation(record)).toBe(false);
  });
});
