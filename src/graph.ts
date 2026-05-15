import type {
  SyncEncodedValue,
  SyncEvent,
  SyncObjectId,
  SyncObjectKey,
  SyncObjectRecord,
  SyncObjectReference,
} from './types.ts';

const isObjectReference = (value: SyncEncodedValue): value is SyncObjectReference =>
  Array.isArray(value) && value.length === 1 && typeof value[0] === 'number';

const propFromTransportKey = (prop: string): SyncObjectKey => {
  const numeric = Number(prop);
  return Number.isInteger(numeric) && String(numeric) === prop ? numeric : prop;
};

export interface SyncGraphHooks {
  onSnapshotRoot?(root: object | undefined): void;
  onSet?(object: object, prop: SyncObjectKey, value: unknown): void;
  onAppend?(object: object, prop: SyncObjectKey, value: string): void;
  onDelete?(object: object, prop: SyncObjectKey): void;
  onKeysChanged?(object: object): void;
}

export interface SyncGraphOptions {
  hooks?: SyncGraphHooks;
  pruneUnreferencedObjects?: boolean;
}

export const createSyncGraph = (options: SyncGraphOptions = {}) => {
  const objectsById = new Map<SyncObjectId, any>();
  const encodedValuesById = new Map<SyncObjectId, Map<SyncObjectKey, SyncEncodedValue>>();
  const refCounts = new Map<SyncObjectId, number>();
  const pruneUnreferencedObjects = options.pruneUnreferencedObjects ?? true;
  let value: object | undefined;

  const notifyKeysChanged = (objectId: SyncObjectId) => {
    const target = objectsById.get(objectId);
    if (target) options.hooks?.onKeysChanged?.(target);
  };

  const incrementRef = (objectId: SyncObjectId) => {
    if (!pruneUnreferencedObjects) return;
    refCounts.set(objectId, (refCounts.get(objectId) ?? 0) + 1);
  };

  const releaseObject = (objectId: SyncObjectId) => {
    if (!pruneUnreferencedObjects) return;

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

  const createObjectShell = (objectId: SyncObjectId, isArray: boolean) => {
    const target = isArray ? [] : {};
    objectsById.set(objectId, target);
    encodedValuesById.set(objectId, new Map());
    return target;
  };

  const createObjectShells = (records: readonly SyncObjectRecord[]) => {
    objectsById.clear();
    encodedValuesById.clear();
    refCounts.clear();

    for (const [objectId, recordValue] of records) createObjectShell(objectId, Array.isArray(recordValue));
  };

  const decodeValue = (encodedValue: SyncEncodedValue): unknown =>
    isObjectReference(encodedValue) ? objectsById.get(encodedValue[0]) : encodedValue;

  const setObjectValue = (objectId: SyncObjectId, prop: SyncObjectKey, encodedValue: SyncEncodedValue) => {
    const target = objectsById.get(objectId);
    if (!target) return;

    const hadProperty = Object.prototype.hasOwnProperty.call(target, prop);
    const value = decodeValue(encodedValue);
    target[prop as any] = value;
    options.hooks?.onSet?.(target, prop, value);
    if (!hadProperty) notifyKeysChanged(objectId);
  };

  const appendObjectValue = (objectId: SyncObjectId, prop: SyncObjectKey, appendValue: string) => {
    const target = objectsById.get(objectId);
    if (!target || typeof target[prop as any] !== 'string') return;
    target[prop as any] += appendValue;
    options.hooks?.onAppend?.(target, prop, appendValue);
  };

  const deleteObjectValue = (objectId: SyncObjectId, prop: SyncObjectKey) => {
    const target = objectsById.get(objectId);
    if (!target) return;

    const hadProperty = Object.prototype.hasOwnProperty.call(target, prop);
    delete target[prop as any];
    options.hooks?.onDelete?.(target, prop);
    if (hadProperty) notifyKeysChanged(objectId);
  };

  const releasePreviousValue = (objectId: SyncObjectId, prop: SyncObjectKey) => {
    const encodedValues = encodedValuesById.get(objectId);
    const previousValue = encodedValues?.get(prop);
    if (isObjectReference(previousValue)) releaseObject(previousValue[0]);
  };

  const setEncodedValue = (objectId: SyncObjectId, prop: SyncObjectKey, encodedValue: SyncEncodedValue) => {
    const encodedValues = encodedValuesById.get(objectId);
    if (!encodedValues) return;
    encodedValues.set(prop, encodedValue);
  };

  const deleteEncodedValue = (objectId: SyncObjectId, prop: SyncObjectKey) => {
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
    options.hooks?.onSnapshotRoot?.(value);
  };

  const applyPatchEvent = (event: Extract<SyncEvent, readonly ['sync_patch', any]>) => {
    for (const change of event[1]) {
      if (change[0] === 'set_props') {
        const values = change[2];
        if (!objectsById.has(change[1])) {
          const isArray = Object.keys(values).every((key) => key === 'length' || Number.isInteger(Number(key)));
          createObjectShell(change[1], isArray);
        }
        for (const [propKey, encodedValue] of Object.entries(values)) {
          const prop = propFromTransportKey(propKey);
          releasePreviousValue(change[1], prop);
          if (isObjectReference(encodedValue)) incrementRef(encodedValue[0]);
          setEncodedValue(change[1], prop, encodedValue);
          setObjectValue(change[1], prop, encodedValue);
        }
      } else if (change[0] === 'append') {
        if (!objectsById.has(change[1])) continue;
        const prop = change[2];
        appendObjectValue(change[1], prop, change[3]);
        const encodedValues = encodedValuesById.get(change[1]);
        const encodedValue = encodedValues?.get(prop);
        if (typeof encodedValue === 'string') encodedValues?.set(prop, encodedValue + change[3]);
      } else {
        if (!objectsById.has(change[1])) continue;
        releasePreviousValue(change[1], change[2]);
        deleteEncodedValue(change[1], change[2]);
        deleteObjectValue(change[1], change[2]);
      }
    }
  };

  return {
    apply(event: SyncEvent): void {
      if (event[0] === 'sync_snapshot') applySnapshotEvent(event);
      else applyPatchEvent(event);
    },
    get value(): object | undefined {
      return value;
    },
  };
};
