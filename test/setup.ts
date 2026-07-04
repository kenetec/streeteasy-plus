// Hand-rolled chrome extension API mock covering exactly the surface the
// extension uses: storage.sync/local (promise-based, in-memory), runtime
// messaging, and tabs. Reset before every test so tests don't leak state.

import { beforeEach, vi } from 'vitest';

type StorageKeys = string | string[] | Record<string, unknown> | null | undefined;

function createStorageArea(store: Record<string, unknown>) {
  return {
    get: vi.fn(async (keys?: StorageKeys) => {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) if (key in store) result[key] = store[key];
        return result;
      }
      const result: Record<string, unknown> = { ...keys };
      for (const key of Object.keys(keys)) {
        if (key in store) result[key] = store[key];
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete store[key];
      }
    }),
  };
}

function installChromeMock(): void {
  const syncStore: Record<string, unknown> = {};
  const localStore: Record<string, unknown> = {};

  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      sync: createStorageArea(syncStore),
      local: createStorageArea(localStore),
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  };
}

installChromeMock();

beforeEach(() => {
  vi.clearAllMocks();
  installChromeMock();
});
