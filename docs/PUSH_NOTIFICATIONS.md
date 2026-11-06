# Push Notifications (Chrome Web Push)

A user can turn notifications on for a device and receive them in Chrome, on Android included, with the app closed, when:

1. **A turn finished** (or failed) while they weren't watching that chat.
2. **A tool is waiting for their answer** (an elicitation), plus one reminder from the server.
3. **An interest offer** arrives (the server noticed something they follow and offers a news agent), with **Enable** and **Not now** buttons.
4. **News arrives** on an interest they follow; the server has already written it into a new chat.

Tapping a notification opens or focuses the app on that chat. Notifications carry **no conversation content**; the server guarantees this and the UI shows exactly what it receives.

Scope: Chrome only (other browsers get a "not supported" state), push only (no offline caching, no `fetch` handler).

## How it works

| Piece | File |
|---|---|
| Service worker | `public/service-worker.js` |
| Client service | `src/service/PushSubscriptionService.js` |
| App-load sync | `src/push/PushSubscriptionSync.jsx` (mounted in `App.jsx` inside `AuthenticationWrapper`) |
| Notification-click routing | `src/push/usePushNavigation.js` (called by `App`) |
| Settings page | `src/settings/notifications/NotificationSettings.jsx` (`/settings/notifications`) |
| Manifest | `applicationManifestPlugin` in `vite.config.js` (served at `/manifest.webmanifest`) |

### Subscribe

**Turn on for this device** calls `enableOnThisDevice()` straight from the click handler. `Notification.requestPermission()` is its first await, because Chrome only shows the prompt with user activation and penalises sites that prompt on load. With permission granted it fetches the VAPID key, registers the worker, subscribes with `userVisibleOnly: true`, and `PUT`s `PushSubscription.toJSON()` plus a label (`Chrome on <platform>`).

The device state is kept in `localStorage` under `push.device` as `{subscriptionId, enabledForUser}`. It is not secret: the endpoint and keys are never stored there.

### Sync on load

`syncOnLoad()` never prompts. It runs only when push is supported, permission is `granted`, the server has a key and the device state is readable. It acts only for the user recorded in `enabledForUser`:

- If `enabledForUser` is someone else (or nobody), an existing subscription is unsubscribed and the device state cleared. A device is never adopted by a user who did not turn it on.
- For the signed-in user, a subscription made with a different server key is unsubscribed and replaced, and an existing one is re-uploaded (refreshing `updated`).
- For the signed-in user with no subscription, it subscribes silently. A `subscriptionId` left by a logout whose delete did not finish is deleted first.

The settings page waits on `whenSynced()` before reading this device's id, so landing there straight after a silent re-subscribe still marks "This device".

This is also how `pushsubscriptionchange` is covered. The worker holds no token, so it can resubscribe but cannot upload; the next app load does that.

### Logout

`KeycloakProvider.logout` awaits `releaseOnLogout()` before redirecting. It unsubscribes this device and deletes its row, but keeps `enabledForUser`, so the same user signing back in is re-subscribed silently and a different user is not. It never rejects and is capped at 3 seconds; if the delete does not finish, the `subscriptionId` is kept so the next sync can retry it.

**Turn off** (`disableOnThisDevice`) deletes the server row first and only then unsubscribes locally, so a failed delete leaves the device intact for a retry.

### Service worker

- `push`: always shows a notification (the `userVisibleOnly` contract), falling back to a default title and body when the payload is missing or unparseable. `tag` plus `renotify` replace the previous notification for that chat.
- `notificationclick`: focuses an open window (focused, then visible, then any) and posts `{type: 'push:navigate', url}`; the app routes in place with `router.navigate`. With no window open it calls `clients.openWindow`.
- Actions: only `enable` and `dismiss` with a non-empty string `title` (capped at 32 characters) are shown, at most `Notification.maxActions` (2 when unknown); a payload without valid actions shows none. `dismiss` only closes the notification. `enable` on an `INTEREST_OFFER` opens its url with `?intent=accept`, which the offer screen reads to focus **Enable** (it never accepts by itself). Any other click opens the plain url. The worker still never calls the API.
- Every `url` must match the app's own route shapes (`/`, `/chat/<id>`, `/interests/offers/<id>` with an optional exact `?intent=accept`, `/settings/...`, no other query or fragment) and resolve to this origin, checked in both the worker and the app (`src/util/safeAppPath.js`; keep the two patterns in sync — `tests/push/appPathFixtures.js` is the shared allow/deny table both test suites run). Anything else becomes `/`. Title and body are capped at 100 and 200 characters.
- After the app routes to a pushed url it dispatches a `push:navigated` window event. The chat history drawer listens for `/chat/…` urls and reloads its list and groups, so a news chat the open app has never listed shows up under its "News: …" group.

### Background release

A backgrounded Chrome tab on Android can keep the SSE connection open for minutes, and the server treats an open stream as "watching", so the push for the very turn the user walked away from would be suppressed. `useChatStream` therefore aborts the stream 5 seconds after the page is hidden, once `RUN_STARTED` has arrived and before a terminal frame, and lets the existing recovery replay it losslessly by `Last-Event-ID` when the page returns. Coming back within 5 seconds cancels the release. A user-initiated abort never recovers.

## Contract

The API is the source of truth (`solesonic-llm-api/ai-scratch/push-notifications/01-plan.md`). All paths are relative to `VITE_API_BASE_URI` and require a bearer token. User-scoped paths answer `404` for any `userId` that is not the caller's. Errors are `{"code": "…", "message": "…"}`.

### `GET /push/vapid-public-key`

`200` `{"publicKey": "<base64url, 65-byte uncompressed P-256 point>"}`. `503` `PUSH_DISABLED` when push is off on the server; the UI hides the feature.

### `GET /users/{userId}/push-subscriptions`

`200` `[PushSubscriptionSummary]`, newest first. The endpoint and keys are never returned.

```json
{ "id": "uuid", "label": "Chrome on Android", "userAgent": "…", "created": "ISO-8601", "updated": "ISO-8601", "lastDelivered": "ISO-8601|null" }
```

### `PUT /users/{userId}/push-subscriptions`

Idempotent upsert keyed on `subscription.endpoint`.

```json
{ "subscription": { "endpoint": "https://fcm.googleapis.com/fcm/send/…", "expirationTime": null, "keys": { "p256dh": "…", "auth": "…" } }, "label": "Chrome on Android" }
```

- `201` (created) or `200` (updated, including re-assignment from another user) → `PushSubscriptionSummary`.
- `400` `UNSUPPORTED_BROWSER` (endpoint host not allowed) → the UI unsubscribes locally and says "Chrome only".
- `400` `INVALID_SUBSCRIPTION`; `503` `PUSH_DISABLED`.

### `DELETE /users/{userId}/push-subscriptions/{subscriptionId}`

`204`, or `404` (treated as already removed).

### `POST /users/{userId}/push-subscriptions/{subscriptionId}/test`

A synchronous test send that bypasses preferences and presence. `204` accepted; `410` `SUBSCRIPTION_GONE` (the row is deleted and the UI re-subscribes without prompting); `502` `DELIVERY_FAILED`; `404`; `503` `PUSH_DISABLED`.

### `GET` / `PUT /users/{userId}/push-preferences`

```json
{ "turnComplete": true, "elicitation": true, "interestOffers": true, "interestUpdates": true }
```

`GET` with nothing stored returns every field `true`. `PUT` requires `turnComplete` and `elicitation` (`400` `INVALID_PREFERENCES` otherwise), so the UI always sends both; `interestOffers` and `interestUpdates` are optional and left unchanged when absent. `updatePreferences` sends them only when defined, and the settings page treats a server that does not return them yet as `true`. This is deliberately not part of `UserPreferences`, whose full-replace `PUT` would silently switch notifications off for a client that omits the fields.

### Push payload

```json
{ "version": 1, "type": "TURN_FINISHED", "title": "<bot name>", "body": "Your reply is ready", "url": "/chat/<chatId>", "tag": "chat:<chatId>", "timestamp": "ISO-8601" }
```

| `type` | `body` | `url` | `tag` |
|---|---|---|---|
| `TURN_FINISHED` | `Your reply is ready` | `/chat/<chatId>` | `chat:<chatId>` |
| `TURN_FAILED` | `Your request couldn't be completed` | `/chat/<chatId>` | `chat:<chatId>` |
| `ELICITATION_WAITING` | `A tool is waiting for your answer` | `/chat/<chatId>` | `elicitation:<elicitationId>` |
| `TEST` | `Notifications are working` | `/settings/notifications` | `test` |
| `INTEREST_OFFER` | `I can keep you posted on something you're interested in` | `/interests/offers/<offerId>` | `interest-offer:<offerId>` |
| `INTEREST_UPDATE` | `There's news on one of your interests` | `/chat/<chatId>` | `interest:<agentId>` |

`INTEREST_OFFER` alone carries `"actions": [{"action": "enable", "title": "Enable"}, {"action": "dismiss", "title": "Not now"}]`. Neither interest type names the topic, so the lock screen never shows it.

Unknown `type` values are displayed using `title` and `body` as given. `version` only changes on a breaking change.

## nginx and CSP

`nginx.conf` serves `/service-worker.js` and `/manifest.webmanifest` from exact-match locations with `Cache-Control: no-cache`. Without them the `\.(…js…)$` regex block would cache the worker for 7 days and delay every worker fix by a week. Exact-match locations declare their own `add_header`s, so they repeat the security headers.

The CSP adds `worker-src 'self'; manifest-src 'self'`. `default-src 'self'` already covers both; naming them documents the intent. `connect-src` is unchanged because the worker makes no network calls.

## Icons

The manifest and notifications reference these files, which must be added to `public/icons/`:

| File | Spec |
|---|---|
| `icon-192.png` | 192×192, the app logo |
| `icon-512.png` | 512×512, the app logo |
| `icon-maskable-512.png` | 512×512, logo inside the central 80% safe zone, opaque background |
| `badge-96.png` | 96×96, monochrome white silhouette on transparent (Android status-bar badge) |

Chrome's install criteria need the 192 and 512 icons; without a badge Android shows a generic square.

## Troubleshooting

- Don't force-stop Chrome; a stopped Chrome receives nothing.
- Allow Chrome's notifications in Android settings (Settings → Apps → Chrome → Notifications).
- On Samsung, Xiaomi and OnePlus phones, set Chrome's battery usage to Unrestricted.
- Phones without Google Play services can't receive them.
- Install the app (Chrome menu → Add to Home screen) so a tap opens it like an app.
- A blocked permission can't be re-requested by the page: Chrome menu → Settings → Site settings → Notifications → this site → Allow.

## Testing on a phone

Service workers and push need a secure context. Serve both the API and the UI over HTTPS, or use `localhost` through Chrome remote debugging port-forwarding (`chrome://inspect` → Port forwarding) so the phone sees `http://localhost:3000`.
