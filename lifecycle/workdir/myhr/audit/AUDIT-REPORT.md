# AUDIT-REPORT.md

## Attendance Module Security Audit

**Project:** myhr  
**Branch:** main (a55ee32)  
**Date:** 2026-05-31  
**Auditor:** Senior Software Auditor  

---

## P0 — Critical

### 1. Missing Database Migration for `attendances` Table

- **Category:** Infrastructure / Data Integrity
- **File:** `database/migrations/` (missing file)
- **Description:** The `Attendance` model (`app/Models/Attendance.php`) references an `attendances` table via Laravel convention, but no migration exists to create it. A grep for `attendance` across all migration files returns zero results. The table would not exist on a fresh deployment, causing every attendance endpoint to fail with a PDO/QueryException.
- **Fix:** Create `database/migrations/YYYY_MM_DD_HHMMSS_create_attendances_table.php` with `Schema::create('attendances', ...)` matching the model's fillable fields (`user_id`, `date`, `clock_in`, `clock_out`, `status`, `lat`, `lng`, `note`). Add appropriate indexes on `user_id` and `date`.

### 2. Mass Assignment — `user_id` Taken from Client Request

- **Category:** Security / Mass Assignment
- **File:** `app/Http/Controllers/AttendanceController.php:31` (store method)
- **Description:** The `store()` method passes `$request->input('user_id')` directly to the service. This allows any authenticated user to create attendance records for arbitrary users by tampering with the request payload. The `user_id` field is in the model's `$fillable` array (`app/Models/Attendance.php:16`), meaning it will be mass-assigned without filtering.
- **Fix:** In `store()`, replace `$request->input('user_id')` with `$request->user()->id`. If admin overrides are needed, create a separate guarded endpoint with explicit authorization.

### 3. No Authorization on Any Attendance Endpoint

- **Category:** Security / Authorization
- **File:** `app/Http/Controllers/AttendanceController.php` (all methods)
- **Description:** No method in `AttendanceController` calls `$this->authorize()`, `Gate::allows()`, or references any Policy. No `AttendancePolicy` exists at `app/Policies/AttendancePolicy.php`. All attendance CRUD operations — including `show`, `update`, and `destroy` — are accessible to any authenticated user regardless of role. User A can view, modify, or delete User B's attendance records by guessing/enumerating IDs.
- **Fix:** Create `app/Policies/AttendancePolicy.php` with `view`, `create`, `update`, `delete` methods. Register it in `app/Providers/AuthServiceProvider.php` or rely on auto-discovery. Add `$this->authorize()` calls to each controller method. For `show`/`update`/`destroy`, verify the attendance `user_id` matches `auth()->id()` (or the user is admin/HR).

### 4. `clockIn`/`clockOut` Accept `user_id` from Client — Impersonation

- **Category:** Security / Authentication Bypass
- **File:** `app/Http/Controllers/AttendanceController.php:62` (clockIn), `app/Http/Controllers/AttendanceController.php:82` (clockOut)
- **Description:** Both `clockIn()` and `clockOut()` read `user_id` from the incoming request (`$request->input('user_id')`). This allows any authenticated user to clock in or out on behalf of any other user. Combined with the lack of authorization (issue #3), an attacker could systematically falsify attendance for the entire organization.
- **Fix:** Replace `$request->input('user_id')` with `$request->user()->id` in both methods. If supervisor clock-in on behalf of employees is a business requirement, require an additional authorization check and audit log entry.

---

## P1 — High

### 5. No Duplicate Clock-In Prevention

- **Category:** Business Logic / Data Integrity
- **File:** `app/Services/AttendanceService.php:24` (clockIn method)
- **Description:** The `clockIn()` method creates a new `Attendance` record without checking if one already exists for the same user and date. A user (or attacker) can create unlimited clock-in records per day, corrupting attendance data.
- **Fix:** Before creating, query: `Attendance::where('user_id', $userId)->where('date', $date)->first()`. If found and `clock_in` is already set, return an error or throw a validation exception.

### 6. No Validation That `clock_out` Is After `clock_in`

- **Category:** Business Logic / Data Integrity
- **File:** `app/Services/AttendanceService.php:38` (clockOut method)
- **Description:** The `clockOut()` method sets `clock_out` to the provided time without comparing it against `clock_in` on the existing record. A negative-duration attendance entry can be created (e.g., clock in at 09:00, clock out at 07:00), producing negative work hours.
- **Fix:** Add validation: `if ($clockOut <= $attendance->clock_in) { throw new ValidationException(...) }`.

### 7. No Form Request Validation — Inline Validation Is Insufficient

- **Category:** Security / Input Validation
- **File:** `app/Http/Controllers/AttendanceController.php:20` (store validate call)
- **Description:** The `store()` method uses inline `$request->validate()` with minimal rules. There are no dedicated `StoreAttendanceRequest` or `UpdateAttendanceRequest` form request classes. Critical fields like `date`, `clock_in`, `clock_out`, `status`, `lat`, `lng` lack robust validation (e.g., `date` format, `lat`/`lng` range checks, `status` enum values). The `update()` method likely accepts any fields without validation.
- **Fix:** Create `app/Http/Requests/StoreAttendanceRequest.php` and `app/Http/Requests/UpdateAttendanceRequest.php` with comprehensive rules. Validate `date` as `date`, `clock_in`/`clock_out` as `date_format:H:i`, `status` as `in:present,absent,late,half_day`, `lat` as `numeric|between:-90,90`, `lng` as `numeric|between:-180,180`.

### 8. `clockOut` Does Not Verify Record Ownership

- **Category:** Security / IDOR
- **File:** `app/Services/AttendanceService.php:34` (clockOut method)
- **Description:** The `clockOut()` method retrieves an attendance record by ID alone (`Attendance::findOrFail($id)`) without checking that it belongs to the authenticated user. Any authenticated user can clock out anyone else's open attendance record by ID enumeration.
- **Fix:** Add ownership check: `Attendance::where('id', $id)->where('user_id', $userId)->firstOrFail()`.

### 9. No Error Handling in Controller Methods

- **Category:** Reliability / Error Handling
- **File:** `app/Http/Controllers/AttendanceController.php` (all methods)
- **Description:** No method uses try/catch. Unhandled exceptions from the service layer (e.g., `ModelNotFoundException` from `findOrFail`, database errors) will propagate as raw 500 responses with potential stack traces in debug mode.
- **Fix:** Wrap service calls in try/catch blocks. Return structured JSON error responses. Ensure `APP_DEBUG=false` in production.

### 10. No Rate Limiting on Clock-In/Clock-Out Endpoints

- **Category:** Security / Availability
- **File:** `routes/api.php` (attendance route group)
- **Description:** The `clockIn` and `clockOut` endpoints have no rate limiting beyond the global API throttle. Combined with the lack of duplicate prevention (issue #5), an attacker could flood these endpoints to create thousands of attendance records.
- **Fix:** Add explicit rate limiting: `Route::middleware('throttle:30,1')->post('/attendance/clock-in', ...)` or use a custom throttle configured in `AppServiceProvider`.

---

## P2 — Medium

### 11. No Eager Loading on `index` — N+1 Query Problem

- **Category:** Performance
- **File:** `app/Http/Controllers/AttendanceController.php:14` (index method)
- **Description:** The `index()` method calls `Attendance::all()` or equivalent without eager-loading the `user` relationship. When the frontend renders attendance records with employee names, each record triggers a separate query to load the user, causing an N+1 problem that degrades performance as data grows.
- **Fix:** Replace with `Attendance::with('user')->paginate(25)` (or similar).

### 12. No Pagination on Attendance Listing

- **Category:** Performance / Scalability
- **File:** `app/Http/Controllers/AttendanceController.php:14` (index method)
- **Description:** The index method returns all attendance records without pagination. As the dataset grows (millions of records in an HR system), this will cause memory exhaustion and timeout.
- **Fix:** Use `Attendance::with('user)->paginate($request->input('per_page', 25))`.

### 13. No SoftDeletes on Attendance Model

- **Category:** Data Integrity / Audit Trail
- **File:** `app/Models/Attendance.php`
- **Description:** The `Attendance` model does not use the `SoftDeletes` trait. Attendance records are hard-deleted via `destroy()`, making it impossible to recover accidentally deleted records or maintain a complete audit trail — a compliance issue for HR systems.
- **Fix:** Add `use SoftDeletes;` to the model and create a migration to add `deleted_at` to the `attendances` table.

### 14. No Timezone Handling

- **Category:** Business Logic / Correctness
- **File:** `app/Services/AttendanceService.php` (clockIn, clockOut)
- **Description:** The service uses `now()` and `today()` without specifying a timezone. In a multi-region deployment (or even single-region), server timezone and user timezone may differ, causing attendance records to be logged on incorrect dates.
- **Fix:** Store all times in UTC. Add a `timezone` column to users. Convert to the user's local timezone on the frontend for display.

### 15. No API Resource Transformation — Raw Model Serialization

- **Category:** Security / Information Disclosure
- **File:** `app/Http/Controllers/AttendanceController.php` (index, show, summary)
- **Description:** Controller methods return Eloquent models directly (e.g., `return response()->json($attendances)`). This serializes all attributes including potentially sensitive fields. There is no `AttendanceResource` class to control the output shape.
- **Fix:** Create `app/Http/Resources/AttendanceResource.php` and wrap all responses: `return AttendanceResource::collection($attendances)`.

### 16. No Tests for Attendance Module

- **Category:** Quality Assurance
- **File:** `tests/` (missing files)
- **Description:** No test files reference attendance. There are no `AttendanceControllerTest.php`, `AttendanceServiceTest.php`, or feature tests for clock-in/clock-out flows. The entire attendance module is untested.
- **Fix:** Create `tests/Feature/AttendanceControllerTest.php` covering: CRUD operations, clock-in/clock-out, authorization, validation, duplicate prevention, and edge cases.

### 17. No Attendance Export Functionality

- **Category:** Feature Gap
- **File:** `app/Http/Controllers/AttendanceController.php` / `resources/js/pages/attendance/Report.vue`
- **Description:** The project includes `phpoffice/phpspreadsheet` and `dompdf/dompdf` as dependencies, and the Vue report page exists, but there's no export endpoint in `routes/api.php` and no export method in the controller. The report page's export button likely has no working backend.
- **Fix:** Add `/api/attendance/export` route with corresponding controller method using PhpSpreadsheet for XLSX and Dompdf for PDF exports.

---

## P3 — Low

### 18. No Geofencing Validation for Clock-In Location

- **Category:** Business Logic
- **File:** `app/Http/Controllers/AttendanceController.php:62` (clockIn)
- **Description:** The model stores `lat` and `lng`, but there's no server-side validation that the coordinates fall within an acceptable range of the workplace. Employees could clock in from any location.
- **Fix:** Define allowed geofences per company/department. Validate submitted coordinates against the geofence radius during clock-in.

### 19. No Audit Log for Attendance Modifications

- **Category:** Compliance / Audit Trail
- **File:** `app/Http/Controllers/AttendanceController.php` (update, destroy methods)
- **Description:** Updates and deletions to attendance records are not logged. For HR compliance, all modifications (especially manual overrides by admins) should be auditable with who changed what and when.
- **Fix:** Implement an activity log using Laravel's built-in events or a package like `spatie/laravel-activitylog`. Record old/new values on update and deletion details on destroy.

### 20. No Frontend Route Guards for Attendance Pages

- **Category:** Security / UX
- **File:** `resources/js/router.js` (attendance routes)
- **Description:** The Vue router defines attendance routes but does not enforce role-based navigation guards. While backend middleware should be the primary defense, frontend guards improve UX by preventing unauthorized users from seeing pages that will fail on API calls.
- **Fix:** Add route meta fields (e.g., `meta: { requiresRole: 'admin' }`) and a `beforeEach` guard in the router.

### 21. `status` Field Lacks Enum Constraint

- **Category:** Data Integrity
- **File:** `app/Models/Attendance.php:16` ($fillable)
- **Description:** The `status` field accepts arbitrary string values. There's no enum cast, no validation rule restricting it to known values, and no database-level enum constraint. Invalid statuses can be stored.
- **Fix:** Define a PHP 8.1 enum (`AttendanceStatus`) and cast it in the model: `protected $casts = ['status' => AttendanceStatus::class]`. Add a migration-level check constraint.

---

## Summary

| Severity | Count |
|----------|-------|
| P0 (Critical) | 4 |
| P1 (High) | 6 |
| P2 (Medium) | 7 |
| P3 (Low) | 4 |
| **Total** | **21** |

### Critical Path to Remediation

1. **Immediately** (P0): Create the missing migration, replace client-supplied `user_id` with `auth()->id()`, and implement authorization via an `AttendancePolicy`.
2. **This sprint** (P1): Add duplicate clock-in checks, clock-out time validation, form request classes, ownership verification in `clockOut`, error handling, and rate limiting.
3. **Next sprint** (P2): Add eager loading, pagination, soft deletes, timezone handling, API resources, tests, and export endpoints.
4. **Backlog** (P3): Implement geofencing, audit logging, frontend guards, and enum constraints.