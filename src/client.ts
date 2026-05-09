import { createSyncGraph } from './graph.ts';
import type { SyncEvent } from './types.ts';

export const createSyncClient = () => {
  const graph = createSyncGraph();

  return {
    apply(event: SyncEvent): void {
      graph.apply(event);
    },
    get value(): object | undefined {
      return graph.value;
    },
  };
};
