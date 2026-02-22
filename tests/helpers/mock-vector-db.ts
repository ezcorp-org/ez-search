import type { VectorCollection, VectorMetadata, QueryResult } from '../../src/services/vector-db.js';

interface StoredEntry {
  id: string;
  embedding: Float32Array;
  metadata: VectorMetadata;
}

export function createMockVectorCollection(): VectorCollection & { _store: Map<string, StoredEntry> } {
  const store = new Map<string, StoredEntry>();

  return {
    _store: store,

    insert(id: string, embedding: Float32Array, metadata: VectorMetadata): void {
      store.set(id, { id, embedding, metadata });
    },

    query(_embedding: Float32Array, topK: number): QueryResult[] {
      const entries = Array.from(store.values());
      // Return all entries up to topK with distance 0 (no real similarity calc)
      return entries.slice(0, topK).map((entry) => ({
        id: entry.id,
        distance: 0,
        metadata: entry.metadata,
      }));
    },

    remove(id: string): void {
      store.delete(id);
    },

    optimize(): void {
      // no-op
    },

    close(): void {
      // no-op
    },
  };
}
