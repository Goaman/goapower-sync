export type SyncObjectId = number;
export type SyncObjectKey = string | number;
export type SyncObjectReference = readonly [id: SyncObjectId];

export type SyncEncodedValue = string | number | boolean | null | undefined | SyncObjectReference;

export type SyncObjectProps = Record<string, SyncEncodedValue>;
export type SyncArrayItems = SyncEncodedValue[];
export type SyncObjectSet = Record<string, SyncEncodedValue>;

export type SyncObjectRecord = readonly [id: SyncObjectId, value: SyncObjectProps | SyncArrayItems];

export type SyncObjectChange =
  | readonly ['set_props', objectId: SyncObjectId, values: SyncObjectSet]
  | readonly ['append', objectId: SyncObjectId, prop: SyncObjectKey, value: string]
  | readonly ['del', objectId: SyncObjectId, prop: SyncObjectKey];

export type SyncSnapshot = readonly [rootObject: SyncObjectReference, objects: readonly SyncObjectRecord[]];

export type SyncPatch = readonly SyncObjectChange[];

export type SyncSnapshotEvent = readonly ['sync_snapshot', snapshot: SyncSnapshot];

export type SyncPatchEvent = readonly ['sync_patch', patch: SyncPatch];

export type SyncEvent = SyncSnapshotEvent | SyncPatchEvent;

export interface TrackedSyncState<T extends object> {
  value: T;
  getPatch(): SyncPatch;
  flushPatch(): SyncPatch;
  resetPatch(): void;
  getSnapshot(): SyncSnapshot;
  batch<Result>(fn: (value: T) => Result): { result: Result; patch: SyncPatch };
  flushPatchEvent(): SyncPatchEvent;
  snapshotEvent(): SyncSnapshotEvent;
  subscribe(listener: () => void): () => void;
}

export interface GetPatchOptions {
  flush?: boolean;
}
