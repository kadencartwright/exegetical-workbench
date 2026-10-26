import { Context, Effect } from 'effect';
import { noteInputSchema, type Note, type NoteInput } from '@exegetical/shared';
import { ServiceError } from './errors';

export interface NotesRepository {
  list(owner: string, anchor?: string, query?: string): Promise<Note[]>;
  get(owner: string, id: string): Promise<Note | null>;
  put(owner: string, note: Note, create: boolean): Promise<boolean>;
}
export class NotesStore extends Context.Tag('NotesStore')<NotesStore, NotesRepository>() {}
const database = <A>(op: () => Promise<A>) => Effect.tryPromise({ try: op, catch: () => new ServiceError(503, 'notes-unavailable', 'Notes storage is unavailable.') });
export const listNotes = (owner: string, anchor?: string, query?: string) => Effect.gen(function* () {
  const store = yield* NotesStore;
  return yield* database(() => store.list(owner, anchor, query));
});
export const getNote = (owner: string, id: string) => Effect.gen(function* () {
  const store = yield* NotesStore;
  const note = yield* database(() => store.get(owner, id));
  if (!note) return yield* Effect.fail(new ServiceError(404, 'not-found', 'Note not found.'));
  return note;
});
export const saveNote = (owner: string, input: unknown, id?: string, agent = false) => Effect.gen(function* () {
  const parsed = noteInputSchema.safeParse(agent && input && typeof input === "object" ? {...input, provenanceTag: "agent-generated"} : input);
  if (!parsed.success) return yield* Effect.fail(new ServiceError(400, 'invalid-note', parsed.error.message));
  // Agent provenance is enforced by the service, never trusted from a client.
  if (!agent && parsed.data.provenanceTag === 'agent-generated') return yield* Effect.fail(new ServiceError(400, 'invalid-provenance', 'Use MCP for agent-generated writes; human review promotes them to my inference.'));
  const store = yield* NotesStore;
  const existing = id ? yield* getNote(owner, id) : undefined;
  const now = new Date().toISOString();
  const note: Note = { ...parsed.data, id: id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  const saved = yield* database(() => store.put(owner, note, !id));
  if (!saved) return yield* Effect.fail(new ServiceError(404, 'not-found', 'Note not found.'));
  return note;
});
interface Row { id: string; anchor_type: NoteInput['anchor']['type']; anchor_id: string; body: string; tags: string; provenance_tag: NoteInput['provenanceTag']; source_locator: string | null; additional_anchors?: string; created_at: string; updated_at: string }
const decode = (r: Row): Note => ({ id: r.id, anchor: { type: r.anchor_type, id: r.anchor_id }, ...(r.additional_anchors ? {additionalAnchors:JSON.parse(r.additional_anchors)} : {}), body: r.body, tags: JSON.parse(r.tags), provenanceTag: r.provenance_tag, ...(r.source_locator ? { sourceLocator: JSON.parse(r.source_locator) } : {}), createdAt: r.created_at, updatedAt: r.updated_at });
export const d1Notes = (db: D1Database): NotesRepository => ({
  async list(owner, anchor, query) {
    const conditions = ['n.owner_id = ?']; const params: string[] = [owner];
    if (anchor) { conditions.push("(n.anchor_id = ? OR EXISTS (SELECT 1 FROM json_each(n.additional_anchors) a WHERE json_extract(a.value,'$.id')=?))"); params.push(anchor,anchor); }
    if (query?.trim()) {
      // Treat user input as literal search terms, never FTS syntax.
      conditions.push('n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)');
      params.push('"' + query.trim().slice(0, 512).replaceAll('"', '""') + '"');
    }
    const result = await db.prepare(`SELECT n.* FROM notes n WHERE ${conditions.join(' AND ')} ORDER BY n.updated_at DESC, n.id`).bind(...params).all<Row>();
    return result.results.map(decode);
  },
  async get(owner, id) { const row = await db.prepare('SELECT * FROM notes WHERE owner_id = ? AND id = ?').bind(owner, id).first<Row>(); return row ? decode(row) : null; },
  async put(owner, n, create) {
    const values = [n.anchor.type, n.anchor.id, n.body, JSON.stringify(n.tags), n.provenanceTag, n.sourceLocator ? JSON.stringify(n.sourceLocator) : null, n.updatedAt, JSON.stringify(n.additionalAnchors ?? [])];
    const stmt = create
      ? db.prepare('INSERT INTO notes(anchor_type,anchor_id,body,tags,provenance_tag,source_locator,updated_at,additional_anchors,created_at,id,owner_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(...values, n.createdAt, n.id, owner)
      : db.prepare('UPDATE notes SET anchor_type=?,anchor_id=?,body=?,tags=?,provenance_tag=?,source_locator=?,updated_at=?,additional_anchors=? WHERE id=? AND owner_id=?').bind(...values, n.id, owner);
    return (await stmt.run()).meta.changes > 0;
  },
});
export function exportMarkdown(notes: Note[]): string {
  return notes.map(n => `# Note ${n.id}\n\nAnchor: ${n.anchor.type} ${n.anchor.id}\nAdditional anchors: ${JSON.stringify(n.additionalAnchors ?? [])}\nProvenance: ${n.provenanceTag}\nTags: ${n.tags.join(', ')}\nCreated: ${n.createdAt}\nUpdated: ${n.updatedAt}\n${n.sourceLocator ? `Source: ${JSON.stringify(n.sourceLocator)}\n` : ''}\n${n.body}\n`).join('\n---\n\n');
}
