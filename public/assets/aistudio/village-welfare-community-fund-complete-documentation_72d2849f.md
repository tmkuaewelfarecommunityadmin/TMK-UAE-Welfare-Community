# Village Welfare Community Fund --- Complete Documentation Pack

------------------------------------------------------------------------

# 01 --- Project Design Document

## 1. Purpose

The Village Welfare Community Fund application provides transparent
administration of community contributions and welfare assistance. It
replaces fragmented spreadsheets, informal messaging and manual
calculations with controlled workflows and traceable financial records.

## 2. Goals

-   Allow authorized members to securely log in from mobile or browser.
-   Support English and Tamil user interfaces and member information.
-   Record contributions and balances separately in INR and AED.
-   Track each member's expected contribution and actual verified
    payments.
-   Let members and authorized public users submit assistance requests.
-   Enforce committee approval rules before assistance payout.
-   Support monthly UAE collection settlement and AED-to-INR conversion.
-   Maintain a complete, searchable audit trail.
-   Provide role-specific dashboards and reports.
-   Keep infrastructure and operational cost as low as practical without
    compromising financial integrity.

## 3. Non-goals for the first release

-   Online payment gateway integration or automatic bank reconciliation.
-   Native iOS/Android applications distributed through app stores.
-   Multi-village SaaS tenancy, unless confirmed as a requirement.
-   Automated foreign-exchange market-rate retrieval.
-   Payroll, taxation filing or statutory accounting.
-   Public access to member directory, contribution details or fund
    balances.
-   Offline financial posting. Read-only cached content may be
    considered later, but money operations require connectivity.

## 4. Users and roles

  ---------------------------------------------------------------------
  Role                               Main responsibility
  ---------------------------------- ----------------------------------
  Admin                              Full configuration and operational
                                     access; manages accounts and roles

  Committee Member                   Member management, payment
                                     registration/verification,
                                     assistance review

  Treasurer                          Financial operations, settlement,
                                     inflow/outflow and payout
                                     execution

  Member                             Own contributions, own
                                     submissions, community-level
                                     dashboard and assistance request

  Auditor                            Read-only financial/audit access
                                     and report generation
  ---------------------------------------------------------------------

A person may have multiple roles. A member record can exist without a
login account. Each member can be linked to no more than one login
identity.

## 5. Functional scope

### 5.1 Authentication and account lifecycle

-   Login using assigned username and password.
-   Forgot-password and account recovery.
-   Admin-created/invited accounts; no unrestricted public account
    registration.
-   Session expiry, sign-out and account disablement.
-   Link login identity to a member record.
-   A user can have multiple roles.

**Username implementation note:** The chosen identity provider must be
verified for username/password support. If it supports email/password
only, implement a secure server-side username-to-identity resolution
function with rate limiting and non-enumerating responses. Do not expose
a public username lookup endpoint or store passwords in application
tables. Require a verified recovery email or define an admin-assisted
recovery process.

### 5.2 Public assistance request

-   Public form available without member login.
-   Collect only the minimum information needed to assess the request.
-   Support English/Tamil entry.
-   Attachments stored privately.
-   Apply CAPTCHA or equivalent abuse protection, rate limiting and spam
    controls.
-   Public requester receives a random tracking token or reference;
    token must not reveal personal data.
-   Public users cannot browse submitted requests, members, dashboards
    or fund details.
-   Logged-in roles can also submit requests.

### 5.3 Members

-   Create, view, update, deactivate/reactivate member.
-   English/Tamil name and address fields.
-   Phone/email, street/location and member status.
-   Expected contribution frequency and amount (individual amount; not a
    universal fixed amount).
-   INR/AED currency preference for the expected contribution.
-   Assign one or more roles to a member's user account.
-   Audit all material changes.

### 5.4 Contributions and payments

-   Record expected dues by period.
-   Member can submit a payment amount, payment date, currency, method,
    reference and attachment.
-   Submission remains pending until one eligible committee member
    approves it.
-   A committee member can register a payment collected from a member.
-   For separation of duties, the person who creates a payment record
    must not approve their own record.
-   On approval, create the financial transaction and ledger entries
    atomically.
-   Rejected/pending submissions do not affect available fund balance.
-   Support partial payments and multiple installments unless the
    committee chooses a stricter rule.
-   Member can see own contribution history and latest five confirmed
    contributions.
-   Do not treat the configured expected amount as proof of payment.

### 5.5 Assistance requests and approvals

-   All roles can submit assistance requests.
-   Public non-members can submit through the public form.
-   Only committee members can approve/reject.
-   Normal request: at least 50% of eligible committee members must
    approve.
-   Emergency request: one eligible committee member approval is
    sufficient.
-   Freeze the eligible voter set when the approval round starts.
-   An approval is not a payment. Treasurer records and confirms the
    payout only after approval and fund-availability checks.
-   Rejection threshold for normal requests remains a business decision;
    proposed safe default is explicit authorized rejection or a
    configurable rejection threshold, not an assumed rule.

### 5.6 Treasury and AED settlement

-   Maintain INR and AED accounts separately.
-   Treasurer records inflows/outflows, expenses, refunds, payouts and
    settlement.
-   Generate one monthly UAE settlement record per settlement month.
-   Sum confirmed AED payments for the period.
-   Treasurer enters actual exchange rate and charges.
-   Transaction charge, tax and other charges each have an explicit
    currency (INR or AED).
-   Compute gross INR, charge equivalents and net INR.
-   Confirm settlement with bank/reference evidence.
-   Posting is atomic and immutable; corrections use reversal/adjustment
    entries.
-   Conversion is a transfer between currency accounts, not a second
    contribution/income event.

### 5.7 Dashboard and reports

-   Role-based dashboard.
-   Members see their own contribution history and community-level
    summary approved for member visibility.
-   Committee sees membership, dues, collection and assistance workflow
    summaries.
-   Treasurer sees balances by currency, collections, expenses, payouts
    and settlements.
-   Auditor sees all financial and audit records, with filters by user,
    role, date, action, entity and transaction.
-   Export permitted reports to CSV/XLSX/PDF as a later-phase
    capability; protect personal data in exports.

## 6. Business rules

  ---------------------------------------------------------------------
  ID                                 Rule
  ---------------------------------- ----------------------------------
  BR-001                             No login is required to exist as a
                                     member.

  BR-002                             One member can be linked to at
                                     most one user account.

  BR-003                             One user can have multiple roles.

  BR-004                             Only verified/approved payments
                                     create ledger postings.

  BR-005                             A payment creator cannot approve
                                     their own payment.

  BR-006                             Normal assistance requires
                                     approvals from at least 50% of
                                     frozen eligible committee members.

  BR-007                             Emergency assistance requires one
                                     eligible committee approval.

  BR-008                             Only committee members can vote on
                                     assistance requests.

  BR-009                             Approval and payout are separate
                                     state transitions.

  BR-010                             INR and AED balances are never
                                     added together as if they were the
                                     same currency.

  BR-011                             Every posted financial event has
                                     balanced debit/credit entries in
                                     functional currency.

  BR-012                             Posted ledger entries are
                                     immutable; corrections are
                                     reversals/adjustments.

  BR-013                             Audit events are append-only and
                                     record actor identity and role
                                     snapshot.

  BR-014                             Public requests cannot expose
                                     member or fund data.

  BR-015                             All critical operations are
                                     authorized server-side, not only
                                     hidden in the UI.
  ---------------------------------------------------------------------

## 7. Success criteria

-   Every financial movement can be traced to a source record, actor,
    approval and ledger posting.
-   No pending/rejected payment changes the posted balance.
-   No assistance payout can occur without the required approval.
-   INR and AED account balances reconcile independently.
-   Auditor can retrieve last N audit events by user or role.
-   Member can retrieve own latest five confirmed contributions.
-   UI works at common phone, tablet and desktop widths.
-   Tamil and English flows are usable without clipped or missing
    labels.
-   Backup restoration is demonstrated before production.
-   Monthly operational cost is known and accepted by the committee.

## 8. Assumptions requiring owner confirmation

-   One village/organization in release 1.
-   INR is the reporting/functional currency; AED remains a separate
    account currency.
-   Public assistance requests are allowed without login but require
    moderation.
-   At least one committee approval is needed for a member-submitted
    payment.
-   Normal assistance approval threshold is 50% of eligible committee
    members.
-   Emergency assistance threshold is one approval.
-   Normal rejection threshold, payout authorization and cash handling
    rules need confirmation.
-   Usernames are unique and assigned by Admin.
-   Email recovery availability depends on member email quality;
    admin-assisted recovery may be required.

------------------------------------------------------------------------

# 02 --- High-Level Design (HLD)

## 1. Architecture overview

### Recommended release-1 architecture

-   Frontend: React 19 + TypeScript + Vite, responsive design and PWA.
-   Backend platform: Supabase managed PostgreSQL, Auth, Row-Level
    Security (RLS), private Storage and Edge Functions.
-   Hosting: static web hosting on a suitable free tier (e.g. Cloudflare
    Pages or equivalent).
-   Monitoring: platform logs plus application error reporting with a
    free-tier option.
-   Notifications: email first; push notifications only if operationally
    required.
-   Source control/CI: GitHub repository and GitHub Actions.

This is a recommendation, not a claim that all production use can remain
free indefinitely. Confirm current service limits, project pausing,
backup/restore availability, storage, bandwidth, email delivery and
regional data location before selecting a paid or free plan.

## 2. Logical architecture

``` mermaid
flowchart TB
    U[Members / Committee / Treasurer / Auditor]
    P[Public assistance requester]
    UI[Responsive React PWA]
    AUTH[Managed Authentication]
    API[Trusted Edge Functions / RPC]
    DB[(PostgreSQL)]
    STORE[(Private Object Storage)]
    AUD[Append-only Audit Events]
    LED[Fund Transactions and Ledger]
    DASH[SQL Views / Dashboard RPC]
    U --> UI
    P --> UI
    UI --> AUTH
    UI --> API
    API --> DB
    API --> STORE
    DB --> AUD
    DB --> LED
    DB --> DASH
```

## 3. Component responsibilities

  ---------------------------------------------------------------------
  Component                          Responsibility
  ---------------------------------- ----------------------------------
  Web/PWA frontend                   Navigation, role-specific UI,
                                     forms, validation, bilingual
                                     content

  Auth provider                      Credential verification,
                                     session/token lifecycle, password
                                     reset

  Edge Functions / database RPC      Trusted business operations,
                                     validation, approvals and posting

  PostgreSQL                         Authoritative relational records
                                     and transactional consistency

  RLS policies                       Defense-in-depth data access
                                     control

  Private object storage             Proof of payment and assistance
                                     attachments

  SQL views/RPC                      Dashboard aggregates and reports

  Audit log                          Actor, role snapshot, action,
                                     old/new values and timestamp

  GitHub Actions                     Lint, typecheck, tests, build and
                                     deployment
  ---------------------------------------------------------------------

## 4. Frontend structure

Suggested feature-based structure:

``` text
src/
  app/
    router/
    providers/
    layouts/
  features/
    auth/
    dashboard/
    members/
    roles/
    contributions/
    assistance/
    treasury/
    settlements/
    ledger/
    audit/
    reports/
    settings/
  shared/
    components/
    hooks/
    api/
    i18n/
    validation/
    types/
  styles/
  tests/
```

Use route guards for usability, but never rely on route guards as the
security boundary. Every API/database operation must enforce
authorization.

## 5. Browser and mobile strategy

Release 1 should be a responsive PWA: - Installable on supported Android
browsers and desktop browsers. - Mobile-first navigation and
touch-friendly forms. - Offline shell may load, but financial writes
require network. - Attachments use camera/file picker supported by
browser. - App-store packaging is not part of release 1.

If native distribution is later required, evaluate Capacitor or React
Native as a separate decision. Avoid maintaining separate web and mobile
implementations until a concrete need exists.

## 6. Backend design

Use managed PostgreSQL because the domain needs: - Foreign keys and
unique constraints. - Atomic approval and posting transactions. -
Complex role and member relationships. - Multi-step assistance
approval. - Multi-currency ledger and reporting. - Audit queries by
actor, role, date and transaction.

Business-critical operations should be server-side functions or database
RPCs. Do not let the browser directly insert ledger entries or set
trusted actor IDs.

## 7. Security architecture

-   Authenticated session required for all member dashboards.
-   Public endpoint limited to creating assistance requests.
-   No anonymous read access to member, payment, ledger, audit or
    dashboard tables.
-   RLS enabled on all exposed tables.
-   Service-role/secret keys never shipped to browser.
-   Private storage buckets; short-lived signed URLs after
    authorization.
-   Actor ID derived from verified auth context, not request body.
-   Admin role changes and financial actions audited.
-   Rate-limit login, username resolution and public request submission.
-   CAPTCHA/anti-spam on public assistance form.
-   Validate file type, size and malware scanning strategy.
-   No passwords, access tokens or secrets in audit payloads.

## 8. Deployment topology

``` mermaid
flowchart LR
    G[GitHub main branch]
    CI[GitHub Actions: lint / test / build]
    HOST[Static PWA Hosting]
    SB[Supabase project]
    USERS[Browser / Mobile PWA]
    G --> CI --> HOST
    USERS --> HOST
    HOST --> SB
```

Environments: - Local development: local frontend and isolated backend
project. - Staging: test users and synthetic financial data. -
Production: real member data, restricted administrator access, backups
and monitoring.

Never use production member data in local or staging environments.

## 9. Cost strategy

  -----------------------------------------------------------------------
  Area                    Minimal-cost approach   Cost risk to verify
  ----------------------- ----------------------- -----------------------
  Frontend hosting        Static hosting free     Bandwidth/build limits,
                          tier                    custom domain

  Database/Auth/Storage   Start with managed free Pausing, backup,
                          tier for pilot          storage, egress and
                                                  production SLA

  Domain                  Optional; use a         Renewal price
                          low-cost annual domain  

  Email                   Provider free allowance Deliverability and
                          or manual admin         quota
                          recovery initially      

  Monitoring              Free tier / platform    Retention and event
                          logs                    volume

  Push notifications      Defer until needed      Provider setup and
                                                  maintenance

  Backups                 Provider backup plus    Automated backups may
                          independent export      require paid plan
  -----------------------------------------------------------------------

**Production rule:** zero-cost is a target, not a guarantee. Never trade
away recoverability of financial records to save a small annual fee.
Estimate annual cost using expected users, transactions, attachment
storage, backups and email volume.

## 10. Scalability and reliability

Initial expected scale is a small community. Keep the design simple: -
One backend project and one relational database. - Indexed queries and
paginated tables. - Dashboard SQL views/RPC, not client-side downloading
of all records. - No microservices or Kubernetes. - Add materialized
views only if measured performance requires them. - Idempotency keys for
retryable financial commands. - Database transaction boundaries around
approvals and ledger posting.

## 11. Key quality attributes

  ---------------------------------------------------------------------
  Attribute                          Design response
  ---------------------------------- ----------------------------------
  Security                           Auth, RLS, server-side
                                     authorization, private files

  Integrity                          Constraints, atomic RPC, immutable
                                     ledger

  Auditability                       Append-only audit events and role
                                     snapshots

  Usability                          PWA, responsive layout,
                                     Tamil/English, simple role menus

  Maintainability                    Feature-based frontend and
                                     documented SQL/API contracts

  Cost                               Managed services, static hosting,
                                     no always-on custom server
                                     initially

  Recoverability                     Scheduled backups, exports and
                                     restore drills
  ---------------------------------------------------------------------

------------------------------------------------------------------------

# 03 --- Low-Level Design (LLD)

## 1. Data model principles

-   PostgreSQL is the source of truth.
-   Use UUID primary keys and `timestamptz` timestamps.
-   Store money as `numeric(14,2)` or greater precision where required;
    never use floating point.
-   Store currency as ISO code (`INR`, `AED`) with explicit currency on
    every monetary amount.
-   Store phone numbers as text.
-   Store Tamil and English text in separate columns where both versions
    are needed.
-   Use UTC timestamps in storage; render local time in the UI.
-   Add `created_at`, `created_by`, `updated_at`, `updated_by` to
    mutable business records.
-   Financial ledger records are immutable after posting.
-   Audit events are append-only.

## 2. Core tables

### 2.1 Identity and roles

**members** - `id uuid primary key` -
`member_number text unique not null` - `full_name_en text not null` -
`full_name_ta text` - `phone_number text` - `email text` -
`street_en text`, `street_ta text` - `location_en text`,
`location_ta text` -
`contribution_frequency text check in ('monthly','yearly')` -
`expected_contribution_amount numeric(14,2)` -
`expected_contribution_currency char(3)` - `status text` - audit columns

**user_accounts** - `id uuid primary key` -
`member_id uuid unique references members(id)` -
`auth_user_id uuid unique not null` - `username text unique not null` -
`status text` - audit columns

**roles** - `id uuid primary key` - `code text unique` (`admin`,
`committee_member`, `treasurer`, `member`, `auditor`) -
`display_name_en text` - `display_name_ta text`

**member_roles** - `member_id uuid references members(id)` -
`role_id uuid references roles(id)` - `assigned_at`, `assigned_by` -
primary key `(member_id, role_id)`

A member may have many roles. A member may have no user account. A user
account is linked to at most one member. Passwords/password hashes are
managed by the identity provider, never stored in these tables.

### 2.2 Contribution records

**contribution_dues** - `id uuid primary key` -
`member_id uuid not null` - `period_start date not null` -
`period_end date not null` - `due_amount numeric(14,2) not null` -
`currency_code char(3) not null` - `due_date date` - `status text`
(`unpaid`, `partially_paid`, `paid`, `waived`) - unique
`(member_id, period_start, period_end)`

**payment_submissions** - `id uuid primary key` -
`member_id uuid not null` - `contribution_due_id uuid null` -
`submitted_by_user_id uuid` - `payment_date date` -
`amount numeric(14,2) not null` - `currency_code char(3) not null` -
`payment_method text` - `transaction_reference text` - `status text`
(`pending`, `approved`, `rejected`, `cancelled`) -
`approved_by_user_id uuid null` - `approved_at timestamptz null` -
`rejection_reason text null` - `fund_transaction_id uuid null` - audit
columns

One payment submission can have multiple attachments. A payment
submission is not itself a posted ledger entry. On approval, create fund
transaction and ledger entries in the same database transaction.

### 2.3 Assistance

**assistance_requests** - `id uuid primary key` -
`request_number text unique` - `requested_by_user_id uuid null` -
`public_requester_name text null` - `beneficiary_name_en text` -
`beneficiary_name_ta text` - `family_name_en text`,
`family_name_ta text` - `street_en text`, `street_ta text` -
`requested_amount numeric(14,2)` - `currency_code char(3)` -
`reason text` - `request_type text` (`normal`, `emergency`) -
`status text` (`submitted`, `pending_approval`, `approved`, `rejected`,
`ready_for_payout`, `paid`, `cancelled`) -
`public_tracking_token_hash text null` - audit columns

**approval_rounds** - `id uuid primary key` -
`assistance_request_id uuid not null` -
`eligible_committee_count int not null` -
`required_approvals int not null` - `approval_type text` -
`opened_at timestamptz` - `closed_at timestamptz`

**approval_eligible_members** - `approval_round_id uuid` -
`committee_member_id uuid` - primary key
`(approval_round_id, committee_member_id)`

**assistance_approvals** - `id uuid primary key` -
`approval_round_id uuid` - `committee_member_id uuid` - `decision text`
(`approved`, `rejected`) - `comments text` - `decided_at timestamptz` -
unique `(approval_round_id, committee_member_id)`

Freeze the eligible voters at round creation. This avoids role changes
during voting changing the denominator. Count approvals from the
approval rows; do not maintain manually editable counters.

### 2.4 Treasury and ledger

**fund_accounts** - `id uuid primary key` - `account_code text unique` -
`account_name text` - `account_type text` (`asset`, `income`, `expense`,
`equity`, `clearing`) - `currency_code char(3)` - `is_active boolean`

Examples: India Bank INR, India Cash INR, UAE Collection AED,
Contribution Income INR, Assistance Expense INR, Bank Charges INR, FX
Gain/Loss INR, AED FX Clearing.

**fund_transactions** - `id uuid primary key` -
`transaction_number text unique` - `transaction_type text` -
`transaction_date date` - `reference_type text` - `reference_id uuid` -
`description text` - `status text` (`draft`, `posted`, `reversed`) -
`idempotency_key text unique` - `posted_at timestamptz` -
`posted_by_user_id uuid` - `reversal_of_transaction_id uuid null` -
audit columns

**ledger_entries** - `id uuid primary key` -
`fund_transaction_id uuid not null` - `fund_account_id uuid not null` -
`side text check in ('debit','credit')` -
`account_currency_code char(3)` -
`transaction_amount numeric(16,4) not null` -
`functional_amount_inr numeric(16,2) not null` -
`exchange_rate_to_inr numeric(18,8) not null` - `description text`

For every posted journal, sum of `functional_amount_inr` debits must
equal credits. Also validate currency-specific subledger movements and
account rules. Do not add AED and INR balances together. Store both
original currency amount and INR functional equivalent to support
consolidated reporting and reconciliation.

### 2.5 UAE settlement

**monthly_uae_settlements** - `id uuid primary key` -
`settlement_month date not null` (first day of month) -
`total_aed_collected numeric(16,2)` -
`exchange_rate_inr_per_aed numeric(18,8)` -
`gross_inr_amount numeric(16,2)` - `transaction_charge numeric(14,2)` -
`transaction_charge_currency char(3)` (`INR` or `AED`) -
`tax_amount numeric(14,2)` - `tax_currency char(3)` -
`other_charges numeric(14,2)` - `other_charges_currency char(3)` -
`total_charges_inr numeric(16,2)` - `net_inr_amount numeric(16,2)` -
`bank_reference text` - `status text` (`draft`, `confirmed`,
`reversed`) - `fund_transaction_id uuid null` - audit columns - unique
`(settlement_month)` for a single village

Formula: - `gross_inr = total_aed_collected * exchange_rate` - For each
charge: INR charge = charge amount if currency INR; otherwise charge
amount × rate. - `total_charges_inr = sum(INR charge equivalents)` -
`net_inr = gross_inr - total_charges_inr`

Confirm whether tax and other charges, like transaction charge, may also
be entered in either currency. The design supports it.

Settlement must reconcile against confirmed AED payments for the month.
It must not count those payments as new income a second time. A
conversion moves value between AED and INR accounts and records charges
and any FX gain/loss.

### 2.6 Audit

**audit_logs** - `id uuid primary key` - `actor_user_id uuid` -
`actor_member_id uuid` - `actor_role_codes text[] not null` -
`entity_type text not null` - `entity_id uuid not null` -
`fund_transaction_id uuid null` - `action text not null` -
`old_values jsonb` - `new_values jsonb` - `reason text` -
`performed_at timestamptz not null default now()` -
`correlation_id uuid`

Role codes are captured as a snapshot at action time. This makes
historical role searches accurate even if a user later changes roles. Do
not store secrets, passwords or tokens in old/new JSON.

Suggested indexes:

``` sql
create index audit_user_time_idx on audit_logs(actor_user_id, performed_at desc);
create index audit_txn_idx on audit_logs(fund_transaction_id);
create index audit_action_time_idx on audit_logs(action, performed_at desc);
create index audit_entity_idx on audit_logs(entity_type, entity_id);
create index audit_roles_gin_idx on audit_logs using gin(actor_role_codes);
```

## 3. Workflow design

### 3.1 Member-submitted payment

1.  Member submits payment details and optional proof.
2.  Create `payment_submissions` with `pending` status.
3.  Notify eligible committee members.
4.  Committee member reviews proof and payment details.
5.  Server checks actor is committee member and is not the creator.
6.  On approval, one database transaction:
    -   lock payment submission;
    -   validate it is still pending;
    -   set approved metadata;
    -   create `fund_transactions` header;
    -   create balanced ledger entries;
    -   update related due status;
    -   insert audit events;
    -   commit.
7.  On rejection, record reason and audit event; do not post ledger.

### 3.2 Committee-recorded cash payment

1.  Committee member records the collection.
2.  It enters pending verification.
3.  A different committee member approves.
4.  Posting follows the same atomic financial transaction.
5.  This separation reduces self-approval/fraud risk.

### 3.3 Assistance approval

1.  Request submitted by logged-in role or public requester.
2.  Validate required fields and attachment policy.
3.  Create approval round and snapshot eligible committee members.
4.  Normal request required approvals = ceiling(eligible count × 0.5).
5.  Emergency request required approvals = 1.
6.  Only members in the frozen eligible list can vote once.
7.  When threshold is reached, request becomes approved.
8.  Treasurer checks fund availability and executes payout.
9.  Payout posts ledger transaction and audit event atomically.
10. If the eligible committee count is zero, request cannot enter
    voting; Admin must resolve committee configuration.

### 3.4 UAE monthly settlement

1.  Treasurer opens month.
2.  System calculates total confirmed AED payments for that month.
3.  Treasurer enters actual exchange rate and charges, each with
    currency.
4.  System calculates gross, charge equivalents and net INR.
5.  Treasurer enters bank reference and reviews reconciliation.
6.  Authorized confirmation posts conversion and charges to ledger.
7.  Confirmed settlement is immutable; correction requires reversal and
    a replacement settlement/adjustment.

## 4. API / RPC contracts

Prefer business operations exposed through secured RPC/Edge Functions.
Example contracts (names illustrative):

  -------------------------------------------------------------------------------
  Operation                      Input                        Result
  ------------------------------ ---------------------------- -------------------
  `create_payment_submission`    due ID, amount, currency,    pending submission
                                 method, reference,           
                                 attachment IDs               

  `approve_payment_submission`   submission ID, idempotency   posted transaction
                                 key                          ID

  `reject_payment_submission`    submission ID, reason        rejected status

  `create_assistance_request`    request fields, attachment   request number
                                 IDs                          

  `cast_assistance_vote`         request ID, decision,        updated approval
                                 comments                     state

  `create_assistance_payout`     request ID, amount, account  posted transaction
                                 ID, reference                ID

  `calculate_uae_settlement`     month                        AED total and draft
                                                              calculations

  `confirm_uae_settlement`       settlement ID, rate,         posted transaction
                                 charges, reference,          ID
                                 idempotency key              

  `get_dashboard_summary`        month                        role-authorized
                                                              aggregate

  `get_audit_history`            user/role/action/date/page   paginated audit
                                 filters                      rows
  -------------------------------------------------------------------------------

Every write operation must derive actor identity from the verified
session. Do not accept `actor_user_id`, `approved_by` or `posted_by` as
trusted client inputs.

## 5. Audit history query requirements

Filters: - User ID / username / member. - Role snapshot at action
time. - Date range. - Action type. - Entity type. - Transaction
number/reference. - Status.

Example:

``` sql
select *
from audit_logs
where actor_user_id = :user_id
order by performed_at desc
limit 5;
```

Role query:

``` sql
select *
from audit_logs
where actor_role_codes @> array['treasurer']::text[]
order by performed_at desc
limit 5;
```

If the UI says "last five transactions", deduplicate by
`fund_transaction_id` and select the latest relevant event per
transaction. If it says "last five activities", show five audit events.
Label these differently.

## 6. Dashboard data sources

Do not manually maintain dashboard totals initially. Build SQL views/RPC
that aggregate: - Active members: `members`. - Expected
dues/outstanding: `contribution_dues` plus approved payments. - Actual
collections: posted ledger and confirmed payment submissions. -
Assistance status: `assistance_requests` and approval records. - Payout
totals: posted fund transactions/ledger. - UAE settlement: settlement
table and ledger. - Available balances: posted ledger grouped by account
and currency. - Audit activity: audit logs.

Members must see only their own contribution records plus explicitly
approved community-level aggregates. Committee and Treasurer see broader
data according to policy. Auditor is read-only.

## 7. Authorization matrix

  Capability                          Admin   Committee                Treasurer         Member       Auditor
  ----------------------------- ----------- ----------- ------------------------ -------------- -------------
  View all members                      Yes         Yes            Limited/Yes\*             No   Read-only\*
  Create/update member                  Yes         Yes                       No             No            No
  Manage roles/accounts                 Yes          No                       No             No            No
  Submit own payment                    Yes         Yes                      Yes            Yes            No
  Register payment for member           Yes         Yes             Optional\*\*             No            No
  Approve payment submission      Yes\*\*\*         Yes                       No             No            No
  Create assistance request             Yes         Yes                      Yes            Yes           Yes
  Vote on assistance              Yes\*\*\*         Yes   Only if also committee             No            No
  Execute assistance payout       Yes\*\*\*          No                      Yes             No            No
  Manage UAE settlement                 Yes          No                      Yes             No     Read-only
  View fund balances                    Yes         Yes                      Yes   Summary only     Read-only
  View audit logs                       Yes          No          Own/limited\*\*             No           Yes
  Export audit report                   Yes          No                       No             No           Yes

\* Confirm whether Auditor may see full member PII and whether Treasurer
needs full member directory. Default to least privilege.\
\*\* Explicitly decide if required; avoid expanding roles
unnecessarily.\
\*\*\* Admin override should be audited and must not silently bypass
accounting controls. Prefer Admin acting through an explicit,
reason-required override path.

## 8. Security controls

-   Enable RLS on all user-accessible tables.
-   Keep service keys in server-side secrets only.
-   Deny anonymous select on private tables.
-   Check role permissions inside RPC/Edge Function and RLS.
-   Use transactions and row locks for approvals/posting.
-   Use idempotency keys for retries.
-   Validate attachment size/type and authorize every download.
-   Prevent self-approval.
-   Protect public request form against spam and enumeration.
-   Append-only audit policy; restrict update/delete.
-   Test policies with real role-specific test identities.

------------------------------------------------------------------------

# 04 --- Functional Specification

## 1. Requirements convention

Priority: **P0** release blocker, **P1** release 1, **P2** later
enhancement.

## 2. Authentication

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-AUTH-001             User can log in with    P0
                          assigned username and   
                          password.               

  FR-AUTH-002             Invalid login displays  P0
                          a generic error without 
                          revealing whether       
                          username exists.        

  FR-AUTH-003             Forgot-password flow is P0
                          available where a       
                          verified recovery       
                          channel exists.         

  FR-AUTH-004             Admin can               P0
                          invite/create, disable  
                          and re-enable accounts. 

  FR-AUTH-005             No unrestricted public  P0
                          registration.           

  FR-AUTH-006             A user can be assigned  P0
                          multiple roles.         

  FR-AUTH-007             One member can be       P0
                          linked to at most one   
                          user account.           

  FR-AUTH-008             Disabled accounts       P0
                          cannot access protected 
                          screens or APIs.        

  FR-AUTH-009             Session expiry and      P0
                          sign-out are supported. 
  -----------------------------------------------------------------------

## 3. Language and currency

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-I18N-001             UI supports English and P0
                          Tamil.                  

  FR-I18N-002             User can switch         P1
                          language; preference    
                          persists.               

  FR-I18N-003             Member names/addresses  P1
                          support English and     
                          Tamil fields.           

  FR-CUR-001              Every monetary record   P0
                          has currency code INR   
                          or AED.                 

  FR-CUR-002              INR and AED balances    P0
                          are displayed           
                          separately.             

  FR-CUR-003              Exchange rate is        P0
                          explicit and recorded   
                          with settlement.        

  FR-CUR-004              Charge currency can be  P1
                          INR or AED.             
  -----------------------------------------------------------------------

## 4. Member management

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-MEM-001              Admin and Committee     P0
                          Member can create       
                          members.                

  FR-MEM-002              Admin and Committee     P0
                          Member can update       
                          member details.         

  FR-MEM-003              Members can be          P0
                          deactivated without     
                          deleting financial      
                          history.                

  FR-MEM-004              Expected contribution   P1
                          frequency can be        
                          monthly or yearly.      

  FR-MEM-005              Expected amount is      P0
                          individually            
                          configurable.           

  FR-MEM-006              Member may exist        P0
                          without login access.   

  FR-MEM-007              Role assignment is      P0
                          restricted to Admin.    
  -----------------------------------------------------------------------

## 5. Contributions

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-CON-001              System records expected P1
                          dues by member and      
                          period.                 

  FR-CON-002              Member can submit       P0
                          amount, date, currency, 
                          method, reference and   
                          proof.                  

  FR-CON-003              Submission is pending   P0
                          until committee         
                          approval.               

  FR-CON-004              Committee Member can    P0
                          register payment        
                          collected from a        
                          member.                 

  FR-CON-005              A different committee   P0
                          member must approve a   
                          committee-created       
                          payment.                

  FR-CON-006              Approved payment posts  P0
                          ledger entries          
                          atomically.             

  FR-CON-007              Pending/rejected        P0
                          payment does not affect 
                          fund balance.           

  FR-CON-008              Partial payments and    P1
                          multiple installments   
                          are supported.          

  FR-CON-009              Member can view own     P0
                          latest five confirmed   
                          contributions.          

  FR-CON-010              Duplicate payment       P0
                          submission is prevented 
                          or flagged.             
  -----------------------------------------------------------------------

## 6. Assistance requests

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-ASST-001             All authenticated roles P0
                          can submit assistance   
                          request.                

  FR-ASST-002             Public user can submit  P0
                          assistance request      
                          without login.          

  FR-ASST-003             Public request form     P0
                          does not expose other   
                          requests or member      
                          data.                   

  FR-ASST-004             Attachments are private P0
                          and access-controlled.  

  FR-ASST-005             Only Committee Members  P0
                          can approve/reject.     

  FR-ASST-006             Normal request requires P0
                          at least 50% of         
                          eligible committee      
                          approvals.              

  FR-ASST-007             Emergency request       P0
                          requires one eligible   
                          committee approval.     

  FR-ASST-008             Eligible committee list P0
                          is frozen at            
                          approval-round          
                          creation.               

  FR-ASST-009             Approval and payout are P0
                          separate statuses.      

  FR-ASST-010             Payout is blocked if    P0
                          request is not          
                          approved.               

  FR-ASST-011             Rejection reason is     P1
                          recorded.               
  -----------------------------------------------------------------------

## 7. Treasury and settlement

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-TRE-001              Treasurer can record    P0
                          authorized inflows and  
                          outflows.               

  FR-TRE-002              Treasurer can record    P0
                          assistance payout after 
                          approval.               

  FR-TRE-003              Treasurer can create    P0
                          monthly UAE settlement. 

  FR-TRE-004              System calculates AED   P0
                          collection total for    
                          selected month.         

  FR-TRE-005              System calculates gross P0
                          INR, charges and net    
                          INR.                    

  FR-TRE-006              Transaction charge can  P0
                          be INR or AED.          

  FR-TRE-007              Confirmed settlement is P0
                          immutable; correction   
                          uses                    
                          reversal/adjustment.    

  FR-TRE-008              Settlement conversion   P0
                          does not duplicate      
                          contribution income.    

  FR-TRE-009              INR and AED account     P0
                          balances are separately 
                          reconcilable.           
  -----------------------------------------------------------------------

## 8. Dashboard

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-DASH-001             Dashboard content is    P0
                          role-specific.          

  FR-DASH-002             Committee can see       P0
                          overall fund and        
                          assistance summaries.   

  FR-DASH-003             Treasurer can see       P0
                          inflow/outflow,         
                          balances, expenses and  
                          settlements.            

  FR-DASH-004             Member can see own      P0
                          contribution details    
                          and approved community  
                          summary.                

  FR-DASH-005             Auditor can see         P0
                          authorized              
                          financial/audit         
                          summaries.              

  FR-DASH-006             Dashboard totals are    P0
                          sourced from            
                          authoritative database  
                          views/ledger.           
  -----------------------------------------------------------------------

## 9. Audit and reports

  -----------------------------------------------------------------------
  ID                      Requirement             Priority
  ----------------------- ----------------------- -----------------------
  FR-AUD-001              Record actor, member,   P0
                          role snapshot, action,  
                          entity and timestamp.   

  FR-AUD-002              Capture old/new values  P0
                          for material changes.   

  FR-AUD-003              Auditor can filter by   P0
                          user, role, action,     
                          entity and date.        

  FR-AUD-004              Auditor can view last   P0
                          five activities for a   
                          selected user.          

  FR-AUD-005              Auditor can view last   P1
                          five distinct           
                          transactions for a      
                          selected user.          

  FR-AUD-006              Audit records cannot be P0
                          modified/deleted by     
                          normal application      
                          users.                  

  FR-AUD-007              Financial posting and   P0
                          audit insertion occur   
                          in the same database    
                          transaction.            

  FR-REP-001              Auditor can generate    P1
                          role/user audit report. 

  FR-REP-002              Exported reports        P1
                          respect role and data   
                          privacy rules.          
  -----------------------------------------------------------------------

## 10. UX requirements

-   Mobile-first layout with clear primary actions.
-   Role-specific landing page; avoid showing inaccessible menu items.
-   Show clear statuses: Pending, Approved, Rejected, Paid, Reversed.
-   Use confirmation screens for irreversible financial actions.
-   Show currency code beside every amount.
-   Show exchange rate and calculation breakdown before settlement
    confirmation.
-   Provide Tamil/English labels and validation messages.
-   Provide empty, loading, retry and error states.
-   Paginate long histories; never download all audit/ledger rows to the
    browser.
-   Accessibility: keyboard navigation, semantic labels, adequate
    contrast and scalable text.

------------------------------------------------------------------------

# 05 --- Use Cases

## UC-01: Member login

**Actors:** Member, Admin, Committee Member, Treasurer, Auditor\
**Preconditions:** Account exists, is enabled and linked to the correct
member.\
**Main flow:** 1. User opens app. 2. User enters username and password.
3. Auth provider validates credentials. 4. Application loads roles and
permitted navigation. 5. User lands on role-appropriate dashboard.

**Alternate/error flows:** Invalid credentials show generic message;
disabled account is denied; network failure offers retry; expired
session requires sign-in.\
**Acceptance:** No protected data is returned before authentication and
authorization.

## UC-02: Forgot password

**Actors:** User, Auth provider, Admin\
**Preconditions:** User has verified recovery channel or admin recovery
procedure is configured.\
**Main flow:** User selects Forgot Password, enters username/recovery
email, receives reset instructions, completes reset and logs in.\
**Security:** Response must not disclose whether a username exists.
Reset links are short-lived and single-use. If no verified email exists,
provide admin-assisted identity verification; never reveal or send the
old password.

## UC-03: Create member

**Actors:** Admin, Committee Member\
**Main flow:** Open Members → Add Member → enter bilingual
name/contact/address and expected contribution → validate → save → audit
event created.\
**Alternate:** Duplicate member number/phone warning; incomplete
required fields; member can be saved without a login account.\
**Acceptance:** Historical records remain if member later becomes
inactive.

## UC-04: Assign login and roles

**Actors:** Admin\
**Main flow:** Select member → create/invite login → assign unique
username → assign one or more roles → send initial setup/recovery
instructions.\
**Rules:** One login per member; role changes are audited; password is
managed by auth provider.

## UC-05: Member submits contribution

**Actors:** Member, Committee Member\
**Main flow:** Member opens My Contributions → Submit Payment → enters
period, amount, currency, payment date/method/reference → attaches proof
→ submits. System records pending submission and notifies committee.
Committee reviews and approves/rejects.\
**Approval:** Approver cannot be the payment creator. On approval,
system posts ledger transaction atomically.\
**Alternate:** Missing attachment if required, invalid amount, duplicate
reference, rejection with reason.\
**Acceptance:** Pending/rejected submission does not increase balance.

## UC-06: Committee records collected payment

**Actors:** Committee Member, second Committee Member\
**Main flow:** Committee opens member record → Record Collection →
enters amount/currency/date/method/reference → saves pending
verification → another committee member approves → ledger posting.\
**Acceptance:** Self-approval is blocked and audited.

## UC-07: Public assistance request

**Actors:** Public requester\
**Main flow:** Open public request page → choose language → enter
minimum beneficiary/contact/request details → attach supporting document
→ pass anti-spam validation → submit → receive request
reference/tracking token.\
**Security:** Public user cannot query request lists, member directory
or status by sequential ID.\
**Acceptance:** Request enters moderation/committee workflow without
exposing private records.

## UC-08: Committee votes on assistance

**Actors:** Committee Member\
**Preconditions:** Request has active approval round and actor is in
frozen eligible voter set.\
**Main flow:** Open pending request → review details and attachments →
approve/reject with optional comment → vote stored once → threshold
recalculated atomically.\
**Rules:** Normal = ceil(eligible voters × 0.5) approvals; Emergency =
one approval.\
**Alternate:** Ineligible voter denied; duplicate vote denied; closed
round rejects new vote.\
**Open decision:** Exact rejection threshold for normal requests must be
approved by committee.

## UC-09: Treasurer pays approved assistance

**Actors:** Treasurer\
**Preconditions:** Request is approved and funds are available in
selected currency/account.\
**Main flow:** Open approved request → select payout account/currency →
enter actual amount/date/reference → confirm → post ledger debit/credit
→ mark request paid → audit event.\
**Alternate:** Insufficient balance blocks payout; duplicate idempotency
key does not create duplicate payout.\
**Acceptance:** Request cannot be marked paid without posted payout.

## UC-10: Treasurer confirms UAE settlement

**Actors:** Treasurer, Auditor\
**Main flow:** Select month → system totals confirmed AED collections →
treasurer enters actual rate and charges with currency → system previews
gross/charges/net → treasurer enters bank reference → confirms → ledger
conversion and charges posted atomically.\
**Alternate:** No AED collections; invalid rate; charges exceed gross;
duplicate month settlement; bank reference missing.\
**Acceptance:** Conversion does not duplicate contribution income; AED
and INR balances reconcile.

## UC-11: Auditor searches user activity

**Actors:** Auditor\
**Main flow:** Open Audit History → choose User → select member/user →
choose last 5 → view latest activities or distinct transactions → open
event details.\
**Filters:** Role snapshot, action, entity type, date range, transaction
reference.\
**Acceptance:** Role search uses role held at event time, not current
role only.

## UC-12: Auditor searches by role

**Actors:** Auditor\
**Main flow:** Select role (e.g. Treasurer) → choose date range and
count → view audit events with actor, timestamp, action and
transaction.\
**Acceptance:** Results include users who held that role at event time
even if role was later removed.

## UC-13: View dashboard

**Actors:** All authenticated roles\
**Main flow:** Login → dashboard API/RPC checks roles → returns
permitted aggregates → UI displays INR and AED separately.\
**Acceptance:** Member cannot retrieve another member's personal
contribution history; aggregate visibility follows policy.

## UC-14: Reverse an incorrect posted transaction

**Actors:** Treasurer with authorized approval/Admin\
**Main flow:** Find posted transaction → choose Reverse → enter reason →
system creates opposite/reversal journal linked to original → both
original and reversal remain visible → audit event recorded.\
**Acceptance:** Original posted rows are never overwritten or deleted;
reversal is balanced and idempotent.

------------------------------------------------------------------------

# 06 --- Implementation Plan

## 1. Delivery strategy

Use an incremental delivery. Preserve the current POC where it is sound;
replace unsafe or incompatible parts in small steps. Do not begin with
microservices or a native mobile rewrite.

## 2. Phase plan

  -----------------------------------------------------------------------
  Phase                   Scope                   Exit criteria
  ----------------------- ----------------------- -----------------------
  0\. Discovery           Branch review, POC      Signed architecture
                          walkthrough,            decisions and
                          requirements decisions, repository inventory
                          cost and provider       
                          validation              

  1\. Foundation          App structure,          Secure login and
                          environments, auth,     role-specific shell in
                          RLS, i18n, CI/CD,       staging
                          design system           

  2\. Members and roles   Member CRUD, account    Admin/Committee
                          linking, role           workflows pass
                          assignment              

  3\. Contributions       Dues, payment           Approved payment posts
                          submission,             balanced ledger;
                          attachments, committee  pending/rejected do not
                          approval                

  4\. Assistance          Public form, private    Normal/emergency
                          attachments, approval   approval rules enforced
                          rounds, voting          

  5\. Treasury            Accounts,               Currency reconciliation
                          inflows/outflows,       and reversal tests pass
                          assistance payout, UAE  
                          settlement              

  6\. Dashboards and      Role dashboards, audit  User/role/date filters
  audit                   search, reports         work and access tests
                                                  pass

  7\. Pilot               Import verified member  Committee sign-off
                          data, user training,    
                          UAT, restore drill      

  8\. Production          Domain, monitoring,     Production readiness
                          backups, operational    checklist complete
                          runbook                 
  -----------------------------------------------------------------------

## 3. Suggested sequencing

-   Start with schema and security policies before building screens that
    depend on them.
-   Build one vertical slice at a time: UI → trusted API/RPC → DB
    transaction → audit → tests.
-   Build ledger posting before implementing payouts and settlements.
-   Implement payment approval and assistance approval as separate
    workflows.
-   Add dashboard views after underlying data and posting rules
    stabilize.

## 4. Environment setup

-   Local: `.env.local` with local/test credentials only.
-   Staging: isolated backend project and synthetic users/data.
-   Production: separate project, restricted secrets, backups and
    monitoring.
-   Never commit `.env`, service-role keys, admin passwords or real
    member data.
-   Maintain database migrations in version control.
-   Run migrations through CI/CD or controlled release process.

## 5. CI/CD pipeline

On pull request: 1. Install pinned dependencies. 2. Format/lint. 3.
TypeScript typecheck. 4. Unit tests. 5. Database migration validation
and policy tests. 6. Build PWA. 7. Dependency/security scan. 8. Publish
preview build if safe.

On main: 1. Repeat checks. 2. Deploy staging. 3. Run smoke tests. 4.
Production deployment requires explicit approval.

## 6. Data migration from POC

1.  Inventory current Firebase collections, rules and sample data.
2.  Export and classify data.
3.  Map current fields to normalized PostgreSQL tables.
4.  Identify duplicates, missing currencies, ambiguous dates and invalid
    references.
5.  Transform into staging.
6.  Reconcile member counts, contribution totals and expenses.
7.  Obtain treasurer/auditor sign-off.
8.  Import production data during controlled cutover.
9.  Preserve source export read-only for agreed retention period.

Do not migrate any POC financial totals without reconciliation against
original source records.

## 7. Production readiness checklist

-   [ ] All P0 requirements implemented.
-   [ ] RLS tests pass for every role and anonymous user.
-   [ ] No secret keys in frontend bundle or repository history.
-   [ ] Payment and payout posting is atomic and idempotent.
-   [ ] Self-approval blocked.
-   [ ] Assistance approval thresholds tested.
-   [ ] INR/AED reconciliation signed off.
-   [ ] Audit logs append-only and searchable.
-   [ ] Backup and restore drill completed.
-   [ ] Attachment access tested.
-   [ ] Error logging and operational contact defined.
-   [ ] Tamil and English reviewed by fluent users.
-   [ ] Member data import reconciled.
-   [ ] Committee approves the annual cost and operational owner.

------------------------------------------------------------------------

# 07 --- Task Breakdown

Tasks are grouped as epics. Estimates are intentionally omitted until
the repository and available contributors are assessed.

## EPIC 0 --- Discovery and repository assessment

-   T0.1 Inventory all branches and commit histories.
-   T0.2 Compare unmerged branches and identify merge conflicts.
-   T0.3 Inspect current screens, routes, components and state
    management.
-   T0.4 Inventory Firebase collections, auth setup and Firestore rules.
-   T0.5 Run existing POC locally and document known defects.
-   T0.6 Confirm business decisions and annual cost envelope.
-   **Acceptance:** Repository reuse/migration decision approved.

## EPIC 1 --- Architecture and engineering foundation

-   T1.1 Establish feature-based React/TypeScript structure.
-   T1.2 Configure lint, typecheck, unit tests and build checks.
-   T1.3 Configure local/staging/production environment separation.
-   T1.4 Add database migrations and seed reference roles/accounts.
-   T1.5 Configure PWA manifest, icons and responsive shell.
-   T1.6 Add English/Tamil i18n framework.
-   **Acceptance:** CI green; app runs in browser and installs as PWA.

## EPIC 2 --- Authentication and authorization

-   T2.1 Configure managed auth provider.
-   T2.2 Implement username login resolution safely.
-   T2.3 Implement forgot-password/recovery flow.
-   T2.4 Implement user-account/member linking.
-   T2.5 Implement multi-role assignment.
-   T2.6 Add RLS policies and role authorization functions.
-   T2.7 Add account disable/re-enable.
-   **Acceptance:** Role-based API access tests pass; no public signup.

## EPIC 3 --- Member management

-   T3.1 Member list/search/filter/pagination.
-   T3.2 Create/edit/deactivate member.
-   T3.3 Bilingual fields and validation.
-   T3.4 Expected monthly/yearly contribution settings.
-   T3.5 Account invitation and role assignment UI.
-   T3.6 Audit member changes.
-   **Acceptance:** Admin and Committee workflows work; member history
    retained.

## EPIC 4 --- Contributions and verification

-   T4.1 Generate/manage contribution dues.
-   T4.2 Member payment submission UI.
-   T4.3 Private proof upload/download.
-   T4.4 Committee pending verification queue.
-   T4.5 Approve/reject with reason.
-   T4.6 Prevent creator self-approval.
-   T4.7 Implement idempotent ledger posting RPC.
-   T4.8 Member contribution history and latest five.
-   T4.9 Duplicate reference detection.
-   **Acceptance:** Only approved payments affect posted balances.

## EPIC 5 --- Assistance requests

-   T5.1 Public assistance form and abuse protection.
-   T5.2 Authenticated assistance form.
-   T5.3 Private attachments.
-   T5.4 Approval round and eligible-voter snapshot.
-   T5.5 Committee approval/rejection UI.
-   T5.6 Normal 50% threshold.
-   T5.7 Emergency one-approval threshold.
-   T5.8 Request status and notification.
-   **Acceptance:** Unauthorized users cannot view requests; threshold
    is enforced server-side.

## EPIC 6 --- Ledger and treasury

-   T6.1 Configure chart of accounts in INR/AED.
-   T6.2 Create fund transaction and ledger schema.
-   T6.3 Add balanced journal validation.
-   T6.4 Add inflow/outflow/expense workflows.
-   T6.5 Add assistance payout posting.
-   T6.6 Add reversal/adjustment workflow.
-   T6.7 Add account reconciliation report.
-   **Acceptance:** All posted journals balance and cannot be edited.

## EPIC 7 --- UAE settlement

-   T7.1 Calculate confirmed AED collections by month.
-   T7.2 Settlement draft screen.
-   T7.3 Rate and charge currency entry.
-   T7.4 Gross/charges/net calculation preview.
-   T7.5 Confirmation and bank reference.
-   T7.6 Ledger conversion posting and FX handling.
-   T7.7 Duplicate-month and reversal controls.
-   **Acceptance:** No double counting; AED/INR reconciled.

## EPIC 8 --- Dashboard and reporting

-   T8.1 Role-specific dashboard RPC/views.
-   T8.2 Member dashboard and latest five payments.
-   T8.3 Committee dashboard.
-   T8.4 Treasurer dashboard.
-   T8.5 Auditor dashboard.
-   T8.6 Date/user/role filters.
-   T8.7 CSV export and privacy checks.
-   **Acceptance:** Data returned is scoped by role and member.

## EPIC 9 --- Audit history

-   T9.1 Audit schema and append-only policies.
-   T9.2 Capture actor and role snapshot.
-   T9.3 Capture old/new values and correlation ID.
-   T9.4 Audit financial posting in same transaction.
-   T9.5 User filter and last-five activities.
-   T9.6 Role filter and date/action/entity filters.
-   T9.7 Distinct transaction view.
-   T9.8 Audit report export.
-   **Acceptance:** Auditor can trace every material operation.

## EPIC 10 --- Quality, deployment and operations

-   T10.1 Unit/integration/E2E test suite.
-   T10.2 Security and RLS test matrix.
-   T10.3 Performance and accessibility review.
-   T10.4 Backup/restore automation and drill.
-   T10.5 Production monitoring and alerting.
-   T10.6 User training and operational guide.
-   T10.7 Production cutover and support handover.
-   **Acceptance:** Production readiness checklist signed off.

------------------------------------------------------------------------

# 08 --- Test Cases

## 1. Test approach

-   Unit tests: calculations, validators, role helpers and status
    transitions.
-   Integration tests: database RPCs, RLS, storage and auth.
-   End-to-end tests: user journeys on mobile and desktop viewports.
-   Accounting tests: balanced journals, reconciliation and reversals.
-   Security tests: anonymous access, privilege escalation, IDOR and
    file access.
-   UAT: committee, treasurer, auditor and member representatives.

Use synthetic data. Never use real member financial information in
automated tests.

## 2. Authentication and roles

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-AUTH-001             Login with valid        User reaches permitted
                          username/password       dashboard

  TC-AUTH-002             Login with invalid      Generic error; no
                          password                account enumeration

  TC-AUTH-003             Login with unknown      Same generic error
                          username                behavior

  TC-AUTH-004             Disabled user attempts  Access denied
                          login                   

  TC-AUTH-005             Forgot password for     Secure reset sent
                          verified account        

  TC-AUTH-006             Forgot password for     Non-enumerating
                          unknown username        response

  TC-AUTH-007             Member with two roles   Both roles loaded and
                          logs in                 permitted navigation
                                                  shown

  TC-AUTH-008             Member has no login     Member record remains
                          account                 valid; login
                                                  unavailable

  TC-AUTH-009             Attempt to link second  Unique constraint
                          account to same member  blocks

  TC-AUTH-010             Anonymous user requests Denied
                          protected dashboard API 
  -----------------------------------------------------------------------

## 3. Member management

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-MEM-001              Admin creates member    Record saved and audit
                                                  event created

  TC-MEM-002              Committee creates       Allowed and audited
                          member                  

  TC-MEM-003              Member attempts member  Denied
                          CRUD                    

  TC-MEM-004              Duplicate member number Rejected with useful
                                                  validation

  TC-MEM-005              Save Tamil and English  Both values persist and
                          name                    render

  TC-MEM-006              Deactivate member with  Member inactive;
                          financial history       history retained

  TC-MEM-007              Assign role as          Denied
                          non-admin               

  TC-MEM-008              Set negative expected   Validation rejects
                          contribution            
  -----------------------------------------------------------------------

## 4. Payment and contribution

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-PAY-001              Member submits INR      Pending submission
                          payment                 created

  TC-PAY-002              Member submits AED      Pending submission
                          payment                 created with AED

  TC-PAY-003              Submission has          Private object stored
                          attachment              and metadata linked

  TC-PAY-004              Committee approves      One posted transaction
                          valid payment           and balanced journal

  TC-PAY-005              Committee rejects       Rejected with reason;
                          payment                 no ledger posting

  TC-PAY-006              Pending payment queried Excluded
                          in balance              

  TC-PAY-007              Creator tries to        Denied
                          approve own payment     

  TC-PAY-008              Different committee     Allowed
                          member approves         

  TC-PAY-009              Same approval request   Idempotent; no
                          retried                 duplicate posting

  TC-PAY-010              Two approvers act       Only one valid state
                          concurrently            transition

  TC-PAY-011              Partial payment         Due becomes partially
                          submitted               paid after approval

  TC-PAY-012              Two installments for    Both recorded; due
                          one period              balance correct

  TC-PAY-013              Member queries another  Denied
                          member's history        

  TC-PAY-014              Member requests latest  Only own five latest
                          five                    confirmed payments
                                                  returned

  TC-PAY-015              Duplicate bank          Flagged/rejected per
                          reference submitted     configured uniqueness
                                                  policy
  -----------------------------------------------------------------------

## 5. Assistance requests and approvals

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-ASST-001             Public submits valid    Request created;
                          request                 private reference
                                                  returned

  TC-ASST-002             Public attempts list    Denied
                          all requests            

  TC-ASST-003             Member submits          Request created
                          assistance request      

  TC-ASST-004             Treasurer submits       Request created
                          request                 

  TC-ASST-005             Auditor submits request Request created if
                                                  policy permits all
                                                  roles

  TC-ASST-006             Member attempts         Denied
                          approval vote           

  TC-ASST-007             Committee member votes  Vote recorded once
                          on normal request       

  TC-ASST-008             Ten eligible committee  Request approved
                          members; five approve   

  TC-ASST-009             Ten eligible; four      Remains pending
                          approve                 

  TC-ASST-010             Emergency request gets  Request approved
                          one approval            

  TC-ASST-011             Non-eligible committee  Denied
                          member tries vote       

  TC-ASST-012             Same voter submits      Unique constraint
                          second vote             blocks

  TC-ASST-013             Committee role removed  Frozen eligibility
                          after round opens       behavior remains
                                                  consistent

  TC-ASST-014             Zero eligible committee Round cannot start;
                          members                 admin action required

  TC-ASST-015             Payout attempted before Denied
                          approval                

  TC-ASST-016             Payout with             Denied; no ledger
                          insufficient balance    posting

  TC-ASST-017             Approved request paid   Ledger posted and
                          successfully            request marked paid

  TC-ASST-018             Duplicate payout retry  No duplicate financial
                                                  movement
  -----------------------------------------------------------------------

## 6. UAE settlement and accounting

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-SET-001              Calculate AED total for Only confirmed AED
                          month                   payments included

  TC-SET-002              Pending AED submission  Excluded from
                          exists                  settlement

  TC-SET-003              Calculate gross INR     AED × INR/AED rate

  TC-SET-004              Transaction charge in   Used directly in INR
                          INR                     total

  TC-SET-005              Transaction charge in   Converted using
                          AED                     settlement rate

  TC-SET-006              Tax/other charge        Correct INR equivalent
                          currency selected       computed

  TC-SET-007              Charges exceed gross    Confirmation blocked or
                          amount                  explicit exception
                                                  policy required

  TC-SET-008              Duplicate settlement    Unique constraint
                          month                   blocks

  TC-SET-009              Confirm settlement      Conversion and charges
                                                  post atomically

  TC-SET-010              Confirmed settlement    Direct edit blocked
                          edited                  

  TC-SET-011              Reverse settlement      Reversal journal
                                                  created; original
                                                  preserved

  TC-SET-012              Conversion counted as   Test must fail;
                          contribution income     conversion is not new
                                                  income

  TC-SET-013              AED and INR balances    Separate values and
                          displayed               currencies

  TC-SET-014              Journal debits do not   Posting blocked
                          equal credits           

  TC-SET-015              Double-click confirm    Idempotency prevents
                                                  duplicate journal
  -----------------------------------------------------------------------

## 7. Audit and dashboard

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-AUD-001              Create/update member    Actor, action and
                                                  old/new values recorded

  TC-AUD-002              Approve payment         Actor, role snapshot
                                                  and transaction
                                                  reference recorded

  TC-AUD-003              User role changes later Historical role
                                                  snapshot unchanged

  TC-AUD-004              Auditor filters by user Correct user's audit
                                                  events returned

  TC-AUD-005              Auditor filters by      Events include users
                          Treasurer role          who held role at event
                                                  time

  TC-AUD-006              Last five activities    Five latest audit
                                                  events returned

  TC-AUD-007              Last five transactions  Five distinct
                                                  transaction IDs
                                                  returned

  TC-AUD-008              Member attempts read    Denied
                          audit table             

  TC-AUD-009              Normal user attempts    Denied
                          update/delete audit     

  TC-AUD-010              Secret/token appears in Test fails; sensitive
                          audit payload           data must be redacted

  TC-DASH-001             Member opens dashboard  Own private details
                                                  plus allowed aggregates

  TC-DASH-002             Committee opens         Overall operational
                          dashboard               summary

  TC-DASH-003             Treasurer opens         Financial balances and
                          dashboard               settlements

  TC-DASH-004             Auditor opens dashboard Read-only
                                                  audit/financial
                                                  summaries

  TC-DASH-005             Dashboard totals        Totals reconcile
                          compared with ledger    
  -----------------------------------------------------------------------

## 8. Security and privacy

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-SEC-001              Anonymous select on     Denied
                          members                 

  TC-SEC-002              Anonymous select on     Denied
                          ledger                  

  TC-SEC-003              Anonymous select on     Denied
                          audit logs              

  TC-SEC-004              Change record ID in API No unauthorized record
                          request                 disclosure

  TC-SEC-005              Member calls admin RPC  Denied server-side

  TC-SEC-006              Frontend bundle         No privileged secret
                          inspected for service   present
                          key                     

  TC-SEC-007              Unauthorized attachment Denied/expired
                          URL access              

  TC-SEC-008              Oversized or            Rejected
                          unsupported attachment  

  TC-SEC-009              Public form spam/rate   Requests throttled
                          limit                   

  TC-SEC-010              SQL injection payload   Safely handled by
                          in form                 parameterized
                                                  operations
  -----------------------------------------------------------------------

## 9. UX, language and responsive behavior

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-UX-001               Switch English to Tamil All supported labels
                                                  change

  TC-UX-002               Reload after language   Preference persists
                          selection               

  TC-UX-003               Open on phone width     No horizontal overflow
                                                  for core screens

  TC-UX-004               Open on desktop         Layout uses available
                                                  width appropriately

  TC-UX-005               Upload attachment from  File/camera selection
                          mobile                  works where supported

  TC-UX-006               Slow network            Loading and retry
                                                  states shown

  TC-UX-007               Submit invalid form     Clear field-level
                                                  messages

  TC-UX-008               Confirm payout          Review screen shows
                                                  amount and currency
                                                  before final action
  -----------------------------------------------------------------------

## 10. Recovery and operations

  -----------------------------------------------------------------------
  ID                      Scenario                Expected result
  ----------------------- ----------------------- -----------------------
  TC-OPS-001              Restore database backup Restore completes and
                          to staging              integrity checks pass

  TC-OPS-002              Export financial data   Export matches ledger

  TC-OPS-003              Migration applied twice Safe/versioned
                                                  migration behavior

  TC-OPS-004              Backend unavailable     UI shows safe error; no
                                                  false success

  TC-OPS-005              Posting RPC times out   Idempotency prevents
                          and client retries      duplicate posting
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 09 --- Architecture Decision Records (ADR)

## ADR-001: Responsive PWA before native mobile apps

**Status:** Proposed\
**Decision:** Continue with React + TypeScript + Vite and deliver a
responsive installable PWA first.\
**Context:** Existing repository is a React web POC. User needs browser
and mobile access with minimal annual cost.\
**Alternatives:** React Native + Expo immediately; separate web and
mobile apps.\
**Rationale:** Reuses existing code, reduces duplicated UI and
maintenance, supports mobile browser installation.\
**Consequences:** Some native capabilities and app-store distribution
are deferred. Revisit if required.

## ADR-002: PostgreSQL for financial system of record

**Status:** Proposed\
**Decision:** Use managed PostgreSQL, with Supabase as the leading
integrated option for evaluation.\
**Context:** The domain has relational membership, roles, approval
workflows, ledger entries, settlements and audit queries.\
**Alternatives:** Continue Firebase Firestore; Neon plus separately
managed auth/storage/backend.\
**Rationale:** Relational constraints, transactions, joins, reporting
and balanced ledger posting are natural in PostgreSQL. Supabase offers
integrated Auth, Storage and RLS, potentially reducing integration
effort.\
**Consequences:** Need SQL migrations, RLS expertise and database backup
strategy. Validate provider cost/limits and recovery before production.

## ADR-003: No passwords in application tables

**Status:** Accepted\
**Decision:** Credentials and password reset are handled by managed
authentication. `user_accounts` stores provider identity reference
only.\
**Rationale:** Avoid custom password storage and credential security
liability.\
**Consequences:** Username support may need a secure server-side
username-to-auth-identity resolver if provider does not natively support
usernames.

## ADR-004: Append-only audit and immutable ledger

**Status:** Accepted\
**Decision:** Posted ledger entries and audit events cannot be
edited/deleted by normal application flows. Corrections use reversals
and adjustments.\
**Rationale:** Financial traceability and accountability.\
**Consequences:** More records and explicit correction workflow; audit
and ledger retention policy must be defined.

## ADR-005: INR functional currency, AED tracked separately

**Status:** Proposed\
**Decision:** INR is consolidated reporting currency; AED account
balances remain separate. Store original currency amount, rate and INR
functional equivalent for each relevant ledger entry.\
**Rationale:** Prevent invalid addition of unlike currencies and enable
consolidated reporting.\
**Consequences:** FX valuation and realized gain/loss policy must be
approved by Treasurer/Auditor.

## ADR-006: Approval and payout are separate

**Status:** Accepted\
**Decision:** Assistance approval does not mark request paid. Treasurer
must separately execute and post payout.\
**Rationale:** Separation of governance decision and cash disbursement.\
**Consequences:** Additional state transitions and audit records.

## ADR-007: Snapshot committee eligibility

**Status:** Proposed\
**Decision:** Freeze eligible committee voters when an approval round
opens.\
**Rationale:** Prevent role changes during voting from changing approval
threshold or eligibility retroactively.\
**Consequences:** Reopen/restart process must be defined if committee
membership is wrong.

## ADR-008: Free tier is for pilot, not a production guarantee

**Status:** Accepted\
**Decision:** Start on free tiers where appropriate, but production
approval requires explicit backup, restore, availability and cost
review.\
**Rationale:** Financial data requires reliable recovery.\
**Consequences:** A modest annual hosting budget may be necessary.

## Open decisions before implementation

1.  Confirm Supabase versus Neon plus separate services. Compare current
    annual costs and service limits.
2.  Confirm username login behavior and verified recovery channel.
3.  Confirm whether public assistance requests require phone
    verification.
4.  Confirm normal assistance rejection threshold.
5.  Confirm whether Admin can approve a payment/assistance request as an
    override.
6.  Confirm payout dual-control requirement (Treasurer executes; another
    authorized person approves).
7.  Confirm whether transaction charges, tax and other charges can each
    be INR or AED.
8.  Confirm FX rate source and realized FX gain/loss treatment.
9.  Confirm whether Auditor may see member phone/email and assistance
    attachments.
10. Confirm member-visible dashboard aggregates and privacy policy.
11. Confirm duplicate payment reference rules and cash receipt
    numbering.
12. Confirm data retention and attachment deletion policy.

------------------------------------------------------------------------

# 10 --- Repository Assessment and Reuse Plan

## 1. Repository

`https://github.com/tmkuaewelfarecommunityadmin/welfare-community-app`

The public repository landing page identifies the project as a community
welfare application for member contributions, expenses, ledger and
dashboard.

## 2. What was visible in this inspection

The public `main` branch root listing included: - `src/` - `public/` -
`dev-dist/` - `.env.example` - `firebase-applet-config.json` -
`firebase-blueprint.json` - `firestore.rules` - `package.json` -
`vite.config.ts` - `tsconfig.json` - `bun.lock` - `README.md`

The visible `package.json` indicated: - React 19 and React DOM -
TypeScript - Vite - Firebase SDK - Tailwind CSS and its Vite plugin -
Express dependency - Vite PWA plugin - Recharts - Motion - Google GenAI
SDK

The README currently contains only a short project description.

The GitHub pull-request page showed zero open PRs and one closed PR at
inspection time.

## 3. Inspection limitations

The web inspection did not expose the complete `src` directory or branch
contents. Therefore this document does not claim to have reviewed
component implementation, Firebase data model, actual Firestore security
behavior, all commits, branch diffs or unmerged work. The user mentioned
additional branches awaiting merge; those branches still need a
local/authorized Git review.

## 4. Initial architectural observations

### Reuse candidates

-   React/TypeScript/Vite frontend.
-   Existing PWA setup.
-   Existing design components and screens, after quality review.
-   Existing bilingual or currency utilities if present and correct.
-   Existing charts/dashboard components if data contracts are safe.

### Areas requiring focused review

-   Firebase authentication and whether username login is actually
    implemented.
-   Firestore rules: ensure no broad public read/write access.
-   Existing collection/document schema and financial consistency.
-   Any client-side balance calculations.
-   Any direct client writes to ledger-like collections.
-   Attachment storage access and public URLs.
-   Role checks implemented only in UI.
-   Express server purpose and deployment assumptions.
-   Secrets and environment configuration.
-   PWA cache behavior for sensitive pages and logout.
-   Dependency health, lockfile and build reproducibility.

## 5. Branch review procedure

Run locally with repository access:

``` bash
git fetch --all --prune
git branch -a
git log --oneline --decorate --graph --all
git status
```

For each unmerged branch:

``` bash
git log --oneline main..origin/<branch>
git diff --stat main...origin/<branch>
git diff --name-status main...origin/<branch>
git diff main...origin/<branch>
```

Then: 1. Identify feature owner and intent. 2. Build/test each branch
independently. 3. Check schema/security impact. 4. Identify overlapping
files and conflicts. 5. Merge only after tests and code review. 6.
Record accepted/rejected changes in a branch inventory.

## 6. Recommended next technical review

Request or provide a ZIP/local checkout containing: - Full source
tree. - All relevant branches or patch files. - Firebase rules and
schema/export samples (sanitized). - `.env.example` only; never share
actual secrets. - Current deployment details. - Screenshots or test
credentials for a staging environment.

The next review should produce: - Existing feature inventory. -
Reuse/replace decision per feature. - Data migration map from Firestore
to PostgreSQL if selected. - Security findings ranked
Critical/High/Medium/Low. - Branch merge recommendation. - Updated task
estimates.

## 7. Preliminary conclusion

Do not discard the current POC. Keep the React/Vite/PWA foundation
unless a code review identifies fundamental issues. Treat Firebase as
the current implementation dependency, not an irreversible architecture
decision. Given the accounting and approval requirements, evaluate
migration of the system of record to PostgreSQL before real financial
data is introduced.
