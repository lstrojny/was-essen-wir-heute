# Auth

The app is multi-user: each **family member** has their own account and
logs in separately. User identity is what attaches to ratings (see
`01_recipes.md`) and to the "active language" in `06_i18n.md`.

## Accounts

A **user** record holds:

- `id` — surrogate key.
- `display_name` — shown next to ratings and in the UI. Free-text.
- `email` — used for login.
- `password_hash` — argon2id (see *Password hashing*).
- `role` — `admin` or `user`.
- `language` — `de` or `en`. The user's active UI/content language
  (see `06_i18n.md`).
- `created_at`, `updated_at` — timestamps.

A user always has exactly one role. Admins can manage other users
(create, change role, reset password). All authenticated users —
including admins — can use every recipe / rating / import feature.

## First-run setup

A fresh container has no users. On the first request to any route, the
app detects an empty `users` table and routes the user to a **first-run
setup** page that accepts email, display name, password, and language.
Submitting it creates the first user with role `admin` and logs them
in.

Until the first user exists, no other route renders content — every
request redirects to the setup page.

## Account creation after first-run

Once at least one user exists, **registration is admin-only**.
Self-service signup is not exposed. An admin uses a "Users" surface to
create accounts for other family members, choosing their initial
password (which the family member can change after first login).

This keeps the app closed to the home network's residents and avoids
the need for email-based verification in v1.

## Password hashing

- **argon2id** with parameters appropriate for an interactive server
  (memory cost, time cost, parallelism pinned at implementation time).
- The hash includes its parameters so they can be tuned later without
  invalidating existing passwords.
- Plain passwords are never logged or persisted.

## Minimum password policy

- Length ≥ 10 characters.
- No other complexity rules; length and uniqueness do more than
  composition rules.
- The app rejects passwords known from a small bundled list of common
  passwords (deferable; flag as open).

## Sessions

Sessions are server-side and stored in SQLite.

A `sessions` table holds:

- `id` — the **hash** of the session token, not the token itself. Token
  is generated as 256 bits of randomness, base64-url-encoded.
- `user_id` — FK to `users`.
- `expires_at` — absolute expiry timestamp.
- `last_used_at` — touched on every authenticated request.
- `created_at`.
- `user_agent` — captured for a future "active sessions" UI.

Behaviour:

- The session token is delivered to the browser in an **HTTP-only,
  Secure, SameSite=Lax** cookie. The cookie name is fixed; the value is
  the unhashed token.
- Default lifetime: **30 days**, **sliding**. Each authenticated request
  bumps `last_used_at` and extends `expires_at` if more than a day has
  passed since the last extension (avoiding a write on every request).
- Hard cap on absolute lifetime: **90 days**. After that the session is
  required to re-authenticate, even with use.
- Logout deletes the session row and clears the cookie.
- Changing a password invalidates all of that user's sessions except
  the current one.

Storing the hash (rather than the raw token) means a database leak does
not yield usable session tokens.

## Login flow

- Login page accepts email + password.
- Failed attempts are rate-limited: after **5 failed attempts in 15
  minutes** for a given email (regardless of IP), further attempts
  are rejected for **15 minutes** with a generic "too many attempts"
  message. Counters live in a small in-memory store; their persistence
  across restarts is not required.
- The error message for an unknown email and a wrong password is
  intentionally identical ("invalid email or password") to avoid
  account enumeration.

## Logout

- Logout is a Server Action that deletes the current session row and
  clears the cookie.

## Authorization

- **All routes require an authenticated session** except the login page
  and the first-run setup page (when applicable).
- Admin-only routes: user-management surface. Enforced both in the
  router layer (route guard) and at the operation layer (server action
  checks role).
- All other features are available to any authenticated user.
- The recipe model has no per-recipe owner in v1; any authenticated
  user can create, edit, and delete any recipe. See open questions.

## CSRF

Mutations use Next.js **Server Actions** wherever possible. Server
Actions are protected from cross-site form submission by the
framework's same-origin checks (Origin vs. Host). Any traditional API
route that mutates state would need an explicit CSRF mechanism; v1
avoids that by routing mutations through server actions.

## Settings managed by the user

A logged-in user can:

- Change their own password.
- Change their own display name.
- Change their own active language.

A logged-in user **cannot** delete their own account in v1; that is an
admin action.

## Admin-only settings

An admin can:

- Create new user accounts.
- Reset another user's password (sets a temporary password the family
  member is shown once and is encouraged to change).
- Change another user's role.
- Delete a user account. **Ratings attached to a deleted user are
  removed**; recipes themselves are not affected. (Alternative: leave
  ratings under a "deleted user" stub — flagged in open questions.)

## Open questions

- **Per-recipe ownership**. Whether each recipe records its creator and
  whether ownership affects edit/delete permissions. v1 says no
  ownership; revisit if family conflict suggests otherwise.
- **Common-password bundle**. Pulling in a small list (e.g. top 1k) for
  rejection is cheap and useful; defer until a password-policy decision
  is made.
- **Rating attribution on deleted users**. Remove vs. keep under a
  tombstoned identity. Default above is *remove*; revisit before delete
  is implemented.
- **Email and password recovery**. v1 has neither. When introduced,
  needs SMTP config and a verification-token flow.
- **2FA**. Out of scope for v1 on a home-network deployment.
