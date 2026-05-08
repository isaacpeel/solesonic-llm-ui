# Elicitation

Elicitation is an interactive flow where the assistant requests missing information from the user to complete an action or refine a response. The backend signals an elicitation via a dedicated SSE event that includes a JSON schema describing the required fields. The UI renders a lightweight form, accepts user input, then submits an `elicitationResponse` back to the backend while streaming the assistant’s follow-up.

## How It Works

1. The backend emits an `elicitation` SSE event during chat streaming with:
   - `message`: human-readable instructions for the user
   - `requestedSchema`: JSON schema with `properties` and optional `required`
   - `elicitationId` and `chatId`
2. The UI renders a form using `src/elicitation/ElicitationPrompt.jsx` based on the schema.
3. The user fills out fields or selects a boolean choice (accept/decline/cancel).
4. The UI sends an `elicitationResponse` using `StreamService.chatStreamElicitationResponse(...)`.
5. The assistant’s follow-up message streams in and is appended to the chat.

## User Interaction

The ElicitationPrompt component (`src/elicitation/ElicitationPrompt.jsx`) renders form fields based on the schema:

- **Enum/OneOf fields**: Rendered as buttons for small sets of options, or select dropdowns for larger sets
- **Text fields**: Input fields where users type values
- **Multi-select fields**: Checkboxes or multi-select controls
- **Boolean actions**: Primary action buttons (accept/confirm) highlighted with special styling
- **Waiting state**: Subtle “Waiting for assistant…” spinner shown while streaming the response

The component intelligently detects the primary action button (based on keywords like ACCEPT, CONFIRM, YES, OK, APPROVE) and highlights it with primary styling.

Schema normalization via `ElicitationService.normalizeElicitationSchema()` handles both standard schema objects and direct property definitions.

## Field Submission

Submission is handled by `ElicitationService.handleElicitationSubmit()`:

```js
const payloadToSend = {
  ...fieldsToSend,
  elicitationId,
  chatId,
};

await streamService.chatStreamElicitationResponse(
  payloadToSend,
  chatId,
  elicitationId,
  { onChunk: handleStreamChunk }
);
```

The service:
- Builds a summary of submitted fields for display in the chat
- Updates chat history with the original elicitation message and the user’s response summary
- Adds an AI placeholder message marked as `isStreaming: true` to stream the assistant’s follow-up
- Clears the elicitation UI after submission
- Handles errors by rolling back partial AI messages

Default confirmation actions (when no specific fields are defined): `[‘accept’, ‘cancel’, ‘decline’]`

## Streaming Response Mechanism

Elicitation responses are posted to a streaming endpoint. The server replies via Server-Sent Events (SSE):

File: `src/service/StreamService.js`

```js
await fetchEventSource(`${streamingChatsUri}/${chatId}/${elicitationId}/elicitation-response`, {
  method: 'POST',
  body: JSON.stringify(payload),
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  onmessage(event) {
    onChunk?.(`event: ${event.event || 'message'}\n` + `data: ${event.data || ''}\n\n`);
  },
});
```

Errors are routed through `StreamService.handleStreamError(...)` to rollback partial AI placeholders and surface the error.

## Backend Integration

Endpoints used (derived from `ApplicationProperties.jsx`):

- `POST ${VITE_API_BASE_URI}/streaming/chats/{chatId}/{elicitationId}/elicitation-response`

Server events handled during chat streaming (see `ChatService.js`):

- `init` — initial payload and/or chat id
- `chunk` / `message` — incremental content
- `elicitation` — schema and context for user input
- `done` — finalize AI message

## Code Reference

Key files and their responsibilities:

- `src/elicitation/ElicitationPrompt.jsx` — Renders form fields, enum/oneOf options, and waiting indicator
- `src/service/ElicitationService.js` — Manages form state, normalizes schemas, orchestrates submission
- `src/service/StreamService.js` — Sends elicitation response and manages SSE streaming
- `src/service/ChatService.js` — Processes stream events including `elicitation` event type
- `src/chat/ChatScreen.jsx` — Coordinates elicitation flow and chat updates

## Example: Responding to a Boolean Elicitation

```js
// In ElicitationPrompt.jsx (boolean-only)
const handleAccept = () => {
  onChange('confirm', 'accept');
  onSubmit({ confirm: 'accept' });
};
```

Backend receives:

```json
{
  "elicitationResponse": {
    "name": "<elicitation-name>",
    "fields": {
      "confirm": "accept"
    }
  }
}
```

The assistant then streams a continuation of the conversation, often proceeding with the requested action.
