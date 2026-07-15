import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_scenario_plans (
        thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL CHECK (revision > 0),
        generation_status TEXT NOT NULL CHECK (generation_status IN ('queued','generating','complete','failed','stale')),
        review_status TEXT NOT NULL CHECK (review_status IN ('draft','pending_review','approved','rejected')),
        rejection_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submitted_at TEXT, submitted_by TEXT,
        approved_at TEXT, approved_by TEXT,
        rejected_at TEXT, rejected_by TEXT
      )
  `;
  yield* sql`
      CREATE TABLE IF NOT EXISTS qa_test_case_plans (
        thread_id TEXT PRIMARY KEY REFERENCES qa_releases(thread_id) ON DELETE CASCADE,
        id TEXT NOT NULL UNIQUE,
        revision INTEGER NOT NULL CHECK (revision > 0),
        generation_status TEXT NOT NULL CHECK (generation_status IN ('queued','generating','complete','failed','stale')),
        review_status TEXT NOT NULL CHECK (review_status IN ('draft','pending_review','approved','rejected')),
        rejection_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submitted_at TEXT, submitted_by TEXT,
        approved_at TEXT, approved_by TEXT,
        rejected_at TEXT, rejected_by TEXT
      )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_scenarios (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_scenario_plans(thread_id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('positive','negative','boundary','exception','integration')),
      priority TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
      risk TEXT NOT NULL CHECK (risk IN ('critical','high','medium','low')),
      expected_outcome TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_at TEXT, submitted_by TEXT,
      approved_at TEXT, approved_by TEXT,
      rejected_at TEXT, rejected_by TEXT,
      UNIQUE (thread_id, external_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_scenario_requirements (
      thread_id TEXT NOT NULL REFERENCES qa_scenario_plans(thread_id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,
      requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, scenario_id, requirement_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_scenario_preconditions (
      scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (scenario_id, position)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_test_cases (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('critical','high','medium','low')),
      automation_candidate INTEGER NOT NULL CHECK (automation_candidate IN (0,1)),
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
      decision_note TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      submitted_at TEXT, submitted_by TEXT,
      approved_at TEXT, approved_by TEXT,
      rejected_at TEXT, rejected_by TEXT,
      UNIQUE (thread_id, external_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_test_case_scenarios (
      thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,
      test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, test_case_id, scenario_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_test_case_requirements (
      thread_id TEXT NOT NULL REFERENCES qa_test_case_plans(thread_id) ON DELETE CASCADE,
      test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
      requirement_id TEXT NOT NULL REFERENCES qa_requirements(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, test_case_id, requirement_id)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_test_case_preconditions (
      test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (test_case_id, position)
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS qa_test_case_steps (
      test_case_id TEXT NOT NULL REFERENCES qa_test_cases(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL CHECK (step_order > 0),
      action TEXT NOT NULL,
      test_data TEXT NOT NULL,
      expected_result TEXT NOT NULL,
      PRIMARY KEY (test_case_id, step_order)
    )
  `;
});
