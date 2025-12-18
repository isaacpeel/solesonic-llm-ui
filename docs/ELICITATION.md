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

- For boolean-only prompts, buttons are shown for accept/decline/cancel and submission is immediate.
- For text fields, the user types values and the response is sent, after which streaming resumes.
- While waiting for the assistant, a subtle “Waiting for assistant…” indicator is displayed.

Rendered by: `src/elicitation/ElicitationPrompt.jsx`

```jsx
// simplified excerpt
function ElicitationPrompt({ elicitation, values, onChange, onSubmit, submitting }) {
  if (!elicitation) {
    return null;
  }

  const schema = elicitation.requestedSchema || {};
  const properties = schema.properties || {};

  return (
    <div>
      <div>{elicitation.message}</div>
      {Object.entries(properties)
        .filter(([name]) => name !== 'chatId')
        .map(([name, def]) => (
          <input key={name} value={values[name] || ''} onChange={(e) => onChange(name, e.target.value)} />
        ))}
    </div>
  );
}
```

## Field Submission

Submission is orchestrated by `ElicitationService`:

File: `src/service/ElicitationService.js`

```js
const responsePayload = {
  elicitationResponse: {
    name: activeElicitation.name,
    fields: { ...fieldsToSend },
  },
};

await streamService.chatStreamElicitationResponse(
  responsePayload,
  chatId,
  elicitationId,
  { onChunk: handleStreamChunk }
);
```

Notes:

- The service also updates the chat history to include the system prompt and the user’s field summary before streaming begins.
- The last AI message is flagged as `isStreaming` and filled incrementally.

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

- UI component: `src/elicitation/ElicitationPrompt.jsx`
- Submit logic: `src/service/ElicitationService.js`
- Streaming submission: `src/service/StreamService.js`
- Stream handling: `src/service/ChatService.js` (`handleStreamChunk`)

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
