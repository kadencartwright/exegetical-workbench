CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, login TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_states (state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, verifier TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX auth_states_expiry ON auth_states(expires_at);
