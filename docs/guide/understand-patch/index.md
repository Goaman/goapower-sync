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
