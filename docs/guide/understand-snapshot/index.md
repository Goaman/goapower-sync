# Understand Snapshot

A snapshot is the full object graph at one moment. It is used when a client first connects, or whenever it needs a complete replacement state.

```ts
const message = reactive({
  type: 'agent_response',
  response: 'hello',
  meta: { model: 'gpt' },
});

getSnapshot(message);
```

Produces:

```ts
[
  [1],
  [
    [1, { type: 'agent_response', response: 'hello', meta: [2] }],
    [2, { model: 'gpt' }],
  ],
]
```

The first item is the root object reference:

```ts
[1]
```

That means the synced value starts at object id `1`.

The second item is the object table:

```ts
[
  [1, { type: 'agent_response', response: 'hello', meta: [2] }],
  [2, { model: 'gpt' }],
]
```

Each record is `[objectId, value]`.

Primitive values are stored directly:

```ts
type: 'agent_response'
response: 'hello'
```

Objects and arrays are stored as references:

```ts
meta: [2]
```

That reference points to the second record:

```ts
[2, { model: 'gpt' }]
```

This table-based shape keeps identity intact. If two properties point to the same object, both properties use the same `[id]` reference. If an object points back to itself, the reference can point to its own id.

Arrays use the same object table. The array record value is an array instead of a props object.

```ts
const value = reactive({ letters: ['a', 'b'] });

getSnapshot(value);
```

Produces:

```ts
[
  [1],
  [
    [1, { letters: [2] }],
    [2, ['a', 'b']],
  ],
]
```
