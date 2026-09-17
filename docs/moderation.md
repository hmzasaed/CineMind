# Moderation

Report triage and review status overrides, admin-only.

## Report lifecycle

`public.review_reports` (00001): one row per `(review_id, reporter_id)` —
a reporter can report a given review only once (unique constraint, `23505` on
a duplicate). `reason in ('spam','harassment','incorrect','spoilers','other')`,
`status` (`public.report_status` enum) starts at `open` and transitions to
`resolved` or `dismissed` — **only an admin can make that transition**; the
reporter who filed it cannot, and there is no "delete a report" path (reports
accumulate as a permanent record, which is why `report_count` on `reviews` is
a monotonically-increasing trigger counter with no decrement case).

## Review status state machine

`reviews.status`: `published → hidden → published` is owner-reversible (a
user can hide and later re-publish their own review via `PATCH
/reviews/:id`). `→ deleted` is **admin-only**, via `PATCH
/admin/reviews/:id/status`. This isn't an arbitrary product choice — it's
forced by a genuine RLS subtlety documented inline at
`supabase/migrations/00001_initial_schema.sql` above the `reviews_update_owner_or_admin`
policy: Postgres ANDs every `WITH CHECK` clause that matches an `UPDATE`, so a
separate "owner" policy and a separate "admin" policy can't coexist for the
same operation — one would always block the other. The fix is a single policy
covering both: `using (owner or admin) with check ((owner and status in
('published','hidden')) or admin)`. Read that comment before touching either
policy.

## Backend

`backend/src/social/moderation-store.ts` (`ModerationStore` interface) and
`backend/src/routes/moderation.ts`, gated the same way `routes/jobs.ts` gates
admin ingestion endpoints: `preHandler: [requireAuth, requireAdmin]`. Admin
status is resolved from `public.profiles.role` via `ProfileRoleStore` — never
trusted from a JWT claim (see `docs/security.md`'s Auth section).

| Endpoint | Notes |
|---|---|
| `GET /admin/review-reports` | `?status=open\|resolved\|dismissed&page&pageSize`. |
| `PATCH /admin/review-reports/:id` | Body `{ status: "resolved" \| "dismissed" }`. |
| `PATCH /admin/reviews/:id/status` | Body `{ status: "published" \| "hidden" \| "deleted" }` — the only path that may set `deleted`. |

No admin frontend page exists yet (deliberately out of scope for this pass —
the backend surface, tests, and this doc are complete; a UI is a follow-up).
Admins can act via direct API calls until then.

## Tests

`supabase/tests/database/cinemind_tests.sql` has direct pgTAP coverage:
a reporter cannot resolve their own report (`42501`), an admin can, a
duplicate report from the same reporter hits the unique constraint
(`23505`), and anon cannot like or report at all. `backend/src/app.moderation.test.ts`
covers the same rules against the in-memory store (non-admin → 403 on all
three endpoints, admin can resolve reports and force-set `deleted`).
