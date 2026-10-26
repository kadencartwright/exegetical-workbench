CREATE INDEX packs_id ON corpus_packs(kind,id);
CREATE TABLE corpus_pack_keys (
 pack TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, key TEXT NOT NULL,
 PRIMARY KEY(pack,kind,record_id,key)
);
CREATE INDEX pack_keys_lookup ON corpus_pack_keys(kind,key,record_id);
CREATE TABLE corpus_pack_renderings (
 strong TEXT PRIMARY KEY, json TEXT NOT NULL CHECK(json_valid(json))
);
