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

When a mutation introduces a new object graph, the patch includes the new object's properties before the parent links to it. This lets clients construct the object from the patch alone.

```ts
const value = reactive({ entries: {} as Record<string, { text: string }> });
getSnapshot(value);

value.entries.e1 = { text: 'hello' };

getPatch(value);
// [
//   ['set_props', 3, { text: 'hello' }],
//   ['set_props', 2, { e1: [3] }],
// ]
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

## `subscribeWrites`

Subscribes to writes on a reactive object graph. The listener runs after every tracked `set`, `delete`, or `reactiveAppend` write. It does not flush patches by itself.

```ts
const value = reactive({ nested: { text: 'hello' } });

const unsubscribe = subscribeWrites(value, () => {
  const event = getPatchEvent(value);
  if (event[1].length > 0) transport.send(event);
});

value.nested.text = 'hello !';

unsubscribe();
```

When many writes can happen in one synchronous operation, batch the send with a microtask so subscribers receive one compacted patch.

```ts
const value = reactive({ currentEntryId: null as string | null, entries: {} as Record<string, unknown> });
let queued = false;

const unsubscribe = subscribeWrites(value, () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const event = getPatchEvent(value);
    if (event[1].length > 0) transport.send(event);
  });
});

value.entries.e1 = { type: 'agent_response' };
value.currentEntryId = 'e1';
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

Tracked state also exposes `subscribe(listener)`, which is the lower-level form of `subscribeWrites(value, listener)`.

## `createSyncClient`

Creates a small plain JavaScript client that applies sync events to a stable object graph.

This is useful for examples, tests, and non-reactive consumers. Reactive library adapters should usually build on `createSyncGraph` so they can connect graph writes to their own notification system.

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

Patch events may introduce new object ids. The client creates missing object or array shells from `set_props` changes before applying references to them.

```ts
client.apply([
  'sync_patch',
  [
    ['set_props', 3, { text: 'hello' }],
    ['set_props', 2, { e1: [3] }],
  ],
]);
```

## `createSyncGraph`

Graph reducer for reactive library adapters.

Use `createSyncGraph` when you need to observe applied sync changes and connect them to another reactive system. `createSyncClient` is a thin plain-object client built on top of this graph reducer.

```ts
import { createSyncGraph } from 'goapower-sync/src/graph.ts';

const graph = createSyncGraph({
  hooks: {
    onSnapshotRoot(root) {
      setRoot(root);
    },
    onSet(object, prop, value) {
      notifyProperty(object, prop, value);
    },
    onAppend(object, prop, value) {
      notifyPropertyAppend(object, prop, value);
    },
    onDelete(object, prop) {
      notifyPropertyDelete(object, prop);
    },
    onKeysChanged(object) {
      notifyObjectKeys(object);
    },
  },
});

graph.apply(event);
graph.value;
```

Returns:

```ts
{
  apply(event: SyncEvent): void;
  readonly value: object | undefined;
}
```

Options:

```ts
interface SyncGraphOptions {
  hooks?: SyncGraphHooks;
  pruneUnreferencedObjects?: boolean;
}
```

`pruneUnreferencedObjects` defaults to `true`. Keep the default for plain JavaScript clients so objects removed from the reachable graph can be released. Set it to `false` for adapters that store metadata in `WeakMap`s keyed by graph objects and need old objects to remain available while their reactive wrappers are still referenced.

Hooks:

```ts
interface SyncGraphHooks {
  onSnapshotRoot?(root: object | undefined): void;
  onSet?(object: object, prop: SyncObjectKey, value: unknown): void;
  onAppend?(object: object, prop: SyncObjectKey, value: string): void;
  onDelete?(object: object, prop: SyncObjectKey): void;
  onKeysChanged?(object: object): void;
}
```

`onSnapshotRoot` runs after a snapshot replaces the graph root.

`onSet` runs after a property has been assigned. The `value` argument is already decoded, so object references point at the target object.

`onAppend` runs after text has been appended to a string property.

`onDelete` runs after a property has been deleted.

`onKeysChanged` runs when a property is added or removed. It does not run for overwriting an existing property.

Patch events may introduce new object ids. When a `set_props` change targets an unknown object id, the graph creates an object or array shell before applying the properties. The shell is treated as an array when the provided keys are array indexes or `length`; otherwise it is treated as a plain object.

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
