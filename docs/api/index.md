# API

## `reactive`

Creates a proxy-backed object graph. Objects receive stable ids through a `WeakMap`.

```ts
const value = reactive({ nested: { text: 'hello' } });

value.nested.text; // 'hello'
```

## `getSnapshot`

Returns the full object graph snapshot for a reactive object.

```ts
const value = reactive({ nested: { text: 'hello' } });
const snapshot = getSnapshot(value);

snapshot;
// [
//   [1],
//   [
//     [1, { nested: [2] }],
//     [2, { text: 'hello' }],
//   ],
// ]
```

## `getPatch`

Returns the compacted property changes for a reactive object. By default it flushes pending changes.

```ts
const value = reactive({ nested: { text: 'hello' } });
getSnapshot(value);

value.nested.text = 'hello !';

const patch = getPatch(value);

patch; // [['set_props', 2, { text: 'hello !' }]]
```

Calling it again returns an empty patch until the next mutation.

```ts
const value = reactive({ nested: { text: 'hello' } });
getSnapshot(value);
value.nested.text = 'hello !';

getPatch(value); // [['set_props', 2, { text: 'hello !' }]]
getPatch(value); // []
```

Inspect without flushing:

```ts
const value = reactive({ nested: { text: 'hello' } });
getSnapshot(value);
value.nested.text = 'hello !';

const patch = getPatch(value, { flush: false });

patch; // [['set_props', 2, { text: 'hello !' }]]
getPatch(value, { flush: false }); // [['set_props', 2, { text: 'hello !' }]]
```

With `flush: false`, repeated calls return the same pending patch. Use `getPatch(value)` or `resetPatch(value)` to clear it.

## `reactiveAppend`

Appends text to a string property and records an `append` patch instead of sending the full string. This is useful for streaming an AI response chunk by chunk.

```ts
const message = reactive({ type: 'agent_response', response: '' });

reactiveAppend(message, 'response', 'hello');
message.response; // 'hello'
getPatch(message); // [['append', 1, 'response', 'hello']]
message.response; // 'hello'

reactiveAppend(message, 'response', ' world');
reactiveAppend(message, 'response', '!');

message.response; // 'hello world!'
getPatch(message); // [['append', 1, 'response', ' world!']]
message.response; // 'hello world!'
```

## `resetPatch`

Clears pending changes.

```ts
const value = reactive({ nested: { text: 'hello' } });
getSnapshot(value);
value.nested.text = 'hello !';

getPatch(value, { flush: false }); // [['set_props', 2, { text: 'hello !' }]]

resetPatch(value);

getPatch(value); // []
```

## `getSnapshotEvent`

Returns a `sync_snapshot` event.

```ts
const value = reactive({ nested: { text: 'hello' } });
const event = getSnapshotEvent(value);

event;
// [
//   'sync_snapshot',
//   [
//     [1],
//     [
//       [1, { nested: [2] }],
//       [2, { text: 'hello' }],
//     ],
//   ],
// ]
```

## `getPatchEvent`

Returns a `sync_patch` event and flushes pending changes.

```ts
const value = reactive({ nested: { text: 'hello' } });
getSnapshot(value);
value.nested.text = 'hello !';

const event = getPatchEvent(value);

event; // ['sync_patch', [['set_props', 2, { text: 'hello !' }]]]
getPatch(value); // []
```

## `createTrackedSyncState`

Lower-level wrapper if you need direct access to the tracked value and batch helpers.

```ts
const tracked = createTrackedSyncState({ currentEntryId: null });

tracked.value.currentEntryId = 'entry-1';

const patch = tracked.flushPatch();

patch; // [['set_props', 1, { currentEntryId: 'entry-1' }]]
tracked.flushPatch(); // []
```

## `createSyncClient`

Creates a client that applies sync events to a stable normal JavaScript object.

```ts
import { createSyncClient } from 'goapower-sync/src/client.ts';
import { getPatchEvent, getSnapshotEvent, reactive } from 'goapower-sync/src/reactive.ts';

const client = createSyncClient();

const object = reactive({ foo: 'bar' });
client.apply(getSnapshotEvent(object));

const myObject = client.value as { foo: string };
myObject.foo; // 'bar'

object.foo = 'bar2';
client.apply(getPatchEvent(object));

myObject.foo; // 'bar2'
```

## Transport Codec

JSON drops object properties whose value is `undefined`. Use the transport codec when explicit `undefined` matters.

```ts
const encoded = encodeSyncTransportValue({ message: 'hello', foo: undefined });
const json = JSON.stringify(encoded);
const decoded = decodeSyncTransportValue(JSON.parse(json));

encoded; // { message: 'hello', foo: ['u'] }
json; // '{"message":"hello","foo":["u"]}'
decoded; // { message: 'hello', foo: undefined }
```

The codec encodes `undefined` as `['u']`, `null` as `['n']`, and `Number.NaN` as `['nan']`, so these values survive JSON transport.
