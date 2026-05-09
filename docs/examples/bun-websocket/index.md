# Bun WebSocket

This example syncs a server-owned reactive object to a browser client over WebSocket.

Server:

```ts
import { getPatchEvent, getSnapshotEvent, reactive, subscribeWrites } from 'goapower-sync/src/reactive.ts';
import { encodeSyncTransportValue } from 'goapower-sync/src/transport.ts';
import type { SyncEvent } from 'goapower-sync/src/types.ts';

const object = reactive({ foo: 'bar' });
const clients = new Set<ServerWebSocket<unknown>>();

const send = (ws: ServerWebSocket<unknown>, event: SyncEvent) => {
  ws.send(JSON.stringify(encodeSyncTransportValue(event)));
};

const broadcast = (event: SyncEvent) => {
  for (const ws of clients) send(ws, event);
};

let queued = false;
subscribeWrites(object, () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const event = getPatchEvent(object);
    if (event[1].length > 0) broadcast(event);
  });
});

Bun.serve({
  port: 3000,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response('WebSocket only', { status: 400 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      send(ws, getSnapshotEvent(object));
    },
    close(ws) {
      clients.delete(ws);
    },
  },
});

setInterval(() => {
  object.foo = `bar-${Date.now()}`;
}, 1000);
```

Client:

```ts
import { createSyncClient } from 'goapower-sync/src/client.ts';
import { decodeSyncTransportValue } from 'goapower-sync/src/transport.ts';
import type { SyncEvent } from 'goapower-sync/src/types.ts';

const syncClient = createSyncClient();
let object: { foo: string } | undefined;

const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (message) => {
  const event = decodeSyncTransportValue(JSON.parse(message.data)) as SyncEvent;
  syncClient.apply(event);

  object ??= syncClient.value as { foo: string };
  console.log(object.foo);
};
```
