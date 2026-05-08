# GoaPower Sync

`goapower-sync` keeps JavaScript object graphs in sync across processes.

It was created for server-owned reactive state that must be represented in the UI. Without a generic sync layer, every server mutation needs a matching event name, payload shape, and client reducer. That becomes repetitive when the UI should mostly mirror server state.

## Before

Without `goapower-sync`, each state change needs a specific event and specific client-side apply logic.

Server side:

```ts
const session = {
  currentEntryId: null as string | null,
  entries: {} as Record<string, { type: string; response?: string }>,
};

session.entries.e1 = { type: 'agent_response', response: '' };
transport.send({
  type: 'entry_created',
  id: 'e1',
  entry: session.entries.e1,
});

session.currentEntryId = 'e1';
transport.send({
  type: 'current_entry_changed',
  id: 'e1',
});

session.entries.e1.response += 'hello';
transport.send({
  type: 'entry_response_appended',
  id: 'e1',
  text: 'hello',
});
```

Client side:

```ts
transport.onEvent((event) => {
  if (event.type === 'entry_created') {
    uiState.entries[event.id] = event.entry;
  }

  if (event.type === 'current_entry_changed') {
    uiState.currentEntryId = event.id;
  }

  if (event.type === 'entry_response_appended') {
    uiState.entries[event.id].response += event.text;
  }
});
```

## After

With `goapower-sync`, mutate the server state and send the generic snapshot or patch event.

Server side:

```ts
const session = reactive({
  currentEntryId: null as string | null,
  entries: {} as Record<string, { type: string; response: string }>,
});

transport.send(getSnapshotEvent(session));

session.entries.e1 = { type: 'agent_response', response: '' };
session.currentEntryId = 'e1';
reactiveAppend(session.entries.e1, 'response', 'hello');

transport.send(getPatchEvent(session));
```

Client side:

```ts
const client = createSyncClient();

transport.onEvent((event) => {
  client.apply(event);
});

const uiState = client.value as {
  currentEntryId: string | null;
  entries: Record<string, { type: string; response: string }>;
};
```
