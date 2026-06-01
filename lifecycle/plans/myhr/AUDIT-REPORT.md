# Audit Report: myhr
Date: 2026-06-01T11:31:41.942Z
Scanner: 2026-06-01T11:26:59.939Z

## Findings by Module

### module-001
[LOGIC-001] P1 performance AiInsightsController.php:140 — N+1 query risk inside `map` closure where `Employee::find()` is called for every anomaly detected.
[MAINT-002] P2 code-quality AiInsightsController.php:73,83,96 — Business rule thresholds are hardcoded magic numbers instead of configuration constants.
[ROBUST-003] P2 bug AiInsightsController.php:120 — Code uses method `calculateAnomalyScore` which is not defined in the controller, causing a runtime error.
[ROBUST-004] P3 bug AiInsightsController.php:148 — File ends abruptly mid-array definition inside the nested `map` closure, causing a syntax error.

### module-002
[ISSUE-01] P2 security app/Models/AuditLog.php:97 — The static `log()` method relies on global helpers (`auth()->id()`, `request()->ip()`) without null safety guards, potentially causing errors in CLI contexts.
[ISSUE-02] P1 bug app/Models/Announcement.php:28 — The `scopePublished` closure uses `now()` inside the callback, causing it to be evaluated at query compilation time instead of execution time, leading to incorrect caching.
[ISSUE-03] P3 code-quality app/Models/AuditLog.php:85 — `getSubjectTypeAttribute` and `getSubjectIdAttribute` replicate logic; could use a single accessor or map.
[ISSUE-04] P3 maintainability app/Models/AttendanceLog.php:30 — The `fillable` array contains geographic coordinate fields (`latitude`, `longitude`) without casting to `decimal`, risking float precision loss in the database.

### module-003
[SRV-001] P2 data-consistency app/Services/ApprovalService.php:88 — Final approval in Level 2 HR branch lacks `approved_at` timestamp, breaking audit trail consistency.
[SRV-002] P2 data-consistency app/Services/ApprovalService.php:97 — Intermediate approval in Level 2 HR branch lacks `approved_at` timestamp, breaking audit trail consistency.
[SRV-003] P2 bug app/Services/ApprovalService.php:136 — Logic allows bypassing Manager Level 1; users with 'hr_admin' role can approve 'pending' requests directly to 'hr_approved'.
[SRV-004] P3 code-quality app/Services/ApprovalService.php:45 — Type-hinted generic Model lacks Interface contract, creating implicit reliance on specific database columns.
[SRV-005] P3 code-quality app/Services/ApprovalService.php:156 — Method `getApprovalHistory` is cut off and incomplete.

### module-004
[ISSUE-1] P3 performance AuditLogMiddleware.php:51 — Logging the entire filtered request body to the database can lead to massive row sizes and slow insert performance for large payloads.
[ISSUE-2] P2 security AuditLogMiddleware.php:26 — Failure to handle query parameters (GET data) in $request->except() allows potential logging of secrets passed via the query string.
[ISSUE-3] P3 code-quality AuditLogMiddleware.php:66 — Nested ternary operators for action mapping are difficult to read, maintain, and extend.
[ISSUE-4] P3 maintainability AuditLogMiddleware.php:17 — Hardcoded lists of sensitive fields and entity types are prone to drift and do not scale with model changes.
[ISSUE-5] P3 bug AuditLogMiddleware.php:26 — Relying on `in_array($request->method())` accepts case-sensitive checks, potentially bypassing logic if HTTP method casing is non-standard.

### module-005
[SEC-01] P2 security `ApprovePayrollRequest.php:12` — Authorization logic bypassed universally (`return true;`) disabling framework ACL layer.
[SEC-02] P1 security `Attendance/CheckInRequest.php:19` — `employee_id` validation allows enumerating employees across tenants (missing `company_id` scope on `exists` rule).
[SEC-03] P1 security `Attendance/CheckOutRequest.php:19` — `employee_id` validation allows enumerating employees across tenants (missing `company_id` scope on `exists` rule).
[BUG-01] P2 code-quality `Attendance/ApproveOvertimeRequest.php:15` — Property `$this->_company_id` is accessed without type safety or null check, risking runtime error if middleware fails to set it.
[SEC-04] P3 security `Auth/ChangePasswordRequest.php:12` — Incomplete file truncation leaves class definition open, potentially causing fatal syntax errors.

### module-006
[RES-01] P2 code-quality app/Http/Resources/AnnouncementResource.php:13 — Massive code duplication of identical date formatting logic across 25+ files violates DRY principle
[RES-02] P3 performance app/Http/Resources/AnnouncementResource.php:13 — Inefficient loop checking 17 hardcoded date keys for every model regardless of which fields actually exist
[RES-03] P2 bug app/Http/Resources/AnnouncementResource.php:16 — Use of `isset($data[$key])` bypasses JSON resource accessors/mutators, potentially incorrectly checking private properties against the public array data
[RES-04] P3 code-quality app/Http/Resources/DepartmentResource.php:13 — Lack of standardization: `DepartmentResource` manually maps fields instead of using parent logic, risking inconsistency if behavior changes

### module-007
[ISSUE-1] P1 code-quality database/migrations/0001_01_01_000000_create_users_table.php:23 — Missing database indexes on frequently queried columns (`email`, `name`) which impacts authentication performance
[ISSUE-2] P3 architecture database/migrations/0001_01_01_000000_create_users_table.php:12 — `Schema::hasTable` checks are redundant in standard Laravel migration workflows as migrations track state internally
[ISSUE-3] P2 bug database/migrations/2026_04_18_000002_create_penalty_rules_table.php:24 — File is truncated, missing `cascadeOnDelete()` closure or semicolon, causing syntax error and preventing migration execution
[ISSUE-4] P2 performance database/migrations/2026_04_18_000001_create_companies_table.php:19 — `settings` column defined as `json` without specifying index or engine requirements for optimal JSON querying performance

### module-008
[SEC-001] P0 security routes/migrate-web.php:13 — Default secret key `'myhr-migrate-2026'` is hardcoded as a fallback, exposing the application to unauthorized schema modifications if `MIGRATION_KEY` is missing.
[SEC-002] P1 security routes/migrate-web.php:17-18 — Simple comparison of a URL query parameter against an environment variable is vulnerable to timing attacks and lacks rate limiting or request signing.
[ARCH-001] P2 architecture routes/migrate-web.php:74-78 — Manually inserting records into the `migrations` table bypasses Laravel's state management, causing inconsistency between the actual schema and migration history.
[BUG-001] P1 bug routes/migrate-web.php:32-73 — Schema modifications executed within a route closure are not wrapped in a database transaction, risking partial schema updates and data corruption on failure.
[CODE-001] P3 code-quality routes/console.php:14-20 — Timezone `'Africa/Cairo'` and schedule times are hardcoded in multiple places, reducing flexibility for deployments in other regions.

### module-009
[ISSUE-1] P2 architecture resources/js/api/analytics.js — API path inconsistency (mixed `/analytics/...` and `/dashboard/...`) creates confusing semantic coupling
[ISSUE-2] P3 code-quality resources/js/api/analytics.js — `analyticsApi` object mixes unrelated domains (approvals, org-chart) violating single responsibility principle
[ISSUE-3] P1 performance resources/js/App.vue — Providing `toast` globally violates performance best practices for simple utilities; import `useToast` directly in components instead
[ISSUE-4] P2 code-quality resources/js/api/analytics.js — Duplicate export logic for `orgChartApi` could be consolidated with a base method for GET requests to reduce boilerplate

### module-010
[ISSUE-ID] P2 code-quality resources/views/emails/payroll/payslip-published.blade.php:18 — Syntax error: invalid array assignment syntax `['url' =` inside `@component` (likely missing `>`).

[ISSUE-ID] P3 security resources/views/emails/generic-notification.md:8 — Potential XSS vulnerability: `$data` values are output unescaped in Markdown via `{{ $value }}`.

### module-011
[TEST-001] P2 maintainability tests/Feature/AnnouncementControllerTest.php:24 — `setUp()` method creates excessive shared state (Company, Admin, Department, Employee, User) which leads to rigid tests and high maintenance overhead if schema changes
[TEST-002] P3 code-quality tests/Feature/AnnouncementControllerTest.php:173 — File terminates abruptly mid-comment block, indicating incomplete implementation for Update and Delete test coverage
[TEST-003] P3 maintainability tests/Feature/AnnouncementControllerTest.php:59-82 — Hardcoded `now()` relative times in assertions can cause flaky tests if execution crosses time boundaries during the check

### module-012
CONF-001 P1 security config/app.php:68 — Missing fallback for 'APP_KEY' causes runtime failure if environment variable is unset, breaking encryption/decryption.
CONF-002 P2 performance config/app.php:70 — Expensive string/array manipulation on 'APP_PREVIOUS_KEYS' executes on every config load regardless of necessity.
AUTH-001 P3 architecture config/auth.php:4 — Hardcoded import of App\Models\User creates a concrete dependency, reducing flexibility for modular authentication providers.

### module-013
[DEP-001] P1 security backup.sh:24 — `mysqldump` password exposed in command line via `--password`, visible in process list/shell history
[DEP-002] P1 reliability backup.sh:27 — `BACKUP_PASS` is required via `:?`, but `BACKUP_DB_NAME` and `BACKUP_DB_USER` silently default to potentially incorrect values
[DEP-003] P3 security build-deploy-package.sh:31 — Hardcoded `.env.production` path copied to staging; if missing, the script proceeds with potentially no environment config
[DEP-004] P2 performance build-deploy-package.sh:16 — rsync lacks `--delete` flag, causing accumulation of files in `$STAGING` from previous builds if directory persists
[DEP-005] P2 architecture build-deploy-package.sh:43 — Replicates logic from `bootstrap/app.php`/`public/index.php` manually, creating drift risk if Laravel version changes

### module-014
[DOCS-01] P1 security docs/API-REFERENCE.md — POST /api/attendance/manual-adjustment endpoint allows changing attendance records without specifying a source or audit trail field (like `admin_id` or `modified_by`) in the request schema, which could hinder forensic investigations.
[DOCS-02] P2 bug docs/API-REFERENCE.md — Manual adjustment endpoint request schema for `checkin_time` and `checkout_time` uses a time-only format ("HH:mm:ss") but expects to combine it with a date (`YYYY-MM-DD`), which is often ambiguous and error-prone for datetime parsing.
[DOCS-03] P2 performance docs/API-REFERENCE.md — GET /api/employees endpoint lists employee relations (department, shift) but does not indicate pagination limits or select constraints, risking performance issues on large datasets.
[DOCS-04] P3 code-quality docs/API-REFERENCE.md — Documentation is cut off at the end (POST /api/leave/request section), rendering the reference incomplete for the Leave module.

### module-015
[DOC-001] P2 [code-quality] docs-src/guide/payroll/custom-items.md — File terminates abruptly mid-sentence at "Configure:", indicating invalid markdown or incomplete content.
[DOC-002] P3 [ux] docs-src/guide/configuration.md — "Documentation coming soon" placeholder creates a dead link for users seeking configuration details.
[DOC-003] P3 [ux] docs-src/guide/hr-admin/attendance.md — "Documentation coming soon" placeholder for a core feature (Attendance).
[DOC-004] P3 [ux] docs-src/guide/hr-admin/departments.md — "Documentation coming soon" placeholder for core entity management.
[DOC-005] P3 [ux] docs-src/guide/hr-admin/announcements.md — "Documentation coming soon" placeholder for feature module.

### module-016
[SEC-01] [P1] [security] production-api-test.sh:31 — Hardcoded credentials `demo@myhr.app` and `demo123` are exposed in plaintext.
[CONF-01] [P2] [code-quality] production-api-test.sh:18 — Base URL is hardcoded to `http://localhost:8000`, preventing environment configuration.
[REL-01] [P2] [performance] production-api-test.sh:36 — Python subprocess is invoked for JSON parsing without checking if python3 is installed or using a lighter tool like jq.
[BUG-01] [P2] [bug] production-api-test.sh:77 — Logic error in checkin validation uses incorrect OR precedence (`||`), causing the test to pass incorrectly when the request fails with non-200/201 status codes.

### module-017
[ISSUE-1] P0 security handover/CODEX-AUTHORITY-MATRIX.md:1 — Unclear authority definitions for "Super Admin" vs "HR Admin" in role summary may lead to privilege escalation
[ISSUE-2] P1 bug handover/CODEX-CURRENT-STATE.md:1 — Backend verification is blocked due to "Dependency Environment" failure halting testing
[ISSUE-3] P1 code-quality handover/CODEX-CURRENT-STATE.md:1 — Incomplete documentation sentence trailing off at "seeded " in code completion list
[ISSUE-4] P2 bug handover/CODEX-AUTHORITY-MATRIX.md:1 — Foreign key validation logic mentioned as "Key Phase 2 Decision" relies on unverified backend runtime proof
[ISSUE-5] P3 architecture handover/CODEX-CURRENT-STATE.md:1 — High cross-reference complexity (13 files) increases risk of documentation drift and sync errors

### module-018
[LANG-001] P3 code-quality lang/en/messages.php:13 — Missing inline comments (e.g., `// Statuses`, `// Actions`) present in `lang/ar/messages.php`, reducing maintainability and consistency.

### module-019
[P0] [security] .htaccess:8 — Unconditional HTTPS redirection causes infinite redirect loops on development environments lacking SSL
[P1] [security] .htaccess:48 — Content-Security-Policy allows `'unsafe-inline'` and `'unsafe-eval'`, significantly weakening XSS defenses
[P3] [performance] .htaccess:57 — Missing ExpiresByType for `image/jpeg` and `image/webp` leads to suboptimal caching for common formats
[P3] [code-quality] docs/css/theme-default.print.css:1 — Inlines third-party normalize.css library instead of managing via a package manager or import
[P3] [code-quality] docs/css/theme-default.print.css:139 — Code block uses `word-break: break-all` which harms readability of long identifiers or URLs

### module-020
[ISSUE-001] P2 bug api.spec.ts:3-4 — Default credentials (`admin@andersen.eg`, `NewP@ssw0rd456`) are hardcoded, likely invalid and causing persistent 422 login failures
[ISSUE-002] P1 bug api.spec.ts:21 — Missing null/await safety check: `csrfToken` retrieval may fail silently if meta tag is missing, sending empty header causing 422
[ISSUE-003] P3 security api.spec.ts:3-4 — Hardcoded fallback credentials expose a potential valid (or predictable) admin email address in source code
[ISSUE-004] P3 code-quality api.spec.ts:24 — `X-XSRF-TOKEN` header contains fallback empty string `''`, potentially violating strict server-side CSRF validation logic
[ISSUE-005] P2 bug api.spec.ts:19 — Test architecture mismatch: Login test uses `page` context for API call instead of `request` context, risking cookie pollution and state leakage

### module-021
[SS-01] P1 [bug] results.json:6 — The `landing` page (`/`) has `"ok": false` and `"redirected": true`, indicating routing logic failure or middleware misconfiguration for unauthenticated users.
[SS-02] P1 [bug] results.json:12 — The `login` page (`/login`) has `"ok": false` and `"redirected": true`, preventing users from accessing authentication and causing a redirect loop.
[SS-03] P2 [code-quality] results.json:6,12 — `hasSidebar` is set to `true` for `landing` and `login` pages, which is likely incorrect for public/auth routes lacking navigation.
[SS-04] P2 [security] results.json:6,12 — Both failed entries (`landing`, `login`) return the exact same `sizeBytes` (235281) and content as `dashboard`, suggesting insecure fallback or unauthorized content exposure.

### module-022
[P2] security tools/php.ini:2-4 — Debug mode enabled with `display_errors=On` and `error_reporting=E_ALL` risks sensitive data leakage in production.
[P2] architecture tools/php.ini:12-14 — Absolute Windows paths hardcoded for `extension_dir` and SSL certs, breaking portability and locking configuration to a specific machine.
[P3] performance tools/php.ini:7 — High `memory_limit` (1024M) allows resource exhaustion attacks if this config is loaded in a web context.

### module-023

[P0] SECURITY .env:5 — APP_DEBUG=true is enabled in production configuration, exposing stack traces and sensitive environment variables to end users.
[P1] SECURITY .env:30 — SENTRY_LARAVEL_DSN contains a placeholder URL (sentry.sabbk.com), causing error tracking to fail in production.
[P1] SECURITY .env:45 — DB_USERNAME is set to root, violating the principle of least privilege; .env.example correctly advises using a dedicated user (hr_app).
[P1] SECURITY .env:47 — DB_PASSWORD is empty, allowing database access without authentication.
[P2] CODE-QUALITY .env:7 — APP_URL is set to http://localhost:8000 in a production configuration file, potentially breaking asset generation or redirect logic.


## Execution Plan
```json
{
  "id": "myhr-audit-2026-06-01",
  "mode": "apply",
  "total_batches": 21,
  "batches": [
    {
      "id": "B001",
      "title": "Fix Routes Security Vulnerabilities",
      "severity": "P0",
      "files": [
        "routes/migrate-web.php"
      ],
      "acceptance_criteria": [
        "Remove hardcoded secret key fallback",
        "Implement timing-safe comparison for migration token",
        "Wrap schema modifications in database transaction"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B002",
      "title": "Secure App Configuration",
      "severity": "P1",
      "files": [
        "config/app.php"
      ],
      "acceptance_criteria": [
        "Add fallback for 'APP_KEY' to prevent runtime failure",
        "Optimize 'APP_PREVIOUS_KEYS' loading to avoid unnecessary overhead"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B003",
      "title": "Fix AiInsightsController Syntax and Fatal Errors",
      "severity": "P2",
      "files": [
        "module-001/AiInsightsController.php"
      ],
      "acceptance_criteria": [
        "Define missing method `calculateAnomalyScore`",
        "Fix file truncation/syntax error at end of file"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B004",
      "title": "Fix ApprovalService Truncation and Logic",
      "severity": "P2",
      "files": [
        "module-003/app/Services/ApprovalService.php"
      ],
      "acceptance_criteria": [
        "Complete truncated method `getApprovalHistory`",
        "Fix Manager Level 1 bypass logic for 'hr_admin' role"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B005",
      "title": "Fix Database Migration Truncations and Indexes",
      "severity": "P1",
      "files": [
        "module-007/database/migrations/0001_01_01_000000_create_users_table.php",
        "module-007/database/migrations/2026_04_18_000002_create_penalty_rules_table.php"
      ],
      "acceptance_criteria": [
        "Add indexes to `email` and `name` columns in users table",
        "Fix truncation/syntax error in penalty rules migration"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B006",
      "title": "Secure Backup Credentials",
      "severity": "P1",
      "files": [
        "module-013/backup.sh"
      ],
      "acceptance_criteria": [
        "Remove `--password` from command line args",
        "Fix silent defaults for DB_NAME and DB_USER variables"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B007",
      "title": "Fix Attendance Validation Security",
      "severity": "P1",
      "files": [
        "module-005/Attendance/CheckInRequest.php",
        "module-005/Attendance/CheckOutRequest.php"
      ],
      "acceptance_criteria": [
        "Add `company_id` scope to `employee_id` validation rules in both files"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B008",
      "title": "Fix N+1 Performance in AiInsightsController",
      "severity": "P1",
      "files": [
        "module-001/AiInsightsController.php"
      ],
      "acceptance_criteria": [
        "Refactor `map` closure to use eager loading or batch retrieval",
        "Ensure no queries are executed inside loops"
      ],
      "depends_on": [
        "B003"
      ],
      "risk": "medium"
    },
    {
      "id": "B009",
      "title": "Fix Announcement Scope Caching",
      "severity": "P1",
      "files": [
        "module-002/app/Models/Announcement.php"
      ],
      "acceptance_criteria": [
        "Refactor `scopePublished` to evaluate `now()` at execution time"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B010",
      "title": "Fix Audit Middleware Security Issues",
      "severity": "P2",
      "files": [
        "module-004/AuditLogMiddleware.php"
      ],
      "acceptance_criteria": [
        "Filter GET parameters to prevent logging secrets",
        "Fix case-sensitive HTTP method check"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B011",
      "title": "Fix Payroll Request Authorization",
      "severity": "P2",
      "files": [
        "module-005/ApprovePayrollRequest.php"
      ],
      "acceptance_criteria": [
        "Replace `return true;` with actual authorization logic"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B012",
      "title": "Fix ApprovalService Audit Trail Consistency",
      "severity": "P2",
      "files": [
        "module-003/app/Services/ApprovalService.php"
      ],
      "acceptance_criteria": [
        "Ensure `approved_at` is set for Level 2 HR final and intermediate approvals"
      ],
      "depends_on": [
        "B004"
      ],
      "risk": "medium"
    },
    {
      "id": "B013",
      "title": "Fix Routes Architecture and Console Config",
      "severity": "P2",
      "files": [
        "routes/migrate-web.php",
        "routes/console.php"
      ],
      "acceptance_criteria": [
        "Remove manual migrations table insert in migrate-web.php",
        "Refactor hardcoded timezone/schedules in console.php to config"
      ],
      "depends_on": [
        "B001"
      ],
      "risk": "medium"
    },
    {
      "id": "B014",
      "title": "Refactor AiInsightsController Constants",
      "severity": "P2",
      "files": [
        "module-001/AiInsightsController.php"
      ],
      "acceptance_criteria": [
        "Replace magic numbers with configuration constants"
      ],
      "depends_on": [
        "B003"
      ],
      "risk": "low"
    },
    {
      "id": "B015",
      "title": "Fix Email Template Syntax and Security",
      "severity": "P2",
      "files": [
        "module-010/resources/views/emails/payroll/payslip-published.blade.php",
        "module-010/resources/views/emails/generic-notification.md"
      ],
      "acceptance_criteria": [
        "Fix array assignment syntax in payslip blade",
        "Escape `$data` values in markdown to prevent XSS"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B016",
      "title": "Fix Attendance Request Type Safety",
      "severity": "P2",
      "files": [
        "module-005/Attendance/ApproveOvertimeRequest.php",
        "module-005/Auth/ChangePasswordRequest.php"
      ],
      "acceptance_criteria": [
        "Add null check for `$this->_company_id`",
        "Fix file truncation in ChangePasswordRequest"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B017",
      "title": "Fix AnnouncementResource Logic",
      "severity": "P2",
      "files": [
        "module-006/app/Http/Resources/AnnouncementResource.php"
      ],
      "acceptance_criteria": [
        "Fix `isset` usage to respect accessors/mutators",
        "Remove hardcoded date key checks"
      ],
      "depends_on": [],
      "risk": "medium"
    },
    {
      "id": "B018",
      "title": "Secure API Test Script",
      "severity": "P1",
      "files": [
        "module-016/production-api-test.sh"
      ],
      "acceptance_criteria": [
        "Remove hardcoded plaintext credentials",
        "Make base URL configurable via environment"
      ],
      "depends_on": [],
      "risk": "high"
    },
    {
      "id": "B019",
      "title": "Fix Deployment Script Logic",
      "severity": "P2",
      "files": [
        "module-013/build-deploy-package.sh"
      ],
      "acceptance_criteria": [
        "Add `--delete` flag to rsync command",
        "Remove hardcoded `.env.production` path or add check"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B020",
      "title": "Fix Code Quality in Models and Middleware",
      "severity": "P3",
      "files": [
        "module-002/app/Models/AuditLog.php",
        "module-004/AuditLogMiddleware.php"
      ],
      "acceptance_criteria": [
        "Add null safety to AuditLog static helpers",
        "Simplify nested ternary operators in middleware"
      ],
      "depends_on": [],
      "risk": "low"
    },
    {
      "id": "B021",
      "title": "Documentation and Truncation Fixes",
      "severity": "P2",
      "files": [
        "module-011/tests/Feature/AnnouncementControllerTest.php",
        "module-015/docs-src/guide/payroll/custom-items.md"
      ],
      "acceptance_criteria": [
        "Fix file truncation in test file",
        "Fix file truncation in markdown guide"
      ],
      "depends_on": [],
      "risk": "low"
    }
  ]
}
```