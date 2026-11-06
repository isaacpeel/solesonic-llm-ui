# Shared agent sessions

Several users work with one A2A agent in a single **shared session**: everyone sees every message, and the agent
answers all of them. The backend contract is `solesonic-llm-api/docs/api.md` § "Shared Sessions".
`service/SharedSessionService.js` is that contract and knows nothing about any particular agent; the screens in
`src/sharedsessions/` add the per-agent parts from the agent registry.

## Screens

| Route | Component | What it does |
|---|---|---|
| `/shared-sessions` | `sharedsessions/SharedSessionsScreen.jsx` | Invite by username, answer invites, list sessions (waiting on you first) |
| `/shared-sessions/invites/:inviteId` | `sharedsessions/SharedSessionInviteScreen.jsx` | Where a `SESSION_INVITE` push leads: accept or decline |
| `/shared-sessions/:sessionId` | `sharedsessions/SharedSessionScreen.jsx` | The session: transcript, status banner, the agent's question, the composer |

The routes are the API's own paths because push URLs are built by the server.

The header's `SharedSessionsLink` shows a dot while a session waits on you or an invite waits for an answer. It
rechecks on visibility, after a push is followed, and once a minute.

## The agent registry

`sharedsessions/sharedAgents.js` lists the agents the UI offers for sharing. Each entry is keyed by the API's
`agentName` and carries:

| Field | Used for |
|---|---|
| `label` | How the agent is named in lists, invites and the session header |
| `openings` | `{openingMessage, label}` choices on the invite form. The opening message is sent to the agent as the invitee when they accept |
| `idleHint` | The status banner when nobody is being waited on |
| `waitingHint` | Added to the composer placeholder while someone else is being waited on |
| `completedText` | The status banner once the session is `COMPLETED` |

Today the only entry is `feud` (Family Feud), whose openings are its own start words, `new show` and
`new main game`.

- **The invite** is `{username, agentName, openingMessage}`. The agent picker shows only when more than one agent is
  registered; the opening picker only when the agent has openings.
- **The lists and the header dot** both keep only sessions and invites whose `agentName` is registered
  (`forKnownSharedAgents`), so the dot never points at something the list hides.
- **An unregistered agent** reached by URL still renders, with generic wording (`sharedAgentFor` falls back).

Adding an agent is a new entry in `SHARED_AGENTS`; no screen changes.

## How frames arrive

A shared session is not a chat. **Every participant reads every run from one stream**
(`GET /shared-sessions/{id}/stream`), whoever started it. A message is a plain `POST /shared-sessions/{id}/messages`
that answers `202 {runId, messageId}`, and the sender's own run arrives on the stream like everyone else's.

- **`useSharedSessionStream`** loads `GET /shared-sessions/{id}` and `/messages`, then follows the stream with no
  cursor. The server starts at the run in progress, so opening a session mid-run shows that run from its
  `RUN_STARTED`.
- **Reconnects** carry the last frame's `id`, and back off 1 s, 2 s, 4 s and up to 30 s. A `410` means the
  stream no longer holds the cursor: reload the transcript, then read on with no cursor.
- **A hidden page** lets go of the stream after 5 s, so the server's presence check lets the push through.
  It reconnects when the page comes back.
- **`sharedsessions/sharedSessionTranscript.js`** is the pure frame reducer. Its state is
  `{messages, activeRun, session}`:
  - `RUN_STARTED` adds the sender's bubble from `input.messages[0]`, unless a message with that id is already
    shown, and opens the reply. `name` is the sender's participant name; the bubble is the viewer's own when it
    matches the name the session gives the viewer.
  - `TEXT_MESSAGE_CONTENT` appends to the reply.
  - `CUSTOM session_state` replaces the session.
  - `RUN_FINISHED` finalizes the reply, and an empty one is dropped. `RUN_ERROR` turns it into an error bubble.
  - There is no optimistic bubble: `RUN_STARTED` is published before the `202`, so it is what shows the message.
- **Sounds:** a sound cue on `TEXT_MESSAGE_START` plays through `useSoundPlayer`, so every participant hears it.
  The General settings "Agent sounds" toggle mutes it.

## Turns and questions

- `session.turn.userIds` is who the session waits on, and `session.turn.next` is the agent's word for what it
  expects. The banner says "Waiting on you" or "Waiting on Sam…".
- `session.prompt` is the agent's question. It renders with the chat's `ElicitationPrompt`, but **only for a
  participant in `prompt.forUserIds`**. Its answer is a message (`{promptAnswer: {elicitationId, action, content}}`),
  never the chat's elicitation-response endpoint.
- The composer stays open while someone else is being waited on; the agent decides what it accepts out of turn.
- **The screen is laid out like a chat**: the transcript uses `ChatMessage`, the jump-to-latest button uses
  `useScrollToBottom`, and the composer is the chat's `chat/composer/MessageComposer.jsx` (the same pill, send
  and stop buttons, and Enter handling), without slash commands or attachments. Stop shows only to the
  participant who started the run; the others see the loading dots.
- One run at a time: while one is in progress the composer waits, and a refused message (`409 RUN_IN_PROGRESS`)
  puts the text back.
- `COMPLETED` still takes messages, so a participant can start over.
- **Leave** closes the session for everyone. It is a small icon at the end of the header
  (`LeaveSessionButton`) that expands in place into "End for everyone? ✓ ✕". The pill collapses back after 5 s,
  on Escape, or on a tap anywhere else.

## Hidden sections

A message can hide part of itself from some participants, so Family Feud's Fast Money can keep the first player's
questions, answers and score from the second player until the recap.

```
Your questions:
[[hidden:Sam]]
1. Name a fruit you peel.
[[/hidden]]
```

- **Grammar:** `[[hidden:Name,Name]]` … `[[/hidden]]`. Names are participant names, matched case-insensitively
  against `viewerParticipantName(session, viewerUserId)`. An unclosed marker hides to the end of the text. The agent
  writes markers into its replies; the API wraps a participant's own message when the agent said the next one is
  private. Both arrive as ordinary text, on the stream and from `/messages`.
- **Who sees what** (`chat/message/hiddenSections.js`, `presentForViewer(text, viewerName)`):
  - A listed participant sees `🔒 Hidden from you until everyone has played.` in place of the whole section.
  - Everyone else sees the section under `👁 Hidden from Sam`, so its author knows who can't see it.
  - A partial marker at the end of a streaming chunk (`[[`, `[[hid`, `[[hidden:Sa`) is dropped until it completes,
    so no raw marker or name flashes.
  - **Fail closed:** with no viewer name (the session isn't loaded yet), every section is hidden.
- **Where:** `SharedSessionScreen` redacts just before render, memoized on the messages and the viewer name. The
  transcript state stays raw, so the reducer and reconnect/reload behaviour don't change. `ChatMessage` is handed the
  redacted text, so the markdown, the streaming repair and the copy button only ever see what the viewer may see.
- **Limit:** the hiding is UI-only. Hidden text is still in the stream and the `/messages` response, where a
  participant with dev tools can read it.

## Known limit

A live bubble is matched to the viewer by participant **name**, because `RUN_STARTED`'s `input.messages[0]` carries
no user id. Two participants with the same display name would both see the other's live messages as their own until
the transcript is reloaded (REST messages carry `senderUserId`). Fixing it needs the API to put the sender's user id
on that message.

## Push

| Type | URL | Preference |
|---|---|---|
| `SESSION_INVITE` | `/shared-sessions/invites/{inviteId}` | `sessionInvites` |
| `SESSION_TURN`, `SESSION_STARTED` | `/shared-sessions/{sessionId}` | `sessionTurns` |

Both copies of `APP_PATH_PATTERN` allow `/shared-sessions`, `/shared-sessions/{id}` and
`/shared-sessions/invites/{id}`: `util/safeAppPath.js` and `public/service-worker.js`.
`tests/push/appPathFixtures.js` pins both.
