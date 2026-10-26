-- Corpus import is independent of private notes/auth. JSON records preserve pinned provenance.
CREATE TABLE IF NOT EXISTS corpus_records(kind TEXT NOT NULL,id TEXT NOT NULL,book TEXT,lemma TEXT,form TEXT,edition TEXT,ref TEXT,end_ref TEXT,source_id TEXT,json TEXT CHECK(json IS NULL OR json_valid(json)),r2_key TEXT,PRIMARY KEY(kind,id));
CREATE INDEX IF NOT EXISTS corpus_book_ref ON corpus_records(kind,book,ref);
CREATE INDEX IF NOT EXISTS corpus_lemma_filter ON corpus_records(kind,lemma,book,edition,form);
CREATE INDEX IF NOT EXISTS corpus_ref ON corpus_records(kind,json_extract(json,'$.ref'));
CREATE INDEX IF NOT EXISTS corpus_source ON corpus_records(kind,json_extract(json,'$.sourceId'));
CREATE INDEX IF NOT EXISTS corpus_lemma ON corpus_records(kind,json_extract(json,'$.normalizedLemma'));
CREATE INDEX IF NOT EXISTS corpus_fromref ON corpus_records(kind,json_extract(json,'$.fromRef'));
CREATE INDEX IF NOT EXISTS corpus_citation_range ON corpus_records(kind,json_extract(json,'$.reference.ref'),json_extract(json,'$.reference.endRef'));
CREATE INDEX IF NOT EXISTS corpus_provenance_source ON corpus_records(json_extract(json,'$.provenance.source'));
CREATE VIRTUAL TABLE IF NOT EXISTS corpus_pages_fts USING fts5(id UNINDEXED,source_id UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS corpus_lexical_keys(kind TEXT NOT NULL,key TEXT NOT NULL,record_id TEXT NOT NULL,PRIMARY KEY(kind,key,record_id));
CREATE TABLE IF NOT EXISTS corpus_ranges(kind TEXT NOT NULL,start_order INTEGER NOT NULL,end_order INTEGER NOT NULL,record_id TEXT NOT NULL,PRIMARY KEY(kind,record_id));
CREATE INDEX IF NOT EXISTS corpus_range_start ON corpus_ranges(kind,start_order,end_order);
-- Only used by the offline SQL loader for records larger than D1's 100 KB statement limit.
CREATE TABLE IF NOT EXISTS corpus_import_chunks(sequence INTEGER PRIMARY KEY,chunk TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS corpus_record_id ON corpus_records(id);
CREATE INDEX IF NOT EXISTS corpus_provenance_locator ON corpus_records(json_extract(json,'$.provenance.locator'));
CREATE INDEX IF NOT EXISTS corpus_provenance_edition ON corpus_records(json_extract(json,'$.provenance.edition'));
