import { Effect, Layer } from 'effect';
import type { Envelope, Note } from '@exegetical/shared';
import { Corpus, queryCorpus, type CorpusAdapter, type CorpusOperation } from './corpus';
import { NotesStore, getNote, listNotes, saveNote, type NotesRepository } from './notes';
const notesEnvelope = <T extends Note | Note[]>(data: T): Envelope<T> => ({
  data,
  coverage: [{ source: 'private-notes', status: 'loaded', limitations: [] }],
  provenance: (Array.isArray(data) ? data : [data]).flatMap(note => [{ source: 'private-notes', edition: 'personal', version: note.updatedAt, license: 'private', locator: note.id, reviewStatus: note.provenanceTag, deepLink: `/notes/${encodeURIComponent(note.id)}` }, ...(note.sourceLocator ? [note.sourceLocator] : [])]),
});
export function createServices(corpus: CorpusAdapter, notes: NotesRepository) {
  const layer = Layer.merge(Layer.succeed(Corpus, corpus), Layer.succeed(NotesStore, notes));
  const run = async <A, E>(effect: Effect.Effect<A, E, Corpus | NotesStore>): Promise<A> => {
    const result = await Effect.runPromise(Effect.either(Effect.provide(effect, layer)));
    if (result._tag === 'Left') throw result.left;
    return result.right;
  };
  return {
    corpus: (operation: CorpusOperation, params: Record<string, string>) => run(queryCorpus(operation, params)),
    notes: async (owner: string, anchor?: string, query?: string) => notesEnvelope(await run(listNotes(owner, anchor, query))),
    note: async (owner: string, id: string) => notesEnvelope(await run(getNote(owner, id))),
    save: async (owner: string, input: unknown, id?: string) => notesEnvelope(await run(saveNote(owner, input, id))),
  };
}
export type Services = ReturnType<typeof createServices>;
