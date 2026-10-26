CREATE TABLE corpus_packs (pack TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, ref TEXT, lemma TEXT, form TEXT, source_id TEXT, json TEXT NOT NULL CHECK(json_valid(json)), PRIMARY KEY(pack,kind,id));
CREATE INDEX packs_ref ON corpus_packs(kind,ref);
CREATE INDEX packs_lemma ON corpus_packs(kind,lemma);
CREATE INDEX packs_source ON corpus_packs(kind,source_id);
