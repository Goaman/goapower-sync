import { describe, expect, test } from 'bun:test';
import { createSyncClient } from '../src/client.ts';

describe('sync client', () => {
  test('sync client surgically updates the same normal object', () => {
    const client = createSyncClient();

    client.apply([
      'sync_snapshot',
      [
        [1],
        [
          [1, { child: [2], text: 'hello' }],
          [2, { count: 1 }],
        ],
      ],
    ]);

    const value = client.value as any;
    const child = value.child;

    client.apply([
      'sync_patch',
      [
        ['set_props', 1, { text: 'hello !' }],
        ['set_props', 2, { count: 2 }],
      ],
    ]);

    expect(client.value).toBe(value);
    expect(value.text).toBe('hello !');
    expect(value.child).toBe(child);
    expect(value.child.count).toBe(2);
  });

  test('sync client drops pruned object records from future patch handling', () => {
    const client = createSyncClient();

    client.apply([
      'sync_snapshot',
      [
        [1],
        [
          [1, { child: [2] }],
          [2, { count: 1 }],
        ],
      ],
    ]);

    const value = client.value as any;
    const removedChild = value.child;

    client.apply(['sync_patch', [['del', 1, 'child']]]);
    client.apply(['sync_patch', [['set_props', 2, { count: 2 }]]]);

    expect(value.child).toBeUndefined();
    expect(removedChild.count).toBe(1);
  });

  test('sync client releases objects only after the last reference is removed', () => {
    const client = createSyncClient();

    client.apply([
      'sync_snapshot',
      [
        [1],
        [
          [1, { childA: [2], childB: [2] }],
          [2, { count: 1 }],
        ],
      ],
    ]);

    const value = client.value as any;
    const child = value.childA;

    client.apply(['sync_patch', [['del', 1, 'childA']]]);
    client.apply(['sync_patch', [['set_props', 2, { count: 2 }]]]);

    expect(value.childA).toBeUndefined();
    expect(value.childB).toBe(child);
    expect(value.childB.count).toBe(2);

    client.apply(['sync_patch', [['del', 1, 'childB']]]);
    client.apply(['sync_patch', [['set_props', 2, { count: 3 }]]]);

    expect(value.childB).toBeUndefined();
    expect(child.count).toBe(2);
  });

  test('sync client creates objects introduced by patches', () => {
    const client = createSyncClient();

    client.apply([
      'sync_snapshot',
      [
        [1],
        [
          [1, { entries: [2] }],
          [2, {}],
        ],
      ],
    ]);

    client.apply([
      'sync_patch',
      [
        ['set_props', 3, { text: 'hello' }],
        ['set_props', 2, { e1: [3] }],
      ],
    ]);

    expect((client.value as any).entries.e1.text).toBe('hello');
  });
});
