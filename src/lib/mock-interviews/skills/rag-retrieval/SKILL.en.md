---
name: rag-retrieval
description: RAG deep dive covering parsing and chunking, hybrid retrieval, reranking, eval sets, production.
keywords: [rag, retrieval-augmented generation, embedding, vector database, hnsw, bm25, hybrid retrieval, rerank, reranking, query rewriting, chunking, document parsing, graphrag, multimodal documents]
layer: detail
domains: [ai-agent, ai-algorithm]
---

## What interviewers care about

RAG is the part of LLM applications where a demo is easiest to build and a usable system hardest to reach. The interviewer assumes by default that the candidate's "RAG project" is a tutorial with the data source swapped, so they check three places: whether there is a retrieval eval set with recall numbers, whether the candidate can separate "nothing was retrieved" from "retrieved but answered wrong" when debugging, and whether they know that parsing and chunking set the ceiling. In 2026 long context has become much cheaper, so interviewers will also press "why not just put the documents in the context", and a candidate who cannot state the boundary has not thought about it.

## Probing projects and internships

Where to cut in and what to press on when the resume shows the following kinds of experience. The probe is complete only when the candidate can explain the mechanism, where the numbers came from, and one real failure or trade-off; a candidate who offers only framework names and conclusions and cannot describe their own part is a red flag. For the general probing method see project-deep-dive.

- Resume shows a RAG project → probe how the retrieval eval set was built, what the recall and context precision are, the most typical failure case and its final attribution, and why not long context
- Resume shows a vector database → probe the index type and parameters, data volume, how updates are done, and how they migrate when the embedding model changes
- Resume shows "accuracy improved X%" → probe the metric definition, sample count, whether they labeled it themselves, and whether there was a control
- Resume shows reranking / hybrid retrieval / query rewriting → probe which class of failure each solves, how much latency it adds, and whether it has ever been turned off
- Resume shows PDF / table / multimodal parsing → probe how parsing quality is spot-checked, how complex layouts are handled, and what share of failures are parsing errors
- Resume shows GraphRAG / knowledge graphs → probe where the graph came from, the maintenance cost, and the measured difference against plain retrieval

## Common failures and red flags

- Document parsing and chunking: converts every PDF to plain text; chunks only by fixed length; does not realize parsing quality is the ceiling
- Embedding and hybrid retrieval: believes a larger embedding is always better; does not know BM25 and dense retrieval complement each other; says it works well without ever measuring top-k recall
- Reranking and query rewriting: treats "add a rerank" as a cure-all and cannot say which stage it fixes; no evaluation after rewriting
- Retrieval eval set: has never had query-to-correct-document pairs; evaluates by "looks fine"
- Failure attribution: cannot tell retrieval failure from generation failure; no order to the investigation
- Production: index updates rely on full rebuilds with no plan; permission filtering is done after generation; does not know which stage a cache can save

## Frequently tested topics

Only names, ladders and signs of a solid answer are listed, as a reference for how deep a solid answer goes; which topics to ask and how many is decided by this JD and this resume, not a quota.

### RAG pipeline design and failure attribution
- Ladder: why not just put the documents in a long context → what chunking strategy, embedding model and vector index (HNSW/IVF) each affect → how to tell "retrieved but answered wrong" from "nothing retrieved at all" and the investigation order for each → the benefit and latency cost of hybrid retrieval (dense + BM25, RRF fusion), reranking and query rewriting, and at what scale each is worth it
- Signs of a solid answer: can break metrics into three layers, retrieval recall / context precision / faithfulness, and look at each separately; can build a retrieval eval set (query-to-correct-document pairs); has concrete chunking pitfalls (tables, code, cross-page); knows that changing the embedding model means rebuilding the whole index and what that costs; can say when RAG is worse than fine-tuning or plain long context

### Multimodal and document understanding
- Ladder: how images, PDFs and tables enter the LLM pipeline → the difference between OCR + text and a native multimodal model → how to discover parsing errors in complex layouts (multi-column, cross-page tables) → balancing parsing quality, cost and latency
- Signs of a solid answer: parsing results are sampled for human review; tables keep a structured representation; scanned files and native PDFs go through separate paths

### Document parsing and chunking
- Ladder: why parsing and chunking set the RAG ceiling → how structure-based chunking (headings, paragraphs, tables) differs from fixed-length chunking; what parent-child chunks, sliding windows and metadata enrichment each solve → how to discover parsing errors in tables, code, cross-page content, multi-column layouts and scans (spot checks, failure counts by source) → balancing parsing cost, latency and quality; which documents should be parsed by a native multimodal model
- Signs of a solid answer: has concrete chunking pitfall cases; tables keep a structured representation; scans and native PDFs take separate paths; parsing results have a spot-check mechanism

### Hybrid retrieval and reranking
- Ladder: what dense retrieval and BM25 are each good at and why fuse them (RRF and the like) → reranking fixes poor ordering after recall at the cost of latency and money, and at what scale it is worth it → what to do when proper nouns, IDs and abbreviations are not retrieved (sparse fallback, metadata, rules) → how hybrid and reranking affect the latency budget, and how to route by query type
- Signs of a solid answer: can state the concrete fusion method and where the weights came from; has two numbers, recall and latency, before and after reranking; knows which queries go sparse and which go dense

### Query rewriting and routing
- Ladder: what to do when the user's phrasing differs from the document's: what rewriting, multi-query and hypothetical documents (HyDE) each solve → when to retrieve, when to answer directly, when to query structured data (routing) → how to discover drift introduced by rewriting; how to decompose multi-hop questions → the latency cost of rewriting and routing, and at what scale it is worth it
- Signs of a solid answer: has an eval comparison before and after rewriting; routing has explicit rules or a classifier with an error rate; has a concrete multi-hop case

### Retrieval eval sets and failure attribution
- Ladder: how to build query-to-correct-document pairs (manual, fed back from logs, model-generated then human-reviewed) → how to look at the three layers, recall, context precision and faithfulness, separately → the investigation order for "retrieved but answered wrong" versus "nothing retrieved at all" → how large an eval set is enough, how to avoid overlap with prompt examples, how to maintain it as documents change
- Signs of a solid answer: has an eval set and numbers for the three layers; failure cases are classified by layer; the eval set has a maintenance process

### Production: index updates, permissions and caching
- Ladder: how the index keeps up when documents change: incremental updates, versioning, dual-write cutover → whether permission filtering goes before retrieval or after generation, and why → what a query cache, embedding cache and result cache each save, and when they go wrong → multi-tenancy, cost attribution and the latency budget
- Signs of a solid answer: incremental updates have a plan and the consistency window is known; permissions are filtered at the retrieval layer; has cache hit rates and an invalidation strategy

### Structured data and graph retrieval
- Ladder: why pure vector retrieval is not enough when the question lands on tables, databases or knowledge graphs → what text-to-SQL and graph retrieval (GraphRAG) each solve, and where the cost is → where the graph comes from, how it is maintained, and which problems truly need a graph → how structured and unstructured retrieval are combined and routed
- Signs of a solid answer: can say when to use a graph and when SQL; has a measured difference against plain retrieval; knows the maintenance cost of a graph

### Embedding and retrieval models
- Ladder: why vector similarity can represent semantics; the goal of contrastive learning → constructing training pairs, in-batch negatives and hard-negative mining, the temperature coefficient → domain bias, proper nouns not retrieved, how to handle the complementarity of dense and BM25 → the return on investment of training your own embedding, fine-tuning a reranker, and rule-based fallbacks; eval sets (generic MTEB-style versus a self-built domain set)
- Signs of a solid answer: can build a retrieval eval set and report recall; knows the effect of hard negatives; mentions the risk of max-length truncation; can say when to train and when to use an off-the-shelf model
