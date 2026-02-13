# Embeddings, Vectors & Semantic AI — A Learning Guide

> A practical guide to understanding the AI concepts behind semantic search,
> word embeddings, and vector similarity — from zero to building real features.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [How Embeddings Work](#2-how-embeddings-work)
3. [Vector Math You Actually Need](#3-vector-math-you-actually-need)
4. [From Words to Vectors — Embedding Models](#4-from-words-to-vectors--embedding-models)
5. [Semantic Similarity & Search](#5-semantic-similarity--search)
6. [Vector Databases](#6-vector-databases)
7. [Practical: Building With Embeddings](#7-practical-building-with-embeddings)
8. [Visualization — Graphs & Clusters](#8-visualization--graphs--clusters)
9. [Advanced Topics](#9-advanced-topics)
10. [Resources & Learning Path](#10-resources--learning-path)

---

## 1. Core Concepts

### What is a Vector?

A **vector** is simply a list (array) of numbers:

```
[0.12, -0.45, 0.78, 0.03, -0.91, ...]
```

In math, a vector represents a point (or direction) in space:
- 2 numbers = a point in 2D space (like x, y on a map)
- 3 numbers = a point in 3D space (like x, y, z)
- 384 numbers = a point in 384-dimensional space (hard to visualize, but math still works!)

### What is an Embedding?

An **embedding** is a vector that *represents the meaning* of something (a word, sentence, image, etc.).

The magic: **things with similar meanings get similar vectors.**

```
"happy"   → [0.21, 0.85, -0.12, ...]
"joyful"  → [0.19, 0.83, -0.10, ...]   ← very close to "happy"!
"fridge"  → [-0.72, 0.01, 0.55, ...]   ← far away from "happy"
```

### What Does "Semantic" Mean?

**Semantic = relating to meaning.**

| Term | What it means |
|------|---------------|
| Semantic search | Search by *meaning*, not exact keywords |
| Semantic similarity | How similar two things are *in meaning* |
| Semantics (in general) | The study of meaning in language |

**Example:**
- **Keyword search** for "car" → only finds documents with the word "car"
- **Semantic search** for "car" → also finds "automobile", "vehicle", "driving", "Tesla"

### What is a Dimension?

The **dimension** of an embedding is how many numbers are in the vector.

```typescript
const DIM = 384; // each word becomes a list of 384 numbers
```

More dimensions = more nuance captured, but also more storage and computation.

| Model | Dimensions | Notes |
|-------|-----------|-------|
| Word2Vec | 100–300 | Classic, older |
| OpenAI `text-embedding-3-small` | 1536 | High quality, API-based |
| `all-MiniLM-L6-v2` | 384 | Good quality, runs locally |
| Cohere `embed-v3` | 1024 | High quality, API-based |

---

## 2. How Embeddings Work

### The Idea

An embedding model is trained on massive amounts of text. During training, it learns that:
- Words appearing in similar contexts have similar meanings
- "The **cat** sat on the mat" and "The **dog** sat on the mat" → cat and dog are similar

### Three Generations of Embeddings

#### Generation 1: Word2Vec / GloVe (2013–2014)
- One vector per word
- "bank" always has the same vector (even though it means both a river bank and a financial bank)
- Simple but limited

#### Generation 2: BERT / Contextual Embeddings (2018)
- Vectors depend on context
- "bank" in "river bank" ≠ "bank" in "bank account"
- Much better understanding

#### Generation 3: Modern Embedding Models (2023+)
- Trained on massive data with sophisticated techniques
- Handle full sentences and paragraphs
- OpenAI, Cohere, Voyage, and open-source alternatives

### A Simple (Fake) Embedding — What Your Code Does Now

```typescript
// Your current embedding.ts — a placeholder hash-based approach
export function embedText(text: string): number[] {
  const v = new Array(DIM).fill(0);
  let h = 2166136261; // FNV-ish hash
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
    const idx = Math.abs(h) % DIM;
    v[idx] += 1;
  }
  // normalize to unit length
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
```

This creates a **deterministic hash** — same input always gives same output.
But it **doesn't understand meaning** — "happy" and "joyful" would be very different.

A **real** embedding model would understand that "happy" ≈ "joyful".

---

## 3. Vector Math You Actually Need

You don't need a math degree. Here are the 3 operations that matter:

### Cosine Similarity

Measures the angle between two vectors. Ranges from -1 to 1.

```
cosine_similarity = (A · B) / (|A| × |B|)
```

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

| Score | Meaning |
|-------|---------|
| 1.0 | Identical meaning |
| 0.7–0.9 | Very similar |
| 0.4–0.6 | Somewhat related |
| 0.0 | No relationship |
| -1.0 | Opposite meaning |

### Euclidean Distance

The straight-line distance between two points.

```typescript
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
```

Smaller distance = more similar. (Opposite of cosine where bigger = more similar.)

### Normalization

Making a vector have length 1 (a "unit vector"). This is what your code already does:

```typescript
const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
return v.map((x) => x / norm);
```

Why normalize? When vectors are normalized, **cosine similarity = dot product**, which is faster to compute.

---

## 4. From Words to Vectors — Embedding Models

### Option A: API-Based (easiest)

```typescript
// OpenAI example
import OpenAI from "openai";
const openai = new OpenAI();

async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding; // 1536-dimensional vector
}
```

**Pros:** High quality, no GPU needed, simple
**Cons:** Costs money per request, requires internet, data sent to third party

### Option B: Local Model (free, private)

Using Hugging Face's `transformers.js` or a local server:

```typescript
// Using a local Ollama server
async function embed(text: string): Promise<number[]> {
  const res = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    body: JSON.stringify({
      model: "all-minilm",
      prompt: text,
    }),
  });
  const data = await res.json();
  return data.embedding; // 384-dimensional vector
}
```

**Pros:** Free, private, works offline
**Cons:** Requires setup, may need decent hardware

### Option C: Serverless (middle ground)

Services like Hugging Face Inference API give you free access to models:

```typescript
async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2",
    {
      method: "POST",
      headers: { Authorization: "Bearer hf_YOUR_TOKEN" },
      body: JSON.stringify({ inputs: text }),
    }
  );
  return await res.json(); // 384-dimensional vector
}
```

---

## 5. Semantic Similarity & Search

### How Semantic Search Works

```
User types: "feeling good"

1. Convert "feeling good" → vector A
2. Compare vector A with all stored word vectors
3. Find the closest vectors (nearest neighbors)
4. Return: "happy", "joyful", "elated", "content", "cheerful"
```

### Nearest Neighbor Search

Finding the closest vectors to a query vector.

**Brute force** (small datasets, < 10k items):
```typescript
function findSimilar(query: number[], allVectors: {word: string, vec: number[]}[], topK = 5) {
  return allVectors
    .map(item => ({
      word: item.word,
      score: cosineSimilarity(query, item.vec),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

**Approximate Nearest Neighbors (ANN)** (large datasets):
- Trades tiny accuracy for huge speed gains
- Algorithms: HNSW, IVF, Annoy
- This is what vector databases use internally

### With pgvector (what your project uses)

```sql
-- Find the 10 most similar words to a given vector
SELECT word, definition,
       embedding <=> '[0.12, -0.45, ...]' AS distance
FROM vocabulary
ORDER BY embedding <=> '[0.12, -0.45, ...]'
LIMIT 10;
```

The `<=>` operator computes cosine distance in pgvector.

---

## 6. Vector Databases

A **vector database** stores embeddings and lets you search them efficiently.

### pgvector (what you're using)

A PostgreSQL extension — you keep using regular Postgres but gain vector operations.

```sql
-- Create a table with a vector column
CREATE TABLE vocabulary (
  id SERIAL PRIMARY KEY,
  word TEXT NOT NULL,
  definition TEXT,
  embedding vector(384)  -- 384-dimensional vector
);

-- Create an index for fast search
CREATE INDEX ON vocabulary USING ivfflat (embedding vector_cosine_ops);

-- Search for similar words
SELECT word, embedding <=> $1 AS distance
FROM vocabulary
ORDER BY embedding <=> $1
LIMIT 5;
```

**Operators in pgvector:**
| Operator | What it does |
|----------|-------------|
| `<->` | Euclidean distance (L2) |
| `<=>` | Cosine distance |
| `<#>` | Inner product (negative) |

### Other Vector Databases

| Database | Type | Best for |
|----------|------|----------|
| **pgvector** | Postgres extension | Already using Postgres |
| **ChromaDB** | Embedded | Small projects, prototyping |
| **Pinecone** | Cloud service | Production, managed |
| **Weaviate** | Self-hosted / cloud | Full-featured |
| **Qdrant** | Self-hosted / cloud | High performance |
| **FAISS** | Library (Python) | Research, large scale |

---

## 7. Practical: Building With Embeddings

### Pattern 1: Similar Words Feature

```
User looks at "ephemeral"
→ System shows: "transient", "fleeting", "momentary", "temporary"
```

### Pattern 2: Smart Vocabulary Grouping

```
Embed all vocabulary words → Cluster them → Auto-create topic groups
"ephemeral", "transient", "fleeting" → Group: "Time / Duration"
"gregarious", "affable", "sociable" → Group: "Social Behavior"
```

### Pattern 3: Study Recommendations

```
User knows "happy" well
→ Suggest learning "elated", "jubilant", "euphoric" (nearby in embedding space)
```

### Pattern 4: RAG (Retrieval-Augmented Generation)

```
User asks: "What words do I know about being sad?"
1. Embed the question
2. Find similar vocabulary entries
3. Feed them to an LLM as context
4. LLM generates a helpful answer with YOUR vocabulary
```

---

## 8. Visualization — Graphs & Clusters

Your project has a graph page for visualizing word relationships. Here's the theory behind it.

### The Problem

Embeddings have 384+ dimensions. Humans can only see 2D or 3D.

### Dimensionality Reduction

Techniques to squash 384D → 2D while preserving relationships:

| Technique | Pros | Cons |
|-----------|------|------|
| **t-SNE** | Great at showing clusters | Slow, non-deterministic |
| **UMAP** | Fast, preserves structure well | Need to tune parameters |
| **PCA** | Fast, deterministic | Loses more information |

### How Your Graph Could Work

```
1. Get embeddings for all vocabulary words (384-dim vectors)
2. Run UMAP to reduce to 2D (x, y coordinates)
3. Draw nodes (words) at those coordinates
4. Draw edges between words above a similarity threshold
5. Result: a visual map of your vocabulary!
```

Words that are close on the graph are semantically similar.

---

## 9. Advanced Topics

### Fine-Tuning Embedding Models

Train a model to be better at YOUR specific domain:

```
Before fine-tuning: "ephemeral" and "volatile" similarity = 0.4
After fine-tuning:  "ephemeral" and "volatile" similarity = 0.85
```

Useful when off-the-shelf models don't capture your domain's nuances.

### Chunking Strategies

For longer text (paragraphs, documents), how you split text into pieces before embedding matters a lot:

- **Fixed-size chunks**: split every N characters
- **Sentence-based**: split on sentence boundaries
- **Semantic chunking**: split when the topic changes

### Multimodal Embeddings

Models like CLIP can embed both text AND images into the same vector space:

```
"a photo of a cat" → [0.12, 0.85, ...]
[actual photo of cat] → [0.11, 0.84, ...]  ← similar!
```

### Retrieval-Augmented Generation (RAG)

The most popular pattern in AI apps right now:

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐
│ User Question│ ──→ │ Vector Search │ ──→ │   LLM   │
└─────────────┘     │ (find relevant│     │ (answer │
                    │  context)     │     │  using   │
                    └──────────────┘     │  context)│
                                         └─────────┘
```

1. User asks a question
2. Embed the question → find relevant documents via vector search
3. Pass the documents + question to an LLM
4. LLM answers using your actual data

---

## 10. Resources & Learning Path

### Videos (Free)

| Topic | Resource | Time |
|-------|----------|------|
| Vectors & linear algebra | [3Blue1Brown: Essence of Linear Algebra](https://youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab) | ~3 hrs |
| What is a GPT / Transformer | [3Blue1Brown: But what is a GPT?](https://www.youtube.com/watch?v=wjZofJX0v4M) | ~1 hr |
| Word embeddings intuition | [StatQuest: Word Embedding and Word2Vec](https://www.youtube.com/watch?v=viZrOnJclY0) | 20 min |
| Attention mechanism | [3Blue1Brown: Attention in transformers](https://www.youtube.com/watch?v=eMlx5fFNoYc) | 25 min |

### Blog Posts (Free)

| Topic | Resource |
|-------|----------|
| Word2Vec explained visually | [Jay Alammar: The Illustrated Word2Vec](https://jalammar.github.io/illustrated-word2vec/) |
| Transformers explained | [Jay Alammar: The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) |
| BERT explained | [Jay Alammar: The Illustrated BERT](https://jalammar.github.io/illustrated-bert/) |
| RAG explained | [Pinecone: What is RAG?](https://www.pinecone.io/learn/retrieval-augmented-generation/) |
| Vector databases | [Pinecone Learning Center](https://www.pinecone.io/learn/) |

### Courses (Free / Paid)

| Course | Platform | Cost |
|--------|----------|------|
| [fast.ai Practical Deep Learning](https://course.fast.ai/) | fast.ai | Free |
| [Hugging Face NLP Course](https://huggingface.co/learn/nlp-course) | Hugging Face | Free |
| [Building AI Apps with LangChain](https://learn.deeplearning.ai/) | DeepLearning.AI | Free |
| [CS224N: NLP with Deep Learning](https://web.stanford.edu/class/cs224n/) | Stanford | Free (videos) |

### Hands-On Tools

| Tool | What it does |
|------|-------------|
| [Ollama](https://ollama.ai) | Run embedding models locally |
| [LangChain.js](https://js.langchain.com) | Framework for building AI apps in TypeScript |
| [Transformers.js](https://huggingface.co/docs/transformers.js) | Run ML models in the browser / Node.js |
| [Embedding Projector](https://projector.tensorflow.org/) | Visualize embeddings in 3D (interactive) |

### Suggested Learning Order

```
Week 1:  3Blue1Brown linear algebra (episodes 1-4)
         Jay Alammar's Illustrated Word2Vec
         Try: TensorFlow Embedding Projector with sample data

Week 2:  3Blue1Brown GPT series
         Jay Alammar's Illustrated Transformer
         Try: Generate real embeddings with OpenAI or Ollama

Week 3:  Hugging Face NLP Course (chapters 1-4)
         Try: Replace your hash-based embedder with a real model

Week 4:  Learn about pgvector operators and indexing
         Try: Build semantic search for your vocab app
         Try: Visualize your vocabulary as a 2D graph with UMAP
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **ANN** | Approximate Nearest Neighbors — fast (but slightly imprecise) vector search |
| **Attention** | The mechanism that lets transformers weigh which parts of input matter most |
| **BERT** | Bidirectional Encoder Representations from Transformers — a foundational NLP model |
| **Chunking** | Splitting text into smaller pieces before embedding |
| **Cosine similarity** | Measure of angle between two vectors (1 = same direction, 0 = unrelated) |
| **Dimensionality** | How many numbers are in a vector |
| **Embedding** | A vector representation that captures meaning |
| **Fine-tuning** | Further training a model on your specific data |
| **HNSW** | Hierarchical Navigable Small World — a fast ANN algorithm |
| **Inference** | Using a trained model to make predictions |
| **LLM** | Large Language Model (GPT, Claude, Llama, etc.) |
| **Normalization** | Scaling a vector to have length 1 |
| **pgvector** | PostgreSQL extension for vector storage and search |
| **RAG** | Retrieval-Augmented Generation — combining search with LLMs |
| **Semantic** | Relating to meaning |
| **t-SNE** | t-Distributed Stochastic Neighbor Embedding — dimensionality reduction for visualization |
| **Token** | A piece of text (word or sub-word) that models process |
| **Transformer** | The neural network architecture behind modern AI (GPT, BERT, etc.) |
| **UMAP** | Uniform Manifold Approximation — fast dimensionality reduction |
| **Vector** | An ordered list of numbers |
| **Vector database** | A database optimized for storing and searching vectors |
| **Word2Vec** | An early (2013) method for creating word embeddings |
