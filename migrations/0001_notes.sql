CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK(anchor_type IN ('token','phrase','clause','verse-range','source-page')),
  anchor_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) > 0),
  tags TEXT NOT NULL CHECK(json_valid(tags)),
  provenance_tag TEXT NOT NULL CHECK(provenance_tag IN ('quoted','paraphrased','my-inference','agent-generated')),
  source_locator TEXT CHECK(source_locator IS NULL OR json_valid(source_locator)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(provenance_tag NOT IN ('quoted','paraphrased') OR source_locator IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS notes_owner_anchor ON notes(owner_id, anchor_id);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(body, content='notes', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid,body) VALUES(new.rowid,new.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,body) VALUES('delete',old.rowid,old.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,body) VALUES('delete',old.rowid,old.body);
  INSERT INTO notes_fts(rowid,body) VALUES(new.rowid,new.body);
END;
