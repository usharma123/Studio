# Business Requirements Document (BRD)

## Digital Trade Capture, Approval, Matching, and Audit Console

**Document ID:** QAMVP-BRD-MOCKTRADING-001  
**Version:** 2.1  
**Status:** Production-style source pack for mock trading SUT  
**Related documents:** [FRS](02-functional-requirements-specification.md) · [HLD](03-high-level-design.md) · [LLD](04-low-level-design.md)

---

## BRD §1. Purpose

This BRD defines the business expectations for the mock trading application used by the QA Control Plane test drive. The application simulates a controlled banking workflow where a maker captures an equity-style trade instruction, an independent checker approves or rejects the instruction, approved trades may match against opposite-side trades, and audit evidence is available for review.

The current Angular mock application is the source of truth for this document. Any behavior that is not production-grade but exists in the mock application is documented as an implementation deviation rather than silently corrected in the requirements.

---

## BRD §2. Business Outcomes

| Business Requirement | Outcome | Business Rationale | Primary Evidence |
|---|---|---|---|
| BR-001 | Authenticated access | Users must authenticate before accessing trading, queue, dashboard, audit, or admin functions. | Login route, route guard, audit login event |
| BR-002 | Maker trade capture | A maker must be able to capture a trade with side, sector, ticker, account type, quantity, time in force, settlement date, price, and calculated total value. | Trade form, submit toast, pending queue row |
| BR-003 | Independent checker decision | A checker must approve or reject pending maker trades, and the submitting maker must not decide their own trade. | Approval queue controls, disabled actions, service decision guard |
| BR-004 | Trade lifecycle visibility | Users must see pending approval, rejected, pending matched-state, and matched trade outcomes through queue, dashboard, and trade-list views. | Queue table, dashboard summary, trade list |
| BR-005 | Matching transparency | Approved opposite-side trades with the same ticker, price, and quantity must be matched by the mock matching routine. | Trade list status and matched-with column |
| BR-006 | Auditability | Controlled actions must leave reviewable audit evidence for login, submit, approve, and reject activity. | Audit Trail page and local audit event store |

---

## BRD §3. Business Operating Model

| Persona | Business Role | Application Role | Primary Responsibilities | Restrictions |
|---|---|---|---|---|
| Maker | Front-office or operations submitter | `maker` | Capture trade instruction; review dashboards, queue, trade list, and audit evidence. | Cannot approve or reject their own submitted trade. |
| Checker | Middle-office control reviewer | `checker` | Review pending maker trades; approve or reject eligible trades; review evidence. | Cannot decide trades submitted by the same user. |
| Auditor | Evidence reviewer | Modeled through authenticated app access | Review audit trail and generated test evidence. | No separate production IAM integration exists in the mock app. |
| Admin | Administrative reviewer | Authenticated app access | Open the placeholder user-list page. | User maintenance is out of scope for this mock. |

---

## BRD §4. Business Process Scope

### BRD §4.1 In Scope

| Area | Included Behavior |
|---|---|
| Authentication | Valid maker/checker login, invalid login error, logout, route protection. |
| Trade capture | Side, sector, ticker, account type, quantity, time in force, settlement date, conditional GTC expiration date, async ticker price lookup, total value calculation, submit toast. |
| Approval queue | Pending approval filter, pending count, approve and reject actions, maker-checker decision guard. |
| Matching | In-memory matching when an approved trade has an opposite side with same ticker, quantity, and price. |
| Dashboard | Total trade count, pending count, approved count, rejected count, approved notional. |
| Trade list | Trade rows with side, ticker, quantity, price, total, status, and matched-with value. |
| Audit | Reviewable event table for login, submit, and decision activity. |

### BRD §4.2 Out of Scope

| Area | Exclusion | Reason |
|---|---|---|
| Real order routing | No exchange, broker, or settlement connectivity. | Mock app is a local SUT for QA automation strategy. |
| Real market data | Ticker prices are deterministic mock service responses. | Keeps test runs repeatable. |
| Production identity | No enterprise SSO, MFA, entitlement service, or password policy enforcement. | Authentication is simulated for local testing. |
| Database persistence | Browser local storage is used instead of production database persistence. | Keeps environment lightweight and deterministic. |

---

## BRD §5. Business Rules

| Rule ID | Rule | Applies To | Acceptance Evidence |
|---|---|---|---|
| BR-008 | A user shall not access protected routes unless authenticated. | `/dashboard`, `/trade`, `/trades`, `/queue`, `/approvals`, `/audit`, `/admin/users` | Route redirects or blocks unauthenticated access. |
| BR-009 | A maker shall be able to submit a trade only when all required form fields are valid. | Trade capture | Submit button remains disabled until required fields are valid. |
| BR-010 | GTC orders shall require an expiration date. | Trade capture | Expiration date field appears and becomes required when time in force is `GTC`. |
| BR-011 | Ticker selection shall populate current price asynchronously and recalculate total value. | Trade capture | Price spinner appears, current price is populated, total value equals quantity times price. |
| BR-012 | Pending maker trades shall appear in the checker approval queue. | Queue | Queue table shows pending rows and pending count. |
| BR-013 | A checker decision shall be blocked when actor and submitting maker are the same user. | Queue decision | Approve/reject controls are disabled or service returns denial. |
| BR-014 | Approved trades shall leave the queue and enter a post-approval status used by the trade list and dashboard. | Queue, dashboard, trade list | Queue count decreases; dashboard approved count/notional updates. |
| BR-015 | Matching shall occur only for opposite-side trades with equal ticker, quantity, and current price. | Matching routine | Both trades show `Matched` and reciprocal matched-with values. |
| BR-016 | Rejected trades shall remain visible in reporting and count as rejected. | Dashboard, trade list | Rejected count and rejected row status are visible. |
| BR-017 | Controlled actions shall be auditable. | Audit trail | Audit rows include event, actor, role, TX-ID where applicable, side, ticker, and details. |

---

## BRD §6. Known Implementation Deviations

These are documented as known mock-app behaviors so generated tests assert the real system rather than an idealized one.

| Deviation ID | Current Behavior | Documentation Treatment |
|---|---|---|
| DEV-001 | Reject actions record `eventType: approve` in the mock audit store, while details say the trade was rejected. | Document as known defect and test both event field and details text. |
| DEV-002 | Approved trades move to status `Pending` rather than `approved`; dashboard treats `Pending` and `Matched` as approved-like statuses. | Document actual state model and dashboard calculation rule. |
| DEV-003 | Auditor and Admin do not have separate credentialed roles in the mock service. | Treat auditor/admin as authenticated review modes, not separate production entitlements. |
| DEV-004 | Persistence uses browser local storage. | Document as deterministic local storage for QA test drive only. |

---

## BRD §7. Traceability Requirements

| Traceability Item | Requirement |
|---|---|
| Source document IDs | BR and FRS requirement IDs shall remain stable across generated artifacts. |
| Test authoring contract | Generated executable inventory shall remain Excel-compatible with one row per step. |
| Evidence chain | Requirement to test-case to test-step mappings shall be visible in the generated repository and ingestion tables. |
