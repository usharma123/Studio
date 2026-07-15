import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE qa_documents
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'OTHER'
      CHECK (kind IN ('BRD', 'FRS', 'HLD', 'LLD', 'OTHER'))
  `;

  yield* sql`
    ALTER TABLE qa_documents
    ADD COLUMN version TEXT NOT NULL DEFAULT '1'
  `;

  yield* sql`
    UPDATE qa_documents
    SET kind = CASE
      WHEN lower(file_name) LIKE '%business-requirement%'
        OR lower(file_name) LIKE '%brd%'
        OR lower(file_name) GLOB '01[-_ ]*' THEN 'BRD'
      WHEN lower(file_name) LIKE '%functional-requirement%'
        OR lower(file_name) LIKE '%functional-specification%'
        OR lower(file_name) LIKE '%frs%'
        OR lower(file_name) GLOB '02[-_ ]*' THEN 'FRS'
      WHEN lower(file_name) LIKE '%high-level%'
        OR lower(file_name) LIKE '%hld%'
        OR lower(file_name) GLOB '03[-_ ]*' THEN 'HLD'
      WHEN lower(file_name) LIKE '%low-level%'
        OR lower(file_name) LIKE '%lld%'
        OR lower(file_name) GLOB '04[-_ ]*' THEN 'LLD'
      ELSE 'OTHER'
    END
  `;

  yield* sql`
    ALTER TABLE qa_requirements
    ADD COLUMN external_id TEXT
  `;

  yield* sql`
    ALTER TABLE qa_requirements
    ADD COLUMN requirement_type TEXT NOT NULL DEFAULT 'business'
      CHECK (requirement_type IN ('business', 'functional'))
  `;

  yield* sql`
    ALTER TABLE qa_requirements
    ADD COLUMN review_required INTEGER NOT NULL DEFAULT 1
      CHECK (review_required IN (0, 1))
  `;

  yield* sql`
    ALTER TABLE qa_requirements
    ADD COLUMN source_citation TEXT
  `;

  yield* sql`
    UPDATE qa_requirements
    SET external_id = COALESCE(external_id, id)
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_requirements_thread_external_id
    ON qa_requirements(thread_id, external_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_requirement_links (
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      parent_requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      child_requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'parent' CHECK (kind = 'parent'),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, parent_requirement_id, child_requirement_id),
      CHECK (parent_requirement_id != child_requirement_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_traceability_nodes (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN (
        'document', 'business_requirement', 'functional_requirement', 'component',
        'flow', 'control', 'interface', 'data', 'test'
      )),
      label TEXT NOT NULL,
      document_id TEXT REFERENCES qa_documents(id) ON DELETE CASCADE,
      requirement_id TEXT REFERENCES qa_requirements(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (kind = 'document' AND document_id IS NOT NULL AND requirement_id IS NULL) OR
        (kind IN ('business_requirement', 'functional_requirement')
          AND document_id IS NULL AND requirement_id IS NOT NULL) OR
        (kind IN ('component', 'flow', 'control', 'interface', 'data', 'test')
          AND document_id IS NULL AND requirement_id IS NULL)
      )
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_traceability_edges (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      from_id TEXT NOT NULL REFERENCES qa_traceability_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES qa_traceability_nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN (
        'contains', 'extracts', 'authors', 'parent_of', 'realizes', 'touches',
        'writes_to', 'reads_from', 'bypasses', 'depends_on', 'trace_to_test'
      )),
      citation TEXT,
      provenance TEXT NOT NULL CHECK (provenance IN ('deterministic', 'agent')),
      review_status TEXT NOT NULL CHECK (review_status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, from_id, to_id, kind)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_requirement_links_thread_parent
    ON qa_requirement_links(thread_id, parent_requirement_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_requirement_links_thread_child
    ON qa_requirement_links(thread_id, child_requirement_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_traceability_nodes_thread_kind
    ON qa_traceability_nodes(thread_id, kind)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_qa_traceability_edges_thread_kind
    ON qa_traceability_edges(thread_id, kind)
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_traceability_nodes (
      id, thread_id, kind, label, document_id, requirement_id, created_at, updated_at
    )
    SELECT
      'qa-node:document:' || id,
      thread_id,
      'document',
      file_name,
      id,
      NULL,
      created_at,
      updated_at
    FROM qa_documents
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_traceability_nodes (
      id, thread_id, kind, label, document_id, requirement_id, created_at, updated_at
    )
    SELECT
      'qa-node:requirement:' || id,
      thread_id,
      CASE
        WHEN requirement_type = 'functional' THEN 'functional_requirement'
        ELSE 'business_requirement'
      END,
      COALESCE(external_id, title),
      NULL,
      id,
      created_at,
      updated_at
    FROM qa_requirements
  `;

  yield* sql`
    INSERT OR IGNORE INTO qa_traceability_edges (
      id, thread_id, from_id, to_id, kind, citation, provenance, review_status,
      created_at, updated_at
    )
    SELECT
      'qa-edge:document-requirement:' || source_document_id || ':' || id,
      thread_id,
      'qa-node:document:' || source_document_id,
      'qa-node:requirement:' || id,
      'contains',
      source_citation,
      'deterministic',
      'approved',
      created_at,
      updated_at
    FROM qa_requirements
    WHERE source_document_id IS NOT NULL
  `;
});
