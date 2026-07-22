import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrateQaIamDatabaseUnderLock } from "./QaIamMigrations.ts";

export const QA_POSTGRES_MIGRATION_LOCK_KEY = 1_940_718_351;

const migrateQaDatabaseUnderLock = Effect.fn("QaDatabase.migrateUnderLock")(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`CREATE SCHEMA IF NOT EXISTS t3_qa`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_releases (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'qa'),
      release_number INTEGER NOT NULL CHECK (release_number > 0),
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
      phase TEXT NOT NULL CHECK (phase IN ('documents', 'ingestion', 'requirements_review', 'ready')),
      ingestion_status TEXT NOT NULL CHECK (ingestion_status IN ('idle', 'queued', 'processing', 'completed', 'failed')),
      ingestion_progress INTEGER NOT NULL CHECK (ingestion_progress BETWEEN 0 AND 100),
      active_stage TEXT NOT NULL DEFAULT 'intake' CHECK (active_stage IN (
        'intake', 'requirements', 'strategy', 'scenarios', 'test_cases', 'scripts', 'readiness'
      )),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, release_number)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_documents (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'OTHER' CHECK (kind IN ('BRD', 'FRS', 'HLD', 'LLD', 'OTHER')),
      version TEXT NOT NULL DEFAULT '1',
      media_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      sha256 TEXT NOT NULL,
      content_blob BYTEA NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_stage_states (
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK (stage IN (
        'intake', 'requirements', 'strategy', 'scenarios', 'test_cases', 'scripts', 'readiness'
      )),
      ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 7),
      status TEXT NOT NULL CHECK (status IN (
        'locked', 'ready', 'queued', 'running', 'awaiting_review', 'blocked', 'complete', 'stale'
      )),
      progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
      active_job_id TEXT,
      active_environment_id TEXT,
      active_conversation_thread_id TEXT,
      active_provider_session_id TEXT,
      blocked_reason TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (thread_id, stage),
      UNIQUE (thread_id, ordinal)
    )
  `;
  yield* sql`ALTER TABLE qa_stage_states ADD COLUMN IF NOT EXISTS active_environment_id TEXT`;
  yield* sql`ALTER TABLE qa_stage_states ADD COLUMN IF NOT EXISTS active_conversation_thread_id TEXT`;
  yield* sql`ALTER TABLE qa_stage_states ADD COLUMN IF NOT EXISTS active_provider_session_id TEXT`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_requirements (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      source_document_id TEXT REFERENCES qa_documents(id) ON DELETE SET NULL,
      external_id TEXT NOT NULL,
      requirement_type TEXT NOT NULL DEFAULT 'business' CHECK (requirement_type IN ('business', 'functional')),
      review_required INTEGER NOT NULL DEFAULT 1 CHECK (review_required IN (0, 1)),
      source_citation TEXT,
      source_document_name TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      extraction_method TEXT NOT NULL DEFAULT 'unknown',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, external_id)
    )
  `;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN IF NOT EXISTS source_document_name TEXT`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN IF NOT EXISTS confidence REAL NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN IF NOT EXISTS tags_json TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE qa_requirements ADD COLUMN IF NOT EXISTS extraction_method TEXT NOT NULL DEFAULT 'unknown'`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_approval_gates (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('requirements_review', 'release_readiness')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
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
      external_id TEXT,
      document_id TEXT REFERENCES qa_documents(id) ON DELETE CASCADE,
      requirement_id TEXT REFERENCES qa_requirements(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`ALTER TABLE qa_traceability_nodes ADD COLUMN IF NOT EXISTS external_id TEXT`;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_authored_flows (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      actor TEXT NOT NULL,
      trigger_text TEXT NOT NULL,
      narrative TEXT NOT NULL,
      outcome TEXT NOT NULL,
      legs_json TEXT NOT NULL DEFAULT '[]',
      component_ids_json TEXT NOT NULL DEFAULT '[]',
      component_mentions_json TEXT NOT NULL DEFAULT '[]',
      requirement_ids_json TEXT NOT NULL DEFAULT '[]',
      source_document_id TEXT REFERENCES qa_documents(id) ON DELETE SET NULL,
      review_status TEXT NOT NULL CHECK (review_status IN (
        'pending', 'reviewed', 'manual_override'
      )),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (thread_id, external_id)
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
    ALTER TABLE qa_traceability_edges
    DROP CONSTRAINT IF EXISTS qa_traceability_edges_kind_check
  `;
  yield* sql`
    ALTER TABLE qa_traceability_edges
    ADD CONSTRAINT qa_traceability_edges_kind_check CHECK (kind IN (
      'contains', 'extracts', 'authors', 'parent_of', 'realizes', 'touches',
      'writes_to', 'reads_from', 'represents', 'bypasses', 'depends_on', 'trace_to_test'
    ))
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_document_chunks (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      document_id TEXT NOT NULL REFERENCES qa_documents(id) ON DELETE CASCADE,
      requirement_external_id TEXT,
      chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
      text_content TEXT NOT NULL,
      byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
      section_path TEXT,
      source_block_ids_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_ingestion_jobs (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_job_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
      stage TEXT NOT NULL,
      progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
      message TEXT NOT NULL,
      last_error TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    )
  `;
  yield* createPlanningTables(sql);
  yield* createApprovalReviewTables(sql);
  yield* backfillTraceabilityParentEdges(sql);
  yield* createIndexes(sql);
  yield* migrateQaIamDatabaseUnderLock(sql);
});

/** Serializes and atomically applies the complete PostgreSQL QA schema pipeline. */
export const migrateQaDatabase = Effect.fn("QaDatabase.migrate")(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`SELECT pg_advisory_xact_lock(${QA_POSTGRES_MIGRATION_LOCK_KEY})`;
      yield* migrateQaDatabaseUnderLock(sql);
    }),
  );
});

const backfillTraceabilityParentEdges = Effect.fn("QaDatabase.backfillTraceabilityParentEdges")(
  function* (sql: SqlClient.SqlClient) {
    yield* sql`
    INSERT INTO qa_traceability_edges (
      id, thread_id, from_id, to_id, kind, citation, provenance,
      review_status, created_at, updated_at
    )
    SELECT
      CONCAT(
        'qa-edge:requirement-parent:', links.parent_requirement_id, ':',
        links.child_requirement_id
      ),
      links.thread_id,
      parent_node.id,
      child_node.id,
      'parent_of',
      child_requirement.source_citation,
      'deterministic',
      parent_requirement.status,
      links.created_at,
      links.updated_at
    FROM qa_requirement_links links
    JOIN qa_traceability_nodes parent_node
      ON parent_node.thread_id = links.thread_id
      AND parent_node.requirement_id = links.parent_requirement_id
    JOIN qa_traceability_nodes child_node
      ON child_node.thread_id = links.thread_id
      AND child_node.requirement_id = links.child_requirement_id
    JOIN qa_requirements parent_requirement ON parent_requirement.id = links.parent_requirement_id
    JOIN qa_requirements child_requirement ON child_requirement.id = links.child_requirement_id
    ON CONFLICT DO NOTHING
  `;
  },
);

const createPlanningTables = Effect.fn("QaDatabase.createPlanningTables")(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`CREATE TABLE IF NOT EXISTS qa_strategies (thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,id TEXT NOT NULL UNIQUE,title TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),generation_status TEXT NOT NULL CHECK(generation_status IN('queued','generating','complete','failed','stale')),review_status TEXT NOT NULL CHECK(review_status IN('draft','pending_review','approved','rejected')),rejection_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_strategy_sections (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,title TEXT NOT NULL,order_index INTEGER NOT NULL CHECK(order_index>=0),content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(thread_id,order_index))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_strategy_section_requirements (thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,section_id TEXT NOT NULL REFERENCES qa_strategy_sections(id) ON DELETE CASCADE,requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(thread_id,section_id,requirement_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_strategy_comments (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,section_id TEXT NOT NULL REFERENCES qa_strategy_sections(id) ON DELETE CASCADE,quote TEXT,body TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('open','resolved')),author TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,resolved_by TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_strategy_comment_replies (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_strategies(thread_id) ON DELETE CASCADE,comment_id TEXT NOT NULL REFERENCES qa_strategy_comments(id) ON DELETE CASCADE,author TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_scenario_plans (thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL CHECK(revision>0),generation_status TEXT NOT NULL CHECK(generation_status IN('queued','generating','complete','failed','stale')),review_status TEXT NOT NULL CHECK(review_status IN('draft','pending_review','approved','rejected')),rejection_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_scenarios (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_scenario_plans(thread_id) ON DELETE CASCADE,external_id TEXT NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN('positive','negative','boundary','exception','integration')),priority TEXT NOT NULL CHECK(priority IN('critical','high','medium','low')),risk TEXT NOT NULL CHECK(risk IN('critical','high','medium','low')),expected_outcome TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','approved','rejected')),decision_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT,UNIQUE(thread_id,external_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_scenario_requirements (thread_id TEXT NOT NULL REFERENCES qa_scenario_plans(thread_id) ON DELETE CASCADE,scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,scenario_id,requirement_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_scenario_preconditions (scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(scenario_id,position))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_case_plans (thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL CHECK(revision>0),generation_status TEXT NOT NULL CHECK(generation_status IN('queued','generating','complete','failed','stale')),review_status TEXT NOT NULL CHECK(review_status IN('draft','pending_review','approved','rejected')),rejection_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_cases (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,external_id TEXT NOT NULL,title TEXT NOT NULL,priority TEXT NOT NULL CHECK(priority IN('critical','high','medium','low')),automation_candidate INTEGER NOT NULL CHECK(automation_candidate IN(0,1)),status TEXT NOT NULL CHECK(status IN('pending','approved','rejected')),decision_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT,UNIQUE(thread_id,external_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_case_scenarios (thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,test_case_id,scenario_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_case_requirements (thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,test_case_id,requirement_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_case_preconditions (test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,position INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(test_case_id,position))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_test_case_steps (test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,step_order INTEGER NOT NULL CHECK(step_order>0),action TEXT NOT NULL,test_data TEXT NOT NULL,expected_result TEXT NOT NULL,PRIMARY KEY(test_case_id,step_order))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_script_plans (thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL CHECK(revision>0),generation_status TEXT NOT NULL CHECK(generation_status IN('queued','generating','complete','failed','stale')),review_status TEXT NOT NULL CHECK(review_status IN('draft','pending_review','approved','rejected')),rejection_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_scripts (id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,external_id TEXT NOT NULL,title TEXT NOT NULL,framework TEXT NOT NULL,language TEXT NOT NULL,file_name TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('draft','ready','executed','failed')),execution_status TEXT NOT NULL CHECK(execution_status IN('not_run','queued','running','passed','failed')),last_run_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(thread_id,external_id),UNIQUE(thread_id,file_name))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_script_test_cases (thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,script_id,test_case_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_script_requirements (thread_id TEXT NOT NULL REFERENCES qa_script_plans(thread_id) ON DELETE CASCADE,script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,PRIMARY KEY(thread_id,script_id,requirement_id))`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_script_evidence (id TEXT PRIMARY KEY,script_id TEXT NOT NULL REFERENCES qa_scripts(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN('log','report','screenshot','other')),summary TEXT NOT NULL,artifact_path TEXT NOT NULL,created_at TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS qa_readiness_reviews (thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,review_status TEXT NOT NULL CHECK(review_status IN('pending','approved','rejected')),decision_note TEXT,computed_at TEXT NOT NULL,approved_at TEXT,approved_by TEXT,rejected_at TEXT,rejected_by TEXT)`;
});

const createApprovalReviewTables = Effect.fn("QaDatabase.createApprovalReviewTables")(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_review_threads (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('strategy', 'scenario_plan')),
        artifact_id TEXT NOT NULL,
        anchor_kind TEXT NOT NULL CHECK (anchor_kind IN ('strategy_section', 'scenario')),
        anchor_id TEXT NOT NULL,
        anchor_label TEXT NOT NULL,
        anchor_quote TEXT,
        severity TEXT NOT NULL CHECK (severity IN ('blocking', 'advisory')),
        created_by_actor_id TEXT NOT NULL,
        created_by_display_name TEXT NOT NULL,
        created_by_role TEXT NOT NULL CHECK (created_by_role IN (
          'root', 'qa:maker', 'qa:approver', 'system'
        )),
        created_at TEXT NOT NULL,
        current_status TEXT NOT NULL CHECK (current_status IN ('open', 'resolved')),
        resolved_at TEXT,
        resolved_by_actor_id TEXT,
        latest_event_at TEXT NOT NULL
      )
    `;
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_review_events (
        id TEXT PRIMARY KEY,
        review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
        event_kind TEXT NOT NULL CHECK (event_kind IN (
          'comment', 'reply', 'correction', 'ai_queued', 'ai_started',
          'ai_completed', 'ai_failed', 'resolved'
        )),
        actor_id TEXT NOT NULL,
        actor_display_name TEXT NOT NULL,
        actor_role TEXT NOT NULL CHECK (actor_role IN (
          'root', 'qa:maker', 'qa:approver', 'system'
        )),
        body TEXT,
        corrects_entry_id TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
        source_chain_hash TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (review_thread_id, sequence_no)
      )
    `;
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_review_ai_runs (
        id TEXT PRIMARY KEY,
        review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
        source_chain_hash TEXT NOT NULL,
        requested_event_sequence INTEGER NOT NULL CHECK (requested_event_sequence > 0),
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        requested_by_actor_id TEXT NOT NULL,
        requested_by_display_name TEXT NOT NULL,
        requested_by_role TEXT NOT NULL CHECK (requested_by_role IN ('root', 'qa:approver')),
        requested_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        verdict TEXT CHECK (verdict IN ('agrees', 'disagrees', 'inconclusive')),
        rationale TEXT,
        citations_json TEXT NOT NULL DEFAULT '[]',
        model TEXT,
        provider_instance_id TEXT,
        error_message TEXT
      )
    `;
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_review_decisions (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('strategy', 'scenario_plan')),
        artifact_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
        blocking_thread_ids_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT,
        actor_id TEXT NOT NULL,
        actor_display_name TEXT NOT NULL,
        actor_role TEXT NOT NULL CHECK (actor_role IN ('root', 'qa:approver')),
        artifact_revision INTEGER NOT NULL CHECK (artifact_revision > 0),
        source_chain_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_review_read_receipts (
        review_thread_id TEXT NOT NULL REFERENCES qa_review_threads(id) ON DELETE CASCADE,
        principal_id TEXT NOT NULL,
        last_read_entry_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (review_thread_id, principal_id)
      )
    `;

  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_review_threads_release_artifact ON qa_review_threads(thread_id, artifact_kind, artifact_id, current_status, latest_event_at)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_review_events_thread_created ON qa_review_events(review_thread_id, created_at, id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_review_ai_runs_thread_requested ON qa_review_ai_runs(review_thread_id, requested_at DESC, id)`;
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_review_ai_runs_one_active ON qa_review_ai_runs(review_thread_id) WHERE status IN ('queued', 'running')`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_review_decisions_release_created ON qa_review_decisions(thread_id, created_at DESC, id)`;

  yield* sql`
      INSERT INTO qa_review_threads (
        id, thread_id, artifact_kind, artifact_id, anchor_kind, anchor_id,
        anchor_label, anchor_quote, severity, created_by_actor_id, created_by_display_name,
        created_by_role,
        created_at, current_status, resolved_at, resolved_by_actor_id, latest_event_at
      )
      SELECT
        comments.id, comments.thread_id, 'strategy', strategies.id,
        'strategy_section', comments.section_id, sections.title, comments.quote,
        'blocking', comments.author, comments.author, 'qa:approver', comments.created_at,
        comments.status, comments.resolved_at, comments.resolved_by,
        COALESCE(
          comments.resolved_at,
          (SELECT MAX(replies.created_at)
           FROM qa_strategy_comment_replies replies
           WHERE replies.comment_id = comments.id),
          comments.created_at
        )
      FROM qa_strategy_comments comments
      JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
      JOIN qa_strategy_sections sections ON sections.id = comments.section_id
      ON CONFLICT (id) DO NOTHING
    `;
  yield* sql`
      INSERT INTO qa_review_events (
        id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
        actor_display_name, actor_role, body,
        payload_json, artifact_revision, source_chain_hash, created_at
      )
      SELECT
        CONCAT('legacy-comment:', comments.id), comments.id, comments.thread_id, 1,
        'comment', comments.author, comments.author, 'qa:approver', comments.body,
        '{"legacy":true}',
        strategies.revision, NULL, comments.created_at
      FROM qa_strategy_comments comments
      JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
      ON CONFLICT (id) DO NOTHING
    `;
  yield* sql`
      INSERT INTO qa_review_events (
        id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
        actor_display_name, actor_role, body,
        payload_json, artifact_revision, source_chain_hash, created_at
      )
      SELECT
        CONCAT('legacy-reply:', replies.id), replies.comment_id, replies.thread_id,
        1 + ROW_NUMBER() OVER (
          PARTITION BY replies.comment_id ORDER BY replies.created_at, replies.id
        ),
        'reply', replies.author, replies.author, 'qa:maker', replies.body, '{"legacy":true}',
        strategies.revision, NULL, replies.created_at
      FROM qa_strategy_comment_replies replies
      JOIN qa_strategies strategies ON strategies.thread_id = replies.thread_id
      ON CONFLICT (id) DO NOTHING
    `;
  yield* sql`
      INSERT INTO qa_review_events (
        id, review_thread_id, thread_id, sequence_no, event_kind, actor_id,
        actor_display_name, actor_role, body,
        payload_json, artifact_revision, source_chain_hash, created_at
      )
      SELECT
        CONCAT('legacy-resolved:', comments.id), comments.id, comments.thread_id,
        2 + (
          SELECT COUNT(*) FROM qa_strategy_comment_replies replies
          WHERE replies.comment_id = comments.id
        ),
        'resolved', COALESCE(comments.resolved_by, 'QA Approver'),
        COALESCE(comments.resolved_by, 'QA Approver'), 'qa:approver', NULL,
        '{"legacy":true,"aiRunId":"legacy:no-ai-review"}', strategies.revision, NULL,
        COALESCE(comments.resolved_at, comments.created_at)
      FROM qa_strategy_comments comments
      JOIN qa_strategies strategies ON strategies.thread_id = comments.thread_id
      WHERE comments.status = 'resolved'
      ON CONFLICT (id) DO NOTHING
    `;

  yield* sql`
      CREATE OR REPLACE FUNCTION reject_qa_review_history_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'QA review history is append-only';
      END;
      $$
    `;
  yield* sql`DROP TRIGGER IF EXISTS qa_review_events_append_only ON qa_review_events`;
  yield* sql`
      CREATE TRIGGER qa_review_events_append_only
      BEFORE UPDATE OR DELETE ON qa_review_events
      FOR EACH ROW EXECUTE FUNCTION reject_qa_review_history_mutation()
    `;
  yield* sql`DROP TRIGGER IF EXISTS qa_review_decisions_append_only ON qa_review_decisions`;
  yield* sql`
      CREATE TRIGGER qa_review_decisions_append_only
      BEFORE UPDATE OR DELETE ON qa_review_decisions
      FOR EACH ROW EXECUTE FUNCTION reject_qa_review_history_mutation()
    `;
  yield* sql`
      CREATE OR REPLACE FUNCTION reject_terminal_qa_review_ai_run_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF TG_OP = 'DELETE' OR OLD.status IN ('completed', 'failed') THEN
          RAISE EXCEPTION 'terminal QA review AI runs are immutable';
        END IF;
        RETURN NEW;
      END;
      $$
    `;
  yield* sql`DROP TRIGGER IF EXISTS qa_review_ai_runs_terminal_immutable ON qa_review_ai_runs`;
  yield* sql`
      CREATE TRIGGER qa_review_ai_runs_terminal_immutable
      BEFORE UPDATE OR DELETE ON qa_review_ai_runs
      FOR EACH ROW EXECUTE FUNCTION reject_terminal_qa_review_ai_run_mutation()
    `;
});

const createIndexes = Effect.fn("QaDatabase.createIndexes")(function* (sql: SqlClient.SqlClient) {
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_documents_thread_created ON qa_documents(thread_id, created_at, id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_requirements_thread_created ON qa_requirements(thread_id, created_at, id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_stage_states_thread_ordinal ON qa_stage_states(thread_id, ordinal)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_traceability_nodes_thread_kind ON qa_traceability_nodes(thread_id, kind)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_authored_flows_thread_external ON qa_authored_flows(thread_id, external_id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_traceability_edges_thread_kind ON qa_traceability_edges(thread_id, kind)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_document_chunks_thread_document ON qa_document_chunks(thread_id, document_id, chunk_index)`;
  yield* sql`CREATE INDEX IF NOT EXISTS idx_qa_ingestion_jobs_thread_started ON qa_ingestion_jobs(thread_id, started_at DESC)`;
});
