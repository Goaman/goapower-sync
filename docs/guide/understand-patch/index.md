# Understand Patch

A patch is the list of changes since the last flush. It is smaller than a snapshot and is used after the client already knows the object table.

```ts
const message = reactive({
  type: 'agent_response',
  response: '',
});

getSnapshot(message);

message.type = 'agent_response_done';

getPatch(message);
```

Produces:

```ts
[
  ['set_props', 1, { type: 'agent_response_done' }],
]
```

Each patch entry starts with a change type.

Patches can also introduce new object ids. When you assign a new nested object, `goapower-sync` first emits that object's properties, then emits the parent reference.

```ts
const session = reactive({
  entries: {} as Record<string, { type: string }>,
});

getSnapshot(session);

session.entries.e1 = { type: 'user_message' };

getPatch(session);
```

Produces:

```ts
[
  ['set_props', 3, { type: 'user_message' }],
  ['set_props', 2, { e1: [3] }],
]
```

Clients apply these changes in order. If object id `3` is missing, the client creates a shell for it from the first `set_props`, then `e1: [3]` can safely point at that object.

## `set_props`

`set_props` assigns one or more properties on the same object.

```ts
[
  'set_props',
  1,
  { type: 'agent_response_done', response: 'hello' },
]
```

This means: on object id `1`, set `type` and `response`.

Repeated writes to the same property are compacted.

```ts
message.response = 'hel';
message.response = 'hello';

getPatch(message);
```

Produces:

```ts
[
  ['set_props', 1, { response: 'hello' }],
]
```

## `append`

`append` appends text to a string property. It is useful for streaming an AI response without resending the full response each time.

```ts
const message = reactive({
  type: 'agent_response',
  response: '',
});

getSnapshot(message);

reactiveAppend(message, 'response', 'hello');
getPatch(message); // [['append', 1, 'response', 'hello']]

reactiveAppend(message, 'response', ' world');
reactiveAppend(message, 'response', '!');

message.response; // 'hello world!'
getPatch(message); // [['append', 1, 'response', ' world!']]
```

The last two appends are concatenated into one patch because they were pending at the same time.

## `del`

`del` deletes one property from an object.

```ts
const message = reactive({
  type: 'agent_response',
  response: 'hello',
  temporary: true,
});

getSnapshot(message);

delete message.temporary;

const patch = getPatch(message);
```

Produces:

```ts
patch; // [['del', 1, 'temporary']]
```

`getPatch(value)` flushes pending changes. Calling it again returns an empty patch until another mutation happens.

```ts
const message = reactive({ temporary: true });
getSnapshot(message);
delete message.temporary;

getPatch(message); // [['del', 1, 'temporary']]
getPatch(message); // []
```
