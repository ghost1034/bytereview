# 03 — Authentication & User Profiles

**Goal:** A production-grade authentication layer built behind a swappable `AuthAdapter` interface. The V1 adapter persists accounts through the repository layer (step 02) for use in Build mode and local development; the same interface binds to OAuth2, SAML SSO, and passwordless magic-link providers (Auth0 / Clerk / WorkOS / your own service) in production. Plus a current-user context, profile page, and presence indicator.

---

## Prompt (paste into Google AI Studio Build)

Add the authentication layer and user-profile UI to Tasklytic. Do not change the design system from step 01 or the data model from step 02 — only **add** what's described here.

### Where things go
- New feature folder: `src/features/auth/`
- New store: `src/stores/auth.ts` (holds `currentUserId` and a `setCurrentUser(id)` action; persists session via the repository adapter under `tasklytic:v1:session`).
- New pages: `src/features/auth/SignInPage.tsx`, `src/features/auth/SignUpPage.tsx`, `src/features/auth/ForgotPasswordPage.tsx`, `src/features/user/ProfilePage.tsx`.
- New routes: `/signin`, `/signup`, `/forgot-password`, `/reset-password`, `/me` (protected).
- New adapter directory: `src/lib/auth/` — `types.ts` (interface), `localAdapter.ts` (V1 in-app implementation), `index.ts` (`getAuthAdapter()` accessor).

### The `AuthAdapter` interface

```ts
// src/lib/auth/types.ts
export interface AuthAdapter {
  signUp(input: { name: string; email: string; password: string }): Promise<{ userId: ID }>;
  signIn(input: { email: string; password: string }): Promise<{ userId: ID }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(input: { token: string; newPassword: string }): Promise<void>;
  startTrial(): Promise<{ userId: ID }>;                  // creates an ephemeral trial user (see step 30)
  exchangeOAuthCode(provider: 'google' | 'microsoft' | 'github', code: string): Promise<{ userId: ID }>;
  getSession(): Promise<{ userId: ID } | null>;
  refreshSession(): Promise<void>;
  readonly capabilities: {
    passwordRecovery: boolean;
    oauthProviders: Array<'google' | 'microsoft' | 'github'>;
    samlSso: boolean;
    passwordless: boolean;
    mfa: boolean;
  };
}
```

### V1 adapter (`src/lib/auth/localAdapter.ts`)

- Persists credentials through the repository adapter (step 02) under `tasklytic:v1:credentials` as `{ [email]: { userId, passwordHash, createdAt, lastSignInAt } }`. Storing credentials through the repository (rather than touching `localStorage` directly) keeps the seam consistent.
- Hashes passwords using PBKDF2 with `crypto.subtle.deriveBits` (100,000 iterations, SHA-256, 16-byte random salt per user). This is real cryptography — appropriate for V1 development and a defensible local baseline — though in production every customer instance binds to a managed auth provider (see swap-out below).
- Verifies passwords with constant-time comparison.
- `requestPasswordReset` generates a signed token, stores it with a 30-minute expiry, and **emits the reset email through the configured `EmailAdapter`** (step 05/21). In V1, the email is surfaced in-app via Settings → Pending Emails so the user can complete the flow without an email server. `capabilities.passwordRecovery` is `true`.
- `oauthProviders` is `[]` in V1; populated when the production adapter is bound.
- `startTrial()` creates an anonymous user with role `'trial'` scoped to the `tasklytic:trial:v1:*` namespace (see step 30 for the trial-mode tenant). This is a real product surface for prospects evaluating the platform from the marketing site.

### Production swap-out

`src/lib/auth/managedAdapter.ts` (added at production deployment time, not in this kit) implements the same interface against a managed auth provider (Auth0 / Clerk / WorkOS) and enables OAuth providers, SAML SSO, passwordless magic links, and MFA. Switching is one env var: `VITE_AUTH_ADAPTER=managed` plus the provider's public client config. No feature code changes — every call site only knows the `AuthAdapter` interface.

### Auth UX flows

- **Sign up**: name, email, password (8+ chars, must include a number, must include a non-alphanumeric character — these are real password rules). On success, calls `signUp`, creates a `User`, creates a default personal workspace named "<First Name>'s Workspace", routes into the onboarding wizard from step 30.
- **Sign in**: email + password. On success, sets `currentUserId`, restores the user's last-visited route or `/`.
- **Sign out**: clears `currentUserId` and routes to `/signin`.
- **Sign in with Google / Microsoft / GitHub**: render the OAuth buttons whenever `adapter.capabilities.oauthProviders` includes them. In V1, the buttons are present but hover-disabled with a tooltip *"OAuth login activates once an auth provider is configured (Settings → Authentication)"* — production lights them up automatically.
- **Forgot password**: `/forgot-password` collects an email and calls `requestPasswordReset`. A success screen confirms regardless of email existence (avoid enumeration). The reset link routes to `/reset-password?token=…` where a new password is set.
- **"Try Tasklytic"**: a secondary action on the sign-in page (and the primary CTA from the marketing site, step 01b) calls `startTrial()` and routes into the trial workspace from step 30.

### Auth UI

**Sign-in page** — split layout matching the marketing aesthetic from step 01b:
- Left half (60%): centered paper card with logo, serif "Welcome back" heading, email + password inputs, "Sign in" primary button, OAuth provider buttons (rendered per adapter capabilities), a horizontal divider with *"or"*, "Try Tasklytic" secondary button (calls `startTrial()`), "Forgot password?" link to `/forgot-password`, and a footer link to Sign up.
- Right half (40%): `bg-aurora-animated` panel with a Fraunces italic quote rotating between three options (defined in `src/features/auth/heroQuotes.ts`), small wordmark at bottom.
- Fully responsive — on mobile, the right half collapses.

**Sign-up page** — mirror of sign-in:
- Name, email, password fields with live strength meter.
- A "I agree to the Terms of Service and Privacy Policy" checkbox with real links to `/legal/terms` and `/legal/privacy` (the pages live in the marketing site from step 01b).
- OAuth provider buttons.
- "Already have an account? Sign in" footer link.

**Forgot password / Reset password pages** — paper card on `bg-aurora`, single input, clear copy, success confirmation.

Form validation:
- Inline error states (red border + caption).
- Email regex check + check against `adapter.signIn` failure messages.
- Password requirements visible inline with checkmarks as each requirement passes.
- Submit button disabled until valid.
- Loading state during submit.
- Generic error handling: never reveal whether an email exists.

### Current user context

Implement a `useCurrentUser()` hook in `src/features/auth/useCurrentUser.ts` that returns the current `User` or `null`. Implement a `<RequireAuth>` route wrapper that calls `adapter.getSession()` on mount, redirects to `/signin?next=<currentRoute>` if no session, and renders children otherwise.

Wrap all in-app routes (except `/`, `/signin`, `/signup`, `/forgot-password`, `/reset-password`, the marketing site routes from step 01b, and public form URLs added later) with `<RequireAuth>`.

### App shell integration

In the topbar (slot from step 01):
- Replace the avatar slot with a real avatar + dropdown menu:
  - Header: name + email
  - Items: "My profile" (→ `/me`), "Settings" (→ `/me/settings` — opens a real settings index page), "Theme" (Light/Dark/System cycle), "Sign out".

In the sidebar (slot from step 01):
- Replace the user-avatar slot at the bottom with the same avatar + name as a compact button that opens the same dropdown.

### Profile page (`/me`)
- Header: large avatar (editable via popover that lets you upload an image, pick from 10 brand colors, or change initials by editing name), name, job title (inline-editable), email (read-only with copy button), timezone (select from a complete IANA timezone list).
- Tabs:
  - **Profile** (the above)
  - **Notifications** — scaffolded here; full implementation in step 17 (the tab renders a heading and a "Configured in step 17" caption until then; the tab itself ships now so wiring later is non-disruptive)
  - **Connected apps** — lists every OAuth integration with its connection state (Connected / Not connected) and a real Connect/Disconnect button. In V1 with no providers configured, the buttons surface the same "Configure in Settings → Authentication" hint as the sign-in OAuth buttons.
  - **Sessions** — lists active sessions (current browser at minimum) with a "Sign out all other sessions" action that calls `adapter.refreshSession()` after invalidation.

Saving any field updates the `User` record through `useUsersStore`.

### Avatar component
Update `components/ui/Avatar.tsx` (from step 01) to:
- Accept `userId` and look up the user from `useUsersStore`.
- Use `colorForUser(id)` from step 02 for background color when no image is set.
- Render initials in white with `font-medium`.
- Show a presence indicator dot in the bottom-right driven by `usePresence(userId)` — a real hook backed by the user's `lastActiveAt` timestamp (refreshed by an activity heartbeat: a 60-second interval that updates `lastActiveAt` on the current user while the tab is focused). Presence rules: green (active in last 5 min), amber (idle 5–30 min), gray (offline beyond 30 min). This is real presence, derived from real activity, with no fabricated state.

### Success criteria
- Visiting a protected route while signed out redirects to `/signin?next=…` and returns to the original route after sign-in.
- Signing up creates a user + a default workspace and routes into the onboarding wizard from step 30.
- The topbar and sidebar reflect the signed-in user.
- Refreshing the page keeps the session via `adapter.getSession()`.
- Forgot-password flow works end-to-end against the V1 adapter (with the email surfaced in-app pending an email-provider binding).
- Trial sign-in (`startTrial()`) creates an isolated trial workspace in the trial namespace.
- All auth surfaces respect the `AuthAdapter.capabilities` flags — OAuth buttons, SSO entry points, MFA prompts only appear when supported.
- The presence indicator on `<Avatar />` reflects real `lastActiveAt` timestamps.
- `Design.md` gets a new feature-log row: `03 | src/features/auth, src/features/user, src/lib/auth, src/stores/auth.ts | Authentication & profiles | <today>` and an **"Auth adapter"** section noting the V1 + production swap-out.

Do not break steps 01, 01b, or 02. Keep one feature per file. Add docstrings on every exported function.
