-- Preserve upstream IDs for cross-verse referent resolution without scanning the NT.
CREATE INDEX IF NOT EXISTS corpus_upstream_token ON corpus_records(kind,json_extract(json,'$.upstreamId'));
