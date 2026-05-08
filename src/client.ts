import type { SyncEncodedValue, SyncEvent, SyncObjectId, SyncObjectRecord, SyncObjectReference } from './types.ts';

const isObjectReference = (value: SyncEncodedValue): value is SyncObjectReference =>
  Array.isArray(value) && value.length === 1 && typeof value[0] === 'number';

const propFromTransportKey = (prop: string): string | number => {
  const numeric = Number(prop);
  return Number.isInteger(numeric) && String(numeric) === prop ? numeric : prop;
};

export const createSyncClient = () => {
  const objectsById = new Map<SyncObjectId, any>();
  const encodedValuesById = new Map<SyncObjectId, Map<string | number, SyncEncodedValue>>();
  const refCounts = new Map<SyncObjectId, number>();
  let value: object | undefined;

  const incrementRef = (objectId: SyncObjectId) => {
    refCounts.set(objectId, (refCounts.get(objectId) ?? 0) + 1);
  };

  const releaseObject = (objectId: SyncObjectId) => {
    const nextCount = (refCounts.get(objectId) ?? 0) - 1;
    if (nextCount > 0) {
      refCounts.set(objectId, nextCount);
      return;
    }

    refCounts.delete(objectId);
    objectsById.delete(objectId);
    const encodedValues = encodedValuesById.get(objectId);
    encodedValuesById.delete(objectId);

    if (!encodedValues) return;
    for (const child of encodedValues.values()) {
      if (isObjectReference(child)) releaseObject(child[0]);
    }
  };

  const createObjectShells = (records: readonly SyncObjectRecord[]) => {
    objectsById.clear();
    encodedValuesById.clear();
    refCounts.clear();

    for (const [objectId, recordValue] of records) {
      objectsById.set(objectId, Array.isArray(recordValue) ? [] : {});
      encodedValuesById.set(objectId, new Map());
    }
  };

  const decodeValue = (encodedValue: SyncEncodedValue): unknown =>
    isObjectReference(encodedValue) ? objectsById.get(encodedValue[0]) : encodedValue;

  const setObjectValue = (objectId: SyncObjectId, prop: string | number, encodedValue: SyncEncodedValue) => {
    const target = objectsById.get(objectId);
    if (!target) return;
    target[prop as any] = decodeValue(encodedValue);
  };

  const appendObjectValue = (objectId: SyncObjectId, prop: string | number, appendValue: string) => {
    const target = objectsById.get(objectId);
    if (!target || typeof target[prop as any] !== 'string') return;
    target[prop as any] += appendValue;
  };

  const deleteObjectValue = (objectId: SyncObjectId, prop: string | number) => {
    const target = objectsById.get(objectId);
    if (!target) return;
    delete target[prop as any];
  };

  const releasePreviousValue = (objectId: SyncObjectId, prop: string | number) => {
    const encodedValues = encodedValuesById.get(objectId);
    const previousValue = encodedValues?.get(prop);
    if (isObjectReference(previousValue)) releaseObject(previousValue[0]);
  };

  const setEncodedValue = (objectId: SyncObjectId, prop: string | number, encodedValue: SyncEncodedValue) => {
    const encodedValues = encodedValuesById.get(objectId);
    if (!encodedValues) return;
    encodedValues.set(prop, encodedValue);
  };

  const deleteEncodedValue = (objectId: SyncObjectId, prop: string | number) => {
    encodedValuesById.get(objectId)?.delete(prop);
  };

  const applySnapshotValues = (records: readonly SyncObjectRecord[]) => {
    for (const [objectId, recordValue] of records) {
      const entries = Array.isArray(recordValue) ? recordValue.entries() : Object.entries(recordValue);
      for (const [prop, encodedValue] of entries) {
        setEncodedValue(objectId, prop, encodedValue);
        if (isObjectReference(encodedValue)) incrementRef(encodedValue[0]);
        setObjectValue(objectId, prop, encodedValue);
      }
    }
  };

  const applySnapshotEvent = (event: Extract<SyncEvent, readonly ['sync_snapshot', any]>) => {
    createObjectShells(event[1][1]);
    incrementRef(event[1][0][0]);
    applySnapshotValues(event[1][1]);
    value = objectsById.get(event[1][0][0]);
  };

  const applyPatchEvent = (event: Extract<SyncEvent, readonly ['sync_patch', any]>) => {
    for (const change of event[1]) {
      if (!objectsById.has(change[1])) continue;

      if (change[0] === 'set_props') {
        const values = change[2];
        for (const [propKey, encodedValue] of Object.entries(values)) {
          const prop = propFromTransportKey(propKey);
          releasePreviousValue(change[1], prop);
          if (isObjectReference(encodedValue)) incrementRef(encodedValue[0]);
          setEncodedValue(change[1], prop, encodedValue);
          setObjectValue(change[1], prop, encodedValue);
        }
      } else if (change[0] === 'append') {
        const prop = change[2];
        appendObjectValue(change[1], prop, change[3]);
        const encodedValues = encodedValuesById.get(change[1]);
        const encodedValue = encodedValues?.get(prop);
        if (typeof encodedValue === 'string') encodedValues?.set(prop, encodedValue + change[3]);
      } else {
        releasePreviousValue(change[1], change[2]);
        deleteEncodedValue(change[1], change[2]);
        deleteObjectValue(change[1], change[2]);
      }
    }
  };

  return {
    apply(event: SyncEvent): void {
      if (event[0] === 'sync_snapshot') {
        applySnapshotEvent(event);
      } else {
        applyPatchEvent(event);
      }
    },
    get value(): object | undefined {
      return value;
    },
  };
};
