# Functional Requirements Specification (FRS)

## Digital Trade Capture, Approval, Matching, and Audit Console

**Document ID:** QAMVP-FRS-MOCKTRADING-001  
**Version:** 2.1  
**Status:** Production-style source pack for mock trading SUT  
**Related documents:** [BRD](01-business-requirements-document.md) · [HLD](03-high-level-design.md) · [LLD](04-low-level-design.md)

---

## FRS §1. Purpose

This FRS translates the BRD into screen, service, data, and control requirements for the current mock trading application. It is intentionally specific to the running Angular application so generated tests exercise the real SUT rather than an idealized banking system. Each functional requirement names its parent business requirement (BR) where one applies; some non-functional requirements are intentionally broad and may stand alone.

---

## FRS §2. Route and Entitlement Matrix

| Route | Page | Authentication | Primary Persona | Key Evidence |
|---|---|---|---|---|
| `/login` | Login | Public | Maker, Checker | `login-page`, username, password, submit |
| `/dashboard` | Dashboard | Required | Maker, Checker, Auditor review mode | Summary counts, approved notional, table |
| `/trade` | New Trade | Required | Maker | Trade form and submit toast |
| `/trades` | Trade List | Required | Maker, Checker, Auditor review mode | Status and matched-with rows |
| `/queue` | Approval Queue | Required | Checker | Pending rows, approve/reject controls |
| `/approvals` | Approval Queue alias | Required | Checker | Same component as `/queue` |
| `/audit` | Audit Trail | Required | Auditor review mode | Audit event table |
| `/admin/users` | User List | Required | Admin review mode | Placeholder user-list page |

---

## FRS §3. Authentication and Navigation Requirements

| Requirement ID | Requirement | Parent BR | Acceptance |
|---|---|---|---|
| REQ-FR-001 | The system shall display username, password, and submit controls on the login page. | BR-001 | `username`, `password`, and `login-submit` controls are visible. |
| REQ-FR-002 | The system shall authenticate valid maker credentials and route the maker to `/trade`. | BR-001 | `maker_user/ValidPass123!` lands on trade capture. |
| REQ-FR-003 | The system shall authenticate valid checker credentials and route the checker to `/approvals`. | BR-001 | `checker_user/ValidPass123!` lands on approval queue. |
| REQ-FR-004 | The system shall show an invalid credential error for failed login attempts. | BR-001 | Login page shows `Invalid username or password`. |
| REQ-SEC-001 | The system shall prevent unauthenticated access to protected application routes. | BR-008 | Protected routes redirect or remain inaccessible without a current user. |
| REQ-FR-005 | The authenticated shell shall display a Trading menu, Admin menu, current user/role, and logout control. | BR-001 | Navbar shows role context and menu navigation controls. |
| REQ-FR-006 | Logout shall clear current user state and return the browser to `/login`. | BR-001 | Protected routes require a new login after logout. |

---

## FRS §4. Trade Capture Requirements

| Requirement ID | Requirement | Parent BR | Acceptance |
|---|---|---|---|
| REQ-FR-010 | The system shall render a maker trade form with side, market sector, ticker, account type, quantity, time in force, settlement date, current price, and total value fields. | BR-002 | All trade form controls are present on `/trade`. |
| REQ-FR-011 | The system shall filter ticker choices when a market sector is selected. | BR-002 | Technology limits ticker choices to AAPL, MSFT, NVDA; Financials limits choices to JPM, BAC, V. |
| REQ-FR-012 | The system shall fetch and populate current price when a ticker is selected. | BR-011 | A fetching indicator appears and price is populated from the mock price service. |
| REQ-FR-013 | The system shall calculate total value as quantity multiplied by current price. | BR-011 | Total value refreshes after quantity or price changes. |
| REQ-FR-014 | The system shall require expiration date when time in force is `GTC` and clear that requirement for `Day Order`. | BR-010 | `trade-expiration-date` appears only for GTC and is required for submission. |
| REQ-FR-015 | The system shall keep trade submission unavailable until required fields are valid. | BR-009 | Submit button is disabled while required form controls are invalid. |
| REQ-FR-016 | The system shall submit a valid maker trade into `pending_approval` status with a generated TX-ID. | BR-002 | Submit toast includes TX-ID and trade details; queue receives the row. |

### FRS §4.1 Trade Field Validation Matrix

| Field | Control | Required | Valid Values / Rule |
|---|---|---|---|
| Side | `trade-side` | Yes | BUY or SELL |
| Market sector | `trade-sector` | No | Blank, Technology, Financials |
| Ticker | `trade-symbol` | Yes | AAPL, MSFT, NVDA, JPM, BAC, V |
| Account type | `trade-account` | Yes | Cash or Margin |
| Quantity | `trade-quantity` | Yes | Number >= 1 |
| Time in force | `trade-time-in-force` | Yes | Day Order or GTC |
| Expiration date | `trade-expiration-date` | Conditional | Required for GTC only |
| Settlement date | `trade-settlement-date` | Yes | Date value |
| Current price | `trade-price` | Yes | Number >= 0.01 |
| Total value | `trade-total-value` | Derived | quantity * currentPrice (read-only) |

---

## FRS §5. Approval, Rejection, and Segregation Requirements

| Requirement ID | Requirement | Parent BR | Acceptance |
|---|---|---|---|
| REQ-FR-020 | The approval queue shall display only trades in `pending_approval` status. | BR-012 | Queue table rows match pending approval trades only. |
| REQ-FR-021 | The queue shall display TX-ID, side, ticker, quantity, price, total, status, and action controls. | BR-012 | Queue columns and row test IDs are visible. |
| REQ-FR-022 | The queue shall show a pending count equal to visible pending rows. | BR-012 | `queue-pending-count` matches table row count. |
| REQ-FR-023 | The checker shall be able to approve an eligible pending trade. | BR-003 | Approved trade leaves queue and status changes to post-approval state. |
| REQ-FR-024 | The checker shall be able to reject an eligible pending trade. | BR-003 | Rejected trade leaves queue and appears as rejected in reporting. |
| REQ-FR-035 | The system shall remove approved trades from the approval queue and expose their post-approval lifecycle state to reporting views. | BR-014 | Queue count decreases; dashboard and trade list show the post-approval status. |
| REQ-FR-036 | The system shall retain rejected trades in reporting views and count them as rejected. | BR-016 | Rejected trades are visible in trade list and included in dashboard rejected count. |
| REQ-SEC-002 | The system shall prevent the submitting maker from approving or rejecting their own trade. | BR-013 | Action is disabled or service returns false when actor matches submitter. |

---

## FRS §6. Matching, Reporting, and Dashboard Requirements

| Requirement ID | Requirement | Parent BR | Acceptance |
|---|---|---|---|
| REQ-FR-030 | The system shall attempt matching when an eligible trade is approved. | BR-005 | Matching routine runs after checker approval. |
| REQ-FR-031 | The system shall match only opposite-side trades with the same ticker, quantity, and current price. | BR-015 | Both trades move to `Matched` and each records the other TX-ID. |
| REQ-FR-032 | The trade list shall display all stored trades with side, ticker, quantity, price, total, status, and matched-with value. | BR-004 | `/trades` table shows lifecycle and matching evidence. |
| REQ-FR-033 | The dashboard shall display total, pending, approved-like, and rejected counts. | BR-004 | Dashboard summary shows total, pending, approved, and rejected counts. |
| REQ-FR-034 | The dashboard shall calculate approved notional as quantity multiplied by current price for statuses `approved`, `Pending`, and `Matched`. | BR-004 | Approved notional excludes `pending_approval` and `rejected`. |

### FRS §6.1 Lifecycle State Matrix

| State | Meaning in Mock App | Entered By | Counts As Approved-Like |
|---|---|---|---|
| `pending_approval` | Submitted maker instruction awaiting checker decision | Maker submit | No |
| `Pending` | Checker-approved trade awaiting possible match | Checker approve | Yes |
| `Matched` | Approved trade matched with opposite-side trade | Matching routine | Yes |
| `rejected` | Checker rejected pending maker instruction | Checker reject | No |

---

## FRS §7. Audit and Evidence Requirements

| Requirement ID | Requirement | Parent BR | Acceptance |
|---|---|---|---|
| REQ-FR-040 | The system shall record an audit event for successful login. | BR-006 | Audit row includes event `login`, actor, role, and details. |
| REQ-FR-041 | The system shall record an audit event for trade submission. | BR-006 | Audit row includes event `submit`, actor, role, TX-ID, side, ticker, and details. |
| REQ-FR-042 | The system shall record an audit event for checker approval. | BR-006 | Audit row includes decision actor, TX-ID, side, ticker, and approval details. |
| REQ-FR-043 | The system shall expose rejection evidence, while documenting current reject event-type defect DEV-001. | BR-006 | Rejection row details identify rejection even though event type currently says `approve`. |
| REQ-FR-044 | The system shall expose reviewable audit details for controlled login, submit, approve, and reject actions. | BR-017 | Audit rows include event, actor, role, TX-ID where applicable, side, ticker, and details. |
