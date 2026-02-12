-- Vector index (tune lists later; start simple)
-- NOTE: ivfflat requires analyze + enough rows; it's fine to add now.
CREATE INDEX IF NOT EXISTS vocab_embedding_ivfflat ON vocab USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);