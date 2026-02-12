import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  vector,
} from "drizzle-orm/pg-core";

export const vocab = pgTable(
  "vocab",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    word: text("word").notNull(),
    pos: text("pos"),
    level: text("level"),
    definition: text("definition"),
    examples: jsonb("examples").$type<string[]>().default([]),
    synonyms: jsonb("synonyms").$type<string[]>().default([]),
    embedding: vector("embedding", { dimensions: 384 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("vocab_word_idx").on(t.word)]
);
