# Elicitation

Elicitation lets an MCP tool pause mid-call and ask the user a structured question — a confirmation,
a choice, a small form — while the chat turn is still streaming. The backend's side of this is
documented in `solesonic-llm-api/docs/elicitation.md`; this page covers how the UI receives the
question, renders it, and answers it.

## How It Works

The chat stream speaks [AG-UI](https://docs.ag-ui.com). An elicitation arrives as an AG-UI **tool
call** inside the running turn and is answered with the AG-UI **`ToolMessage`** for that tool call:

1. The stream carries `TOOL_CALL_START` → `TOOL_CALL_ARGS` → `TOOL_CALL_END`. `toolCallId` is the
   elicitation id and `toolCallName` is always `"elicitation"`.
2. `ChatService.handleStreamChunk` parses `TOOL_CALL_ARGS.delta` — a JSON **string** holding the
   whole `ElicitRequest` (`message`, `requestedSchema`, `_meta`, `elicitationId`, `chatId`) — and
   treats it as an elicitation only when its `elicitationId` matches the frame's `toolCallId`. It
   calls `setActiveElicitation` and seeds `elicitationValues` from the schema's properties
   (`chatId` is pre-filled from `_meta.chatId`, then the request's `chatId`).
3. `useElicitation` drops the empty AI placeholder, and `src/elicitation/ElicitationPrompt.jsx`
   renders the form.
4. On submit, `ElicitationService.handleElicitationSubmit` posts a `ToolMessage` and pushes a fresh
   streaming AI placeholder.
5. The parked tool call resumes server-side and the rest of the turn streams in **on the same SSE
   connection** — no new run, no reconnect. The elicitation response request itself returns a
   bodiless `200`.

This is a deliberate departure from AG-UI's interrupt/resume model: the run is never finished by an
elicitation. Only `RUN_FINISHED`/`RUN_ERROR` end the stream, so a connection that drops while a
question is open is treated like any other truncated turn — resumed by cursor when the page was
backgrounded, otherwise reported — because the rest of the turn can only ever arrive on it.

## User Interaction

`ElicitationPrompt` renders form fields from the schema:

- **Enum/OneOf fields**: buttons for small sets of options, a select for larger sets
- **Text fields**: input fields
- **Multi-select fields**: checkboxes
- **Boolean actions**: primary action buttons (accept/confirm) highlighted
- **Waiting state**: a "Waiting for assistant…" spinner while the answer is in flight

`ElicitationService.normalizeElicitationSchema()` turns a schema with empty `properties` into a
single `action` enum of `accept`/`cancel`/`decline`.

## The Answer

```
POST ${VITE_API_BASE_URI}/streaming/chats/{chatId}/{elicitationId}/elicitation-response
```

```json
{
  "id": "b8e2…",
  "role": "tool",
  "toolCallId": "9c41…",
  "content": "{\"action\":\"accept\"}"
}
```

- `toolCallId` must equal `{elicitationId}` in the path (`400` otherwise).
- `content` is a JSON **string**, as AG-UI defines a tool message's content.
- **Only `action` reaches the MCP tool.** The UI still includes the submitted form fields in
  `content`, which the backend ignores today. A form that asks for free-form input therefore has
  no effect beyond its accept/decline/cancel outcome.

`resolveElicitationAction` derives `action` from what the user submitted:

1. An explicit `action` field (`accept`, `decline`, `cancel`, case-insensitive).
2. Otherwise a single choice field (ignoring `chatId`) whose value maps onto an action:
   `yes`/`confirm`/`ok`/`approve` → `accept`, `no`/`reject`/`deny` → `decline`, `cancel` → `cancel`.
3. Otherwise `accept` — submitting a form is accepting it.

## Cancelling

An `action` of `cancel` also stops the turn. The stream then ends the way every cancelled turn does:
`TEXT_MESSAGE_END` if a reply was open, a `CUSTOM` event named `cancel`, then `RUN_FINISHED` whose
`result` carries the `SYSTEM` "Chat canceled." message — rendered as its own system bubble.

## Code Reference

- `src/elicitation/ElicitationPrompt.jsx` — renders fields, enum/oneOf options, waiting indicator
- `src/hooks/useElicitation.js` — drops the empty placeholder, wires change/submit
- `src/service/ElicitationService.js` — schema normalization, action resolution, `ToolMessage` submission
- `src/service/StreamService.js` — `chatStreamElicitationResponse` posts the answer
- `src/service/ChatService.js` — `handleStreamChunk` routes `TOOL_CALL_ARGS` into elicitation state
