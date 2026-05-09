import { describe, expect, test } from 'bun:test';
import {
  createTrackedSyncState,
  getPatch,
  getPatchEvent,
  getSnapshot,
  getSnapshotEvent,
  reactive,
  reactiveAppend,
  resetPatch,
  subscribeWrites,
} from '../src/reactive.ts';
import { createSyncClient } from '../src/client.ts';

describe('sync reactive proxy', () => {
  test('snapshot encodes supported value types and object references', () => {
    const shared = { foo: 'bar' };
    const nested = { message: 'hello' };
    const source: {
      string: string;
      number: number;
      nan: number;
      boolean: boolean;
      nil: null;
      missing?: undefined;
      sharedA: typeof shared;
      sharedB: typeof shared;
      nested: typeof nested;
      items: Array<string | typeof shared | undefined | number>;
      self?: unknown;
    } = {
      string: 'text',
      number: 42,
      nan: Number.NaN,
      boolean: true,
      nil: null,
      missing: undefined,
      sharedA: shared,
      sharedB: shared,
      nested,
      items: ['one', shared, undefined, Number.NaN],
    };
    source.self = source;
    const a = reactive(source);

    expect(getSnapshot(a)).toEqual([
      [1],
      [
        [
          1,
          {
            string: 'text',
            number: 42,
            nan: Number.NaN,
            boolean: true,
            nil: null,
            missing: undefined,
            sharedA: [2],
            sharedB: [2],
            nested: [3],
            items: [4],
            self: [1],
          },
        ],
        [2, { foo: 'bar' }],
        [3, { message: 'hello' }],
        [4, ['one', [2], undefined, Number.NaN]],
      ],
    ]);
  });

  test('nested string assignment records an object property change without a path', () => {
    const a = reactive({ a: { b: 'hello' } });
    getSnapshot(a);

    a.a.b = 'hello !';

    expect(getPatch(a)).toEqual([['set_props', 2, { b: 'hello !' }]]);
    expect(getPatch(a)).toEqual([]);
  });

  test('assigned objects get ids and are sent as object references', () => {
    const a = reactive({ child: null as null | { foo: string } });
    getSnapshot(a);

    a.child = { foo: 'bar' };

    expect(getPatch(a)).toEqual([['set_props', 1, { child: [2] }]]);
    expect(getSnapshot(a)[1]).toEqual([
      [1, { child: [2] }],
      [2, { foo: 'bar' }],
    ]);
  });

  test('tracked state records deletes and compacts repeated writes', () => {
    const tracked = createTrackedSyncState({ message: '', entry: { state: 'pending' } });
    tracked.getSnapshot();

    tracked.value.message = 'hel';
    tracked.value.message = 'hello';
    delete tracked.value.entry.state;

    expect(tracked.flushPatch()).toEqual([
      ['set_props', 1, { message: 'hello' }],
      ['del', 2, 'state'],
    ]);
  });

  test('tracked state can batch changes into a sync_patch event', () => {
    const tracked = createTrackedSyncState({
      currentEntryId: null as string | null,
      entries: {} as Record<string, unknown>,
    });
    tracked.getSnapshot();

    const { result, patch } = tracked.batch((session) => {
      session.entries.e1 = { type: 'user_message' };
      session.currentEntryId = 'e1';
      return session.currentEntryId;
    });

    expect(result).toBe('e1');
    expect(patch).toEqual([
      ['set_props', 2, { e1: [3] }],
      ['set_props', 1, { currentEntryId: 'e1' }],
    ]);

    tracked.value.currentEntryId = 'e2';
    expect(tracked.flushPatchEvent()).toEqual(['sync_patch', [['set_props', 1, { currentEntryId: 'e2' }]]]);
  });

  test('reactive object records compacted patches through getPatch', () => {
    const myObject = reactive({} as { foo?: string });

    myObject.foo = 'bar';
    myObject.foo = 'bar2';

    expect(getPatch(myObject)).toEqual([['set_props', 1, { foo: 'bar2' }]]);
    expect(getPatch(myObject)).toEqual([]);
  });

  test('reactive object groups multiple property sets into set_props', () => {
    const myObject = reactive({} as { foo?: string; foo2?: string });

    myObject.foo = 'a';
    myObject.foo2 = 'b';

    expect(getPatch(myObject)).toEqual([['set_props', 1, { foo: 'a', foo2: 'b' }]]);
  });

  test('reactiveAppend appends to a string and records an append patch', () => {
    const myObject = reactive({ a: 'b' });
    getSnapshot(myObject);

    reactiveAppend(myObject, 'a', 'c');

    expect(myObject.a).toBe('bc');
    expect(getPatch(myObject)).toEqual([['append', 1, 'a', 'c']]);
  });

  test('reactiveAppend compacts repeated appends', () => {
    const myObject = reactive({ a: 'b' });
    getSnapshot(myObject);

    reactiveAppend(myObject, 'a', 'c');
    reactiveAppend(myObject, 'a', 'd');

    expect(myObject.a).toBe('bcd');
    expect(getPatch(myObject)).toEqual([['append', 1, 'a', 'cd']]);
  });

  test('sync client applies append patches', () => {
    const source = reactive({ a: 'b' });
    const client = createSyncClient();
    client.apply(getSnapshotEvent(source));

    reactiveAppend(source, 'a', 'c');
    client.apply(getPatchEvent(source));

    expect((client.value as typeof source).a).toBe('bc');
  });

  test('reactive array groups multiple index sets into set_props', () => {
    const myObject = reactive({ items: ['a', 'b'] });
    getSnapshot(myObject);

    myObject.items[0] = 'aa';
    myObject.items[1] = 'bb';

    expect(getPatch(myObject)).toEqual([['set_props', 2, { 0: 'aa', 1: 'bb' }]]);
  });

  test('getPatch can inspect without flushing and resetPatch clears changes', () => {
    const myObject = reactive({ nested: { count: 0 } });
    getSnapshot(myObject);

    myObject.nested.count = 1;

    expect(getPatch(myObject, { flush: false })).toEqual([['set_props', 2, { count: 1 }]]);
    expect(getPatch(myObject, { flush: false })).toEqual([['set_props', 2, { count: 1 }]]);

    resetPatch(myObject);

    expect(getPatch(myObject)).toEqual([]);
  });

  test('getPatchEvent and getSnapshotEvent create sync events from a reactive object', () => {
    const session = reactive({ currentEntryId: null as string | null });

    expect(getSnapshotEvent(session)).toEqual(['sync_snapshot', [[1], [[1, { currentEntryId: null }]]]]);

    session.currentEntryId = 'e1';

    expect(getPatchEvent(session)).toEqual(['sync_patch', [['set_props', 1, { currentEntryId: 'e1' }]]]);
  });

  test('subscribes to reactive writes', () => {
    const session = reactive({ currentEntryId: null as string | null, nested: { count: 0 } });
    let writes = 0;
    const unsubscribe = subscribeWrites(session, () => {
      writes += 1;
    });

    session.currentEntryId = 'e1';
    session.nested.count = 1;
    unsubscribe();
    session.currentEntryId = 'e2';

    expect(writes).toBe(2);
  });
});
