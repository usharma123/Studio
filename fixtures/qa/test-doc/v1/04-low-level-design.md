# Low Level Design (LLD)

## Digital Trade Capture, Approval, Matching, and Audit Console

**Document ID:** QAMVP-LLD-MOCKTRADING-001  
**Version:** 2.0  
**Status:** Production-style source pack for mock trading SUT  
**Related documents:** [BRD](01-business-requirements-document.md) · [FRS](02-functional-requirements-specification.md) · [HLD](03-high-level-design.md)

---

## LLD §1. Implementation Overview

The implementation is an Angular standalone-component application. `MockApiService` owns the mock business state and persists current user, trades, counters, and audit events in browser local storage. Component templates expose stable `data-testid` values so generated Playwright steps can interact with the app without relying on fragile CSS or XPath selectors.

---

## LLD §2. Route and Component Contracts

| Route | Component | Access | Primary Test IDs |
|---|---|---|---|
| `/login` | LoginComponent | Public | `login-page`, `username`, `password`, `login-submit`, `login-error` |
| `/dashboard` | DashboardComponent | Authenticated | `dashboard-page`, `dashboard-summary`, `dashboard-approved-notional` |
| `/trade` | TradeComponent | Authenticated | `trade-form`, `trade-symbol`, `trade-submit`, `trade-toast` |
| `/trades` | TradeListComponent | Authenticated | `trade-list-page`, `trade-list-table`, `trade-list-cell-status` |
| `/queue` | QueueComponent | Authenticated | `queue-page`, `queue-table`, `queue-pending-count` |
| `/approvals` | QueueComponent | Authenticated | Same as `/queue` |
| `/audit` | AuditComponent | Authenticated | `audit-page`, `audit-table`, `audit-row` |
| `/admin/users` | UserListComponent | Authenticated | `user-list-page` where implemented |

---

## LLD §3. Service Data Contracts

### LLD-DATA-001 — AppUser

| Field | Type | Source | Rule |
|---|---|---|---|
| username | string | Login credentials | Must match configured credential key. |
| role | `maker` or `checker` | Credential map | Controls default landing route and queue decisions. |

### LLD-DATA-002 — Trade

| Field | Type | Source | Rule |
|---|---|---|---|
| txId | string | Service-generated | Format `TX-{counter}`. |
| side | BUY or SELL | Trade form | Required. |
| sector | string | Trade form | Technology, Financials, or blank. |
| ticker | string | Trade form | Required supported ticker. |
| accountType | Cash or Margin | Trade form | Required. |
| quantity | number | Trade form | Required, minimum 1. |
| timeInForce | string | Trade form | Day Order or GTC. |
| settlementDate | date string | Trade form | Required by form. |
| expirationDate | date string or null | Trade form | Required only when timeInForce is GTC. |
| currentPrice | number | Mock price service/form | Required, minimum 0.01. |
| totalValue | number | Derived | quantity * currentPrice. |
| status | TradeStatus | Service | `pending_approval`, `Pending`, `Matched`, `rejected`, or legacy `approved`. |
| matchedWith | string or null | Matching routine | Reciprocal TX-ID when matched. |
| submittedByUserId | string | Current user | Used for maker-checker separation. |

### LLD-DATA-003 — AuditEvent

| Field | Type | Source | Rule |
|---|---|---|---|
| id | string | Service-generated | Format `AUD-0001`. |
| timestamp | ISO string | Service-generated | Created at event time. |
| eventType | enum | Service method | Current values: `login`, `submit`, `approve`; reject currently uses `approve`. |
| actor | string | Current user | Username or `unknown`. |
| role | maker/checker | Current user | Role at event time. |
| txId | string optional | Trade action | Present for submit/approve/reject. |
| ticker | string optional | Trade action | Present for submit/approve/reject. |
| side | BUY/SELL optional | Trade action | Present for submit/approve/reject. |
| details | string | Service method | Human-readable evidence text. |

---

## LLD §4. Component Behavior Detail

| Component | Behavior | Implementation Detail | Requirements |
|---|---|---|---|
| LoginComponent | Authenticates and routes users. | Calls `login`; maker routes to `/trade`, checker routes to `/approvals`; invalid login shows error. | REQ-FR-001 to REQ-FR-004 |
| NavbarComponent | Provides click-based menus and logout. | Trading menu links dashboard, new trade, trade list, approval queue, audit; Admin menu links user list. | REQ-FR-005, REQ-FR-006 |
| TradeComponent | Captures and submits trades. | Reactive form validators, sector-driven ticker list, async price fetch, conditional GTC expiration, total value calculation. | REQ-FR-010 to REQ-FR-016 |
| QueueComponent | Displays and decides pending trades. | Loads `getQueue`; approve/reject disabled unless current role is checker and actor is not submitter. | REQ-FR-020 to REQ-FR-024, REQ-SEC-002 |
| DashboardComponent | Calculates counts and approved notional. | Approved-like statuses are `approved`, `Pending`, and `Matched`; notional uses quantity * currentPrice; rejected rows remain counted as rejected. | REQ-FR-033, REQ-FR-034, REQ-FR-036 |
| TradeListComponent | Displays lifecycle rows. | Shows status and matched-with for all stored trades, including approved and rejected lifecycle outcomes. | REQ-FR-032, REQ-FR-035, REQ-FR-036 |
| AuditComponent | Displays audit events. | Loads events newest first and renders evidence columns for controlled actions. | REQ-FR-040 to REQ-FR-044 |

---

## LLD §5. Business Algorithms

### LLD-ALG-001 — Price Lookup

| Ticker | Price |
|---|---:|
| AAPL | 178.50 |
| MSFT | 415.20 |
| NVDA | 875.00 |
| JPM | 198.30 |
| BAC | 35.60 |
| V | 278.90 |

### LLD-ALG-002 — Matching Rule

| Condition | Required Value |
|---|---|
| Candidate trade is not same TX-ID | true |
| Candidate status | `Pending` |
| Candidate side | Opposite of incoming trade |
| Candidate ticker | Equal to incoming ticker |
| Candidate currentPrice | Equal to incoming currentPrice |
| Candidate quantity | Equal to incoming quantity |
| Match result | Both trades status `Matched`; each `matchedWith` references the other TX-ID |

### LLD-ALG-003 — Dashboard Aggregation

| Metric | Calculation |
|---|---|
| Total trades | Count all stored trades. |
| Pending count | Count status `pending_approval`. |
| Approved count | Count status `approved`, `Pending`, or `Matched`. |
| Rejected count | Count status `rejected`. |
| Approved notional | Sum `quantity * currentPrice` for statuses `approved`, `Pending`, and `Matched`. |

---

## LLD §6. Locator Contract

| Area | Stable Locator |
|---|---|
| Login | `username`, `password`, `login-submit`, `login-error`, `login-loading` |
| Navigation | `trading-menu-trigger`, `nav-dashboard`, `nav-new-trade`, `nav-trade-list`, `nav-queue`, `nav-audit`, `nav-admin-trigger`, `nav-user-list`, `navbar-user`, `navbar-logout` |
| Trade form | `trade-side`, `trade-sector`, `trade-symbol`, `trade-account`, `trade-quantity`, `trade-time-in-force`, `trade-settlement-date`, `trade-expiration-date`, `trade-price`, `trade-total-value`, `trade-submit`, `trade-toast` |
| Queue | `queue-pending-count`, `queue-table`, `approval-row-{txId}`, `approve-trade-{txId}`, `reject-trade-{txId}`, `queue-approve-toast` |
| Dashboard | `dashboard-total-trades-label`, `dashboard-pending-count`, `dashboard-approved-count`, `dashboard-rejected-count`, `dashboard-approved-notional` |
| Trade list | `trade-list-table`, `trade-list-row`, `trade-list-cell-status`, `trade-list-cell-matched-with` |
| Audit | `audit-total`, `audit-table`, `audit-row`, `audit-cell-event`, `audit-cell-details` |

---

## LLD §7. Known Implementation Deviations

| Deviation ID | Low-Level Cause | Test Handling |
|---|---|---|
| DEV-001 | `rejectTrade` calls `recordAuditEvent` with `eventType: 'approve'`. | Tests should assert rejection details text and document event-type mismatch. |
| DEV-002 | `approveTrade` sets status `Pending`, not `approved`. | Tests should treat `Pending` as approved-like per dashboard implementation. |
| DEV-003 | Local storage is the persistence layer. | Test setup should clear `mock_trading_*` keys before isolated scenarios. |

---

## LLD §8. Annex A — Data Dictionary and State Model

This annex is part of the LLD rather than a separate data dictionary document. It is retained here because only BRD, FRS, HLD, and LLD are official source documents for ingestion.

### LLD §8.1 Annex A.1 — Entity Catalogue

| Entity ID | Entity | Business Meaning | Owning Component |
|---|---|---|---|
| DATA-USER-001 | AppUser | Authenticated mock user with role context. | MockApiService |
| DATA-TRADE-001 | Trade | Captured trading instruction and lifecycle state. | MockApiService |
| DATA-AUDIT-001 | AuditEvent | Evidence record for controlled business action. | MockApiService |
| DATA-DASH-001 | DashboardSummary | Derived reporting view from stored trades. | DashboardComponent |
| DATA-QUEUE-001 | ApprovalQueueRow | Pending trade row awaiting checker decision. | QueueComponent |

### LLD §8.2 Annex A.2 — Trade Lifecycle State Model

| Current State | Actor | Action | Guard Condition | Next State | Audit Evidence | Reporting Effect |
|---|---|---|---|---|---|---|
| Draft form | Maker | Submit | Form valid | `pending_approval` | `submit` event | Queue count increases. |
| `pending_approval` | Checker | Approve | Role is checker and actor is not submitter | `Pending` or `Matched` | `approve` event | Approved count/notional increases. |
| `pending_approval` | Checker | Reject | Role is checker and actor is not submitter | `rejected` | Current mock event type `approve`; details show rejected | Rejected count increases. |
| `Pending` | Service | Match | Opposite side, same ticker, same price, same quantity | `Matched` | No distinct audit event | Trade list shows matched pair. |
| `Matched` | User | View | Authenticated | `Matched` | None | Approved-like reporting continues. |
| `rejected` | User | View | Authenticated | `rejected` | None | Rejected reporting continues. |

### LLD §8.3 Annex A.3 — Storage Keys

| Storage Key | Data | Reset Guidance |
|---|---|---|
| `mock_trading_current_user` | Current authenticated user. | Clear before auth and route-guard tests. |
| `mock_trading_trades` | Stored trade array. | Clear before independent trade lifecycle tests. |
| `mock_trading_tx_counter` | TX-ID counter. | Clear for deterministic TX-ID sequencing. |
| `mock_trading_audit_events` | Stored audit events. | Clear before audit evidence tests. |
| `mock_trading_audit_counter` | Audit ID counter. | Clear for deterministic audit ID sequencing. |

### LLD §8.4 Annex A.4 — Data Quality and Lineage Notes

| Data Item | Source of Record in Mock | Downstream Consumer | Quality Note |
|---|---|---|---|
| `submittedByUserId` | Current user at submit time. | Queue decision guard. | Must be preserved across local storage reloads for segregation tests. |
| `status` | Service decision/matching methods. | Queue, dashboard, trade list. | Vocabulary is intentionally documented as mixed because the current mock app uses mixed values. |
| `eventType` | Audit event writer. | Audit page and evidence checks. | Reject event type is a known defect; details text carries business meaning. |
| `totalValue` | Trade component calculation. | Tables and toast evidence. | Tests should prefer numeric comparison after formatting normalization. |
| `matchedWith` | Matching routine. | Trade list. | Valid only when both sides of a matched pair reciprocally reference each other. |

---

## LLD §9. Annex B — Ingestion Metadata Expectations

| Ingestion Item | Requirement |
|---|---|
| Official source kinds | Only BRD, FRS, HLD, and LLD shall be treated as source document kinds for release ingestion. |
| Table row chunks | DOCX tables shall emit row-level chunks with `block_type: table_row`, `table_index`, `row_index`, and `columns` metadata. |
| Nested identifiers | Ingestion shall recognize nested and control identifiers such as `REQ-FR-014.1`, `CTRL-PKG-001`, `DATA-TRADE-001`, `SCN-MATCH-001`, `DEV-001`, `BEP-LOGIN`, `ADR-MOCK-001`, and `RR-001`. |
| Retrieval use | pgvector shall retrieve semantically relevant chunks from the four official source documents; generated test artifacts are not required release source documents. |
