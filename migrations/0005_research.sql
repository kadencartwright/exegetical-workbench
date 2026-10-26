ALTER TABLE notes ADD COLUMN additional_anchors TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(additional_anchors));
CREATE TABLE note_links (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, from_id TEXT NOT NULL REFERENCES notes(id), to_id TEXT NOT NULL REFERENCES notes(id), relation TEXT NOT NULL, provenance_tag TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner_id,from_id,to_id,relation), CHECK(from_id<>to_id));
CREATE INDEX note_links_owner ON note_links(owner_id,from_id,to_id);
CREATE TABLE disputes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, provenance_tag TEXT NOT NULL);
CREATE INDEX disputes_owner ON disputes(owner_id,updated_at);
CREATE TABLE dispute_history (dispute_id TEXT NOT NULL REFERENCES disputes(id), revision INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), changed_at TEXT NOT NULL, PRIMARY KEY(dispute_id,revision));
CREATE TRIGGER disputes_update AFTER UPDATE ON disputes BEGIN
 INSERT INTO dispute_history VALUES(old.id,old.revision,old.body,old.updated_at);
END;
