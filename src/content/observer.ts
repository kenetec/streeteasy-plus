// Debounced MutationObserver wrapper for re-running classify/decorate as
// StreetEasy's React app replaces or adds card DOM nodes (scrolling, map
// interaction, sorting, pagination all wipe or add cards after Apply).
//
// Feedback-loop guard, two halves working together:
//  1. We observe { childList: true, subtree: true } only — NOT attributes.
//     classify.ts's data-commute writes are attribute mutations, so they're
//     invisible to this observer by construction.
//  2. decorate.ts's badge insertions/removals ARE childList mutations
//     (badges are <span> elements added/removed as normal children), so
//     isRelevantMutation additionally filters out any mutation record whose
//     every added/removed node is one of our own badges (or nested inside
//     one, or a text/comment node).
// Without both halves, classify -> decorate -> mutation -> classify would
// loop forever. StreetEasy-agnostic: the only "ours" marker this module
// knows about is BADGE_ATTR, imported from decorate.ts, not restrung here.

import { log } from '../lib/log';
import { BADGE_ATTR } from './decorate';

export interface ObserverHandle {
  disconnect(): void;
}

const DEFAULT_DEBOUNCE_MS = 250;

function isOwnNode(node: Node): boolean {
  // Text/comment nodes are incidental DOM noise, not listing content.
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  // Covers both "this node is a badge" and "this node is nested inside a
  // badge" (e.g. a mutation record for a child appended within a badge
  // after the badge itself was already inserted).
  return (node as Element).closest(`[${BADGE_ATTR}]`) !== null;
}

/**
 * True if `record` reflects a real content change (relevant) rather than
 * one of our own badge insertions/removals (irrelevant). A record is
 * irrelevant only when EVERY added and removed node is "ours" — any other
 * added/removed node makes the whole record relevant.
 */
export function isRelevantMutation(record: MutationRecord): boolean {
  for (const node of record.addedNodes) {
    if (!isOwnNode(node)) return true;
  }
  for (const node of record.removedNodes) {
    if (!isOwnNode(node)) return true;
  }
  return false;
}

/**
 * Observes `target` for childList/subtree changes and calls
 * `onRelevantChange` (debounced by `debounceMs`, default 250, to coalesce
 * React mutation bursts) whenever at least one mutation record in a batch
 * is relevant. Re-classification is always full-document and unconditional
 * — the observer can't distinguish "new card" from "replaced card", and
 * classify/decorate are already idempotent, so there's no per-node
 * incremental work here.
 */
export function startObserving(
  target: Node,
  onRelevantChange: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS
): ObserverHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver((records) => {
    if (!records.some(isRelevantMutation)) return;

    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      log('observer: relevant DOM change, re-running classify/decorate');
      onRelevantChange();
    }, debounceMs);
  });

  observer.observe(target, { childList: true, subtree: true });

  return {
    disconnect(): void {
      observer.disconnect();
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
