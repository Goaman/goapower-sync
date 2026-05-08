# GoaPower Sync

`goapower-sync` keeps JavaScript object graphs in sync across processes.

It is built for server-owned reactive state that needs to be mirrored in another process, such as a browser UI. The server mutates normal objects, emits generic snapshot or patch events, and clients apply those events to reconstruct the same state shape.

## Install

```sh
bun add goapower-sync
```

## Usage

```ts
import { createSyncClient } from 'goapower-sync/src/client.ts';
import { getPatchEvent, getSnapshotEvent, reactive } from 'goapower-sync/src/reactive.ts';

const serverState = reactive({
  currentEntryId: null as string | null,
  entries: {} as Record<string, { response: string }>,
});

const client = createSyncClient();

client.apply(getSnapshotEvent(serverState));

serverState.entries.e1 = { response: '' };
serverState.currentEntryId = 'e1';
serverState.entries.e1.response += 'hello';

client.apply(getPatchEvent(serverState));
```

## Documentation

The documentation is built with VitePress:

```sh
bun install
bun run docs:dev
```

Build the static site with:

```sh
bun run docs:build
```

The published GitHub Pages site is generated from `docs/`.

## Tests

```sh
bun test
```
