import { describe, expect, test } from 'bun:test';
import { createSyncBridge } from '../src/helpers.ts';
import { getPatch, getSnapshot, reactive } from '../src/reactive.ts';
import { decodeSyncTransportValue, encodeSyncTransportValue } from '../src/transport.ts';
import type { SyncEvent } from '../src/types.ts';

describe('sync transport codec', () => {
  test('preserves sync transport values through JSON', () => {
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
    const { registerObject, getSync, sync } = createSyncBridge({
      transport: (event: SyncEvent) =>
        decodeSyncTransportValue(JSON.parse(JSON.stringify(encodeSyncTransportValue(event)))) as SyncEvent,
    });

    const encodedSnapshotEvent = encodeSyncTransportValue(['sync_snapshot', getSnapshot(a)]);
    expect((encodedSnapshotEvent as any)[1][1][0][1].missing).toEqual(['u']);
    expect((encodedSnapshotEvent as any)[1][1][0][1].nil).toEqual(['n']);
    expect((encodedSnapshotEvent as any)[1][1][0][1].nan).toEqual(['nan']);
    expect((encodedSnapshotEvent as any)[1][1][3][1][2]).toEqual(['u']);
    expect((encodedSnapshotEvent as any)[1][1][3][1][3]).toEqual(['nan']);

    registerObject('myObject', a);
    const myObject = getSync<typeof source>('myObject');

    expect(myObject.string).toBe('text');
    expect(myObject.number).toBe(42);
    expect(myObject.nan).toBeNaN();
    expect(myObject.boolean).toBe(true);
    expect(myObject.nil).toBeNull();
    expect(myObject.missing).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(myObject, 'missing')).toBe(true);
    expect(myObject.sharedA).toEqual({ foo: 'bar' });
    expect(myObject.sharedA).toBe(myObject.sharedB);
    expect(myObject.items).toEqual(['one', myObject.sharedA, undefined, Number.NaN]);
    expect(myObject.self).toBe(myObject);

    a.string = 'text2';
    a.number = 43;
    a.boolean = false;
    a.nan = Number.NaN;
    (a as any).nextNil = null;
    (a as any).nextMissing = 'temporary';
    (a as any).nextMissing = undefined;

    const encodedPatchEvent = encodeSyncTransportValue(['sync_patch', getPatch(a, { flush: false })]);
    const encodedPatchValues = (encodedPatchEvent as any)[1].find(
      (change: any[]) => change[0] === 'set_props' && change[1] === 1,
    )[2];
    expect(encodedPatchValues.nan).toEqual(['nan']);
    expect(encodedPatchValues.nextNil).toEqual(['n']);
    expect(encodedPatchValues.nextMissing).toEqual(['u']);

    sync('myObject');

    const patchedObject = myObject as typeof source & {
      nextNil: null;
      nextMissing?: undefined;
    };
    expect(patchedObject.string).toBe('text2');
    expect(patchedObject.number).toBe(43);
    expect(patchedObject.boolean).toBe(false);
    expect(patchedObject.nan).toBeNaN();
    expect(patchedObject.nextNil).toBeNull();
    expect(patchedObject.nextMissing).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(patchedObject, 'nextMissing')).toBe(true);
    expect(patchedObject.sharedA).toBe(patchedObject.sharedB);
    expect(patchedObject.self).toBe(patchedObject);
  });
});
