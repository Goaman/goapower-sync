import { getPatch, getSnapshot } from './reactive.ts';
import { createSyncClient } from './client.ts';
import type { SyncEvent } from './types.ts';

export interface SyncBridgeOptions {
  transport?: (event: SyncEvent) => SyncEvent;
}

export const createSyncBridge = (options: SyncBridgeOptions = {}) => {
  const serverObjects = new Map<string, object>();
  const clients = new Map<string, ReturnType<typeof createSyncClient>>();
  const transport = options.transport ?? ((event: SyncEvent) => event);

  const clientFor = (name: string) => {
    const client = clients.get(name);
    if (!client) throw new Error(`Missing sync client "${name}"`);
    return client;
  };

  const objectFor = (name: string) => {
    const value = serverObjects.get(name);
    if (!value) throw new Error(`Missing registered sync object "${name}"`);
    return value;
  };

  const send = (name: string, event: SyncEvent): SyncEvent => {
    const receivedEvent = transport(event);
    clientFor(name).apply(receivedEvent);
    return receivedEvent;
  };

  const syncSnapshot = (name: string): SyncEvent => send(name, ['sync_snapshot', getSnapshot(objectFor(name))]);

  return {
    registerObject(name: string, value: object): void {
      serverObjects.set(name, value);
    },
    getSync<T extends object>(name: string): T {
      const client = createSyncClient();
      clients.set(name, client);
      syncSnapshot(name);
      return client.value as T;
    },
    sync(name: string): SyncEvent {
      return send(name, ['sync_patch', getPatch(objectFor(name))]);
    },
    syncSnapshot,
  };
};
