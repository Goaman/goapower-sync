import {
  type GetPatchOptions,
  type SyncEncodedValue,
  type SyncObjectId,
  type SyncObjectKey,
  type SyncObjectRecord,
  type SyncObjectReference,
  type SyncObjectSet,
  type SyncArrayItems,
  type SyncObjectProps,
  type SyncPatch,
  type SyncPatchEvent,
  type SyncSnapshot,
  type SyncSnapshotEvent,
  type TrackedSyncState,
} from './types.ts';

const proxyable = (value: unknown): value is object => typeof value === 'object' && value !== null;

interface Tracker {
  objectIds: WeakMap<object, SyncObjectId>;
  rawByProxy: WeakMap<object, object>;
  proxyByRaw: WeakMap<object, object>;
  trackedByProxy: WeakMap<object, TrackedSyncState<object>>;
  objectPublication: ObjectPublicationState;
  setPatches: Map<SyncObjectId, SyncObjectSet>;
  appendPatches: Map<SyncObjectId, Map<SyncObjectKey, string>>;
  deletePatches: Map<SyncObjectId, Set<SyncObjectKey>>;
  changedObjectIds: SyncObjectId[];
  writeListeners: Set<() => void>;
  nextObjectId: number;
}

interface ObjectPublicationState {
  knownObjectIds: Set<SyncObjectId>;
  pendingKnownObjectIds: Set<SyncObjectId>;
}

const trackedByProxy = new WeakMap<object, TrackedSyncState<object>>();
const trackerByProxy = new WeakMap<object, Tracker>();

const createObjectPublicationState = (): ObjectPublicationState => ({
  knownObjectIds: new Set(),
  pendingKnownObjectIds: new Set(),
});

const createTracker = (): Tracker => ({
  objectIds: new WeakMap<object, SyncObjectId>(),
  rawByProxy: new WeakMap<object, object>(),
  proxyByRaw: new WeakMap<object, object>(),
  trackedByProxy,
  objectPublication: createObjectPublicationState(),
  setPatches: new Map<SyncObjectId, SyncObjectSet>(),
  appendPatches: new Map<SyncObjectId, Map<SyncObjectKey, string>>(),
  deletePatches: new Map<SyncObjectId, Set<SyncObjectKey>>(),
  changedObjectIds: [],
  writeListeners: new Set(),
  nextObjectId: 1,
});

const rawObject = (tracker: Tracker, value: object): object => tracker.rawByProxy.get(value) ?? value;

const objectId = (tracker: Tracker, value: object): SyncObjectId => {
  const raw = rawObject(tracker, value);
  const existing = tracker.objectIds.get(raw);
  if (existing != null) return existing;
  const next = tracker.nextObjectId++;
  tracker.objectIds.set(raw, next);
  return next;
};

const propertyNameToObjectKey = (property: string | number | symbol): SyncObjectKey => {
  if (typeof property === 'number') return property;
  if (typeof property === 'symbol') return String(property);
  const numeric = Number(property);
  return Number.isInteger(numeric) && String(numeric) === property ? numeric : property;
};

const encodeValue = (tracker: Tracker, value: unknown): SyncEncodedValue => {
  if (!proxyable(value)) return value as SyncEncodedValue;
  return [objectId(tracker, value)] as const;
};

const trackChangedObject = (tracker: Tracker, id: SyncObjectId) => {
  if (!tracker.changedObjectIds.includes(id)) tracker.changedObjectIds.push(id);
};

const notifyWrite = (tracker: Tracker) => {
  for (const listener of tracker.writeListeners) listener();
};

const markObjectGraphPublished = (publication: ObjectPublicationState, id: SyncObjectId) => {
  publication.knownObjectIds.add(id);
};

const commitPendingObjectPublications = (publication: ObjectPublicationState) => {
  for (const objectId of publication.pendingKnownObjectIds) publication.knownObjectIds.add(objectId);
  publication.pendingKnownObjectIds.clear();
};

const trackNewObjectGraph = (tracker: Tracker, value: object, seen = new Set<SyncObjectId>()) => {
  const raw = rawObject(tracker, value);
  const id = objectId(tracker, raw);
  const publication = tracker.objectPublication;
  if (publication.knownObjectIds.has(id) || seen.has(id)) return;
  seen.add(id);
  publication.pendingKnownObjectIds.add(id);

  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable) continue;
    const valueAtKey = (raw as any)[key as any];
    const prop = propertyNameToObjectKey(key);
    if (proxyable(valueAtKey)) {
      makeProxy(tracker, valueAtKey);
      trackNewObjectGraph(tracker, valueAtKey, seen);
    }
    trackSet(tracker, id, prop, encodeValue(tracker, valueAtKey));
  }

  if (Array.isArray(raw)) trackSet(tracker, id, 'length', raw.length);
};

const trackSet = (tracker: Tracker, id: SyncObjectId, prop: SyncObjectKey, value: SyncEncodedValue) => {
  trackChangedObject(tracker, id);
  let setPatch = tracker.setPatches.get(id);
  if (!setPatch) {
    setPatch = {};
    tracker.setPatches.set(id, setPatch);
  }
  setPatch[String(prop)] = value;
  tracker.appendPatches.get(id)?.delete(prop);
  tracker.deletePatches.get(id)?.delete(prop);
  notifyWrite(tracker);
};

const trackAppend = (tracker: Tracker, id: SyncObjectId, prop: SyncObjectKey, value: string) => {
  trackChangedObject(tracker, id);
  let appendPatch = tracker.appendPatches.get(id);
  if (!appendPatch) {
    appendPatch = new Map<SyncObjectKey, string>();
    tracker.appendPatches.set(id, appendPatch);
  }
  appendPatch.set(prop, (appendPatch.get(prop) ?? '') + value);
  tracker.deletePatches.get(id)?.delete(prop);
  notifyWrite(tracker);
};

const trackDelete = (tracker: Tracker, id: SyncObjectId, prop: SyncObjectKey) => {
  trackChangedObject(tracker, id);
  const setPatch = tracker.setPatches.get(id);
  if (setPatch) delete setPatch[String(prop)];
  tracker.appendPatches.get(id)?.delete(prop);
  let deletePatch = tracker.deletePatches.get(id);
  if (!deletePatch) {
    deletePatch = new Set<SyncObjectKey>();
    tracker.deletePatches.set(id, deletePatch);
  }
  deletePatch.add(prop);
  notifyWrite(tracker);
};

const getTrackerPatch = (tracker: Tracker): SyncPatch => {
  const patch: SyncPatch[number][] = [];
  for (const objectId of tracker.changedObjectIds) {
    const setPatch = tracker.setPatches.get(objectId);
    if (setPatch && Object.keys(setPatch).length > 0) patch.push(['set_props', objectId, { ...setPatch }]);

    const appendPatch = tracker.appendPatches.get(objectId);
    if (appendPatch) {
      for (const [prop, value] of appendPatch) {
        if (value.length > 0) patch.push(['append', objectId, prop, value]);
      }
    }

    const deletePatch = tracker.deletePatches.get(objectId);
    if (deletePatch) {
      for (const prop of deletePatch) patch.push(['del', objectId, prop]);
    }
  }
  return patch;
};

const resetTrackerPatch = (tracker: Tracker) => {
  commitPendingObjectPublications(tracker.objectPublication);
  tracker.setPatches.clear();
  tracker.appendPatches.clear();
  tracker.deletePatches.clear();
  tracker.changedObjectIds.length = 0;
};

const makeProxy = <T extends object>(tracker: Tracker, target: T): T => {
  const raw = rawObject(tracker, target);
  const cached = tracker.proxyByRaw.get(raw);
  if (cached) return cached as T;

  objectId(tracker, raw);

  const proxy = new Proxy(raw, {
    get(currentTarget, property, receiver) {
      const value = Reflect.get(currentTarget, property, receiver);
      if (!proxyable(value)) return value;
      return makeProxy(tracker, value);
    },
    set(currentTarget, property, value, receiver) {
      const prop = propertyNameToObjectKey(property);
      const previous = Reflect.get(currentTarget, property, receiver);
      const previousLength = Array.isArray(currentTarget) ? currentTarget.length : undefined;
      const rawValue = proxyable(value) ? rawObject(tracker, value) : value;
      const didSet = Reflect.set(currentTarget, property, rawValue, receiver);
      if (didSet && previous !== rawValue) {
        if (proxyable(rawValue)) {
          makeProxy(tracker, rawValue);
          trackNewObjectGraph(tracker, rawValue);
        }
        trackSet(tracker, objectId(tracker, currentTarget), prop, encodeValue(tracker, rawValue));
        if (Array.isArray(currentTarget) && prop !== 'length' && previousLength !== currentTarget.length) {
          trackSet(tracker, objectId(tracker, currentTarget), 'length', currentTarget.length);
        }
      }
      return didSet;
    },
    deleteProperty(currentTarget, property) {
      const prop = propertyNameToObjectKey(property);
      const hadProperty = Object.prototype.hasOwnProperty.call(currentTarget, property);
      const didDelete = Reflect.deleteProperty(currentTarget, property);
      if (didDelete && hadProperty) {
        trackDelete(tracker, objectId(tracker, currentTarget), prop);
      }
      return didDelete;
    },
  });

  tracker.rawByProxy.set(proxy, raw);
  tracker.proxyByRaw.set(raw, proxy);
  trackerByProxy.set(proxy, tracker);
  return proxy as T;
};

const snapshotObject = (
  tracker: Tracker,
  value: object,
  records: SyncObjectRecord[],
  seen: Set<SyncObjectId>,
): SyncObjectReference => {
  const raw = rawObject(tracker, value);
  const id = objectId(tracker, raw);
  if (seen.has(id)) return [id] as const;

  seen.add(id);
  markObjectGraphPublished(tracker.objectPublication, id);
  const recordValue: SyncObjectProps | SyncArrayItems = Array.isArray(raw) ? [] : {};
  records.push([id, recordValue]);

  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable) continue;
    const valueAtKey = (raw as any)[key as any];
    const prop = propertyNameToObjectKey(key);
    if (Array.isArray(recordValue) && typeof prop === 'number') {
      recordValue[prop] = encodeValue(tracker, valueAtKey);
    } else if (!Array.isArray(recordValue)) {
      recordValue[String(prop)] = encodeValue(tracker, valueAtKey);
    }
    if (proxyable(valueAtKey)) snapshotObject(tracker, valueAtKey, records, seen);
  }

  return [id] as const;
};

const snapshot = (tracker: Tracker, value: object): SyncSnapshot => {
  const objects: SyncObjectRecord[] = [];
  const rootObject = snapshotObject(tracker, value, objects, new Set<SyncObjectId>());
  return [rootObject, objects];
};

export const createTrackedSyncState = <T extends object>(initialValue: T): TrackedSyncState<T> => {
  const tracker = createTracker();
  const value = makeProxy(tracker, initialValue);

  const tracked: TrackedSyncState<T> = {
    value,
    getPatch: () => getTrackerPatch(tracker),
    flushPatch: () => {
      const patch = getTrackerPatch(tracker);
      resetTrackerPatch(tracker);
      return patch;
    },
    resetPatch: () => {
      resetTrackerPatch(tracker);
    },
    getSnapshot: () => snapshot(tracker, value),
    batch: (fn) => {
      const result = fn(value);
      return { result, patch: tracked.flushPatch() };
    },
    flushPatchEvent: () => ['sync_patch', tracked.flushPatch()],
    snapshotEvent: () => ['sync_snapshot', tracked.getSnapshot()],
    subscribe: (listener) => {
      tracker.writeListeners.add(listener);
      return () => {
        tracker.writeListeners.delete(listener);
      };
    },
  };

  trackedByProxy.set(value, tracked as TrackedSyncState<object>);
  return tracked;
};

export const reactive = <T extends object>(initialValue: T): T => createTrackedSyncState(initialValue).value;

const trackedFor = (value: object): TrackedSyncState<object> => {
  const tracked = trackedByProxy.get(value);
  if (!tracked) {
    throw new Error('Expected an object created by reactive() or createTrackedSyncState().value');
  }
  return tracked;
};

export const getPatch = (value: object, options: GetPatchOptions = {}): SyncPatch => {
  const tracked = trackedFor(value);
  return options.flush === false ? tracked.getPatch() : tracked.flushPatch();
};

export const resetPatch = (value: object): void => trackedFor(value).resetPatch();

export const getSnapshot = (value: object): SyncSnapshot => trackedFor(value).getSnapshot();

export const subscribeWrites = (value: object, listener: () => void): (() => void) =>
  trackedFor(value).subscribe(listener);

export const reactiveAppend = <T extends object, K extends keyof T>(value: T, prop: K, appendValue: string): void => {
  const tracker = trackerByProxy.get(value);
  if (!tracker) throw new Error('Expected an object created by reactive() or createTrackedSyncState().value');

  const raw = rawObject(tracker, value);
  const previous = (raw as T)[prop];
  if (typeof previous !== 'string') {
    throw new Error('reactiveAppend() can only append to string properties');
  }

  (raw as T)[prop] = `${previous}${appendValue}` as T[K];
  trackAppend(tracker, objectId(tracker, raw), propertyNameToObjectKey(prop as string | symbol), appendValue);
};

export const getPatchEvent = (value: object): SyncPatchEvent => ['sync_patch', getPatch(value)];

export const getSnapshotEvent = (value: object): SyncSnapshotEvent => ['sync_snapshot', getSnapshot(value)];
