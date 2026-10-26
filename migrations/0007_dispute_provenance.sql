ALTER TABLE dispute_history ADD COLUMN provenance_tag TEXT NOT NULL DEFAULT 'unknown';
DROP TRIGGER disputes_update;
CREATE TRIGGER disputes_update AFTER UPDATE ON disputes BEGIN
 INSERT INTO dispute_history(dispute_id,revision,body,changed_at,provenance_tag)
 VALUES(old.id,old.revision,old.body,old.updated_at,old.provenance_tag);
END;
