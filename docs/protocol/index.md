# Interfaces

## `SyncObjectId`

```ts
type SyncObjectId = number; // Stable id assigned to one object by the reactive tracker.
```

## `SyncObjectKey`

```ts
type SyncObjectKey = string | number; // Object or array property key.
```

## `SyncObjectReference`

```ts
type SyncObjectReference = readonly [SyncObjectId]; // Reference to another synced object or array record.
```

## `SyncEncodedValue`

```ts
type SyncEncodedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SyncObjectReference;
```

## `SyncObjectProps` and `SyncArrayItems`

Object records use plain props objects. Array records use proper arrays.

```ts
type SyncObjectProps = Record<string, SyncEncodedValue>; // Encoded enumerable object properties by key.

type SyncArrayItems = SyncEncodedValue[]; // Encoded array items in array order.
```

## `SyncObjectRecord`

```ts
type SyncObjectRecord = readonly [
  id: SyncObjectId, // Stable id assigned to one object by the reactive tracker.
  value: SyncObjectProps | SyncArrayItems, // Object props or array items encoded as primitive values or object references.
];
```

## `SyncObjectChange`

```ts
type SyncObjectChange =
  | readonly [
      type: 'set_props', // Change kind for assigning multiple properties on the same object.
      objectId: SyncObjectId, // Target object id.
      values: Record<string, SyncEncodedValue>, // Property keys and encoded values. Array indexes use string keys like "0".
    ]
  | readonly [
      type: 'append', // Change kind for appending to a string property.
      objectId: SyncObjectId, // Target object id.
      prop: SyncObjectKey, // Property key appended on the target object.
      value: string, // Text appended to the current string value.
    ]
  | readonly [
      type: 'del', // Change kind for deleting a property.
      objectId: SyncObjectId, // Target object id.
      prop: SyncObjectKey, // Property key deleted from the target object.
    ];
```

## `SyncSnapshot`

```ts
type SyncSnapshot = readonly [
  rootObject: SyncObjectReference, // Reference to the root object for this graph.
  objects: readonly SyncObjectRecord[], // Object records reachable from the root.
];
```

## `SyncPatch`

```ts
type SyncPatch = readonly SyncObjectChange[]; // Minimal batch of object property changes.
```

## `SyncSnapshotEvent`

Sends a full object graph snapshot.

```ts
type SyncSnapshotEvent = readonly [
  type: 'sync_snapshot', // Event kind for a full object graph snapshot.
  snapshot: SyncSnapshot, // Root object reference plus all reachable object records.
];
```

## `SyncPatchEvent`

Sends property-level changes for known object ids.

```ts
type SyncPatchEvent = readonly [
  type: 'sync_patch', // Event kind for object property changes.
  patch: SyncPatch, // Ordered object property changes.
];
```

## `SyncEvent`

```ts
type SyncEvent =
  | SyncSnapshotEvent
  | SyncPatchEvent;
```
