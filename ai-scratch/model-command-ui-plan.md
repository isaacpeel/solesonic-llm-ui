# Plan: UI support for the `/model` slash command

## Goal

`/model` behaves in the UI exactly like every other slash command: it appears in the command picker, is selected the same way, is sent the same way, and its reply renders as an ordinary assistant message. The UI contains no model-specific code path beyond what the new `commandType` forces on it.

## What the backend already guarantees (nothing to change server-side)

- `GET /slash/commands[?command=<prefix>]` returns `/model` **first** in every response, as `{"commandType": "model", "command": "model", "name": "model", "description": "List the available chat models, or switch this chat to one: /model <name>"}`.
- It is sent on the ordinary chat endpoints (`POST`/`PUT` under `/streaming/chats/...`) as `{"chatMessage": "<model name or empty>", "commands": ["model"]}`. `commands` is a set and the server uses the first match, so the UI must send exactly one command.
- `command` is the **bare** name, with no leading slash — same as every other catalog entry. (`docs/api.md` still shows `"/ask"` in its request example; that example is wrong and is fixed in step 6.) The `/` is purely a UI trigger character.
- The reply is a normal assistant message on the turn's AG-UI stream: `RUN_STARTED`, one `TEXT_MESSAGE_*`, `RUN_FINISHED`. Never `RUN_ERROR`, never a 4xx. A failure to list models is also an ordinary reply ("The model list could not be retrieved…").
- Both rows of the turn are persisted with `commands: ["model"]`; the user row's `chatMessage` is the model name or empty. History is skipped when replayed to the LLM server-side, but **`GET /chats/{chatId}` still returns both rows**.
- Reply text is Markdown: the current model and the available models are rendered as a bulleted list with each name in backticks.

## Behaviour the UI must support

| User action | UI behaviour |
|---|---|
| Types `/` | Picker lists catalog commands; `/model` is first, with its description |
| Selects `/model` | Same as any command: chip/token for `model`, input stays free for an argument |
| Sends with empty input | Request `{commands:["model"], chatMessage:""}`. Must **not** be blocked by an "empty message" guard |
| Sends `openai/gpt-4o` after the chip | Request `{commands:["model"], chatMessage:"openai/gpt-4o"}`. The argument is sent whole, trimmed; `/` and `:` are not separators |
| Reply arrives | Rendered as an assistant message through the existing Markdown pipeline, streamed like any other |
| Page refresh | The history shows the `/model` user row and its reply (see Open Questions for how the user row is shown) |

## Changes

### 1. Catalog model
- Add `model` to the TypeScript union / discriminator for `commandType` (alongside `prompt`, `tool`, `agent`, `local-tool`).
- Add the corresponding `ModelSlashCommand` type: `{commandType: "model", command: string, name: string, description: string}`. It has the same shape as the others, so shared command components need no new props.
- Any exhaustive `switch` over `commandType` (icons, grouping, labels, analytics) gets a `model` arm. A default arm that throws or renders nothing is the failure to look for.
- Parsing must tolerate an unknown `commandType` without dropping the whole catalog — a stale UI against a newer server should lose one entry, not all of them.

### 2. Picker and type-ahead
- No new request: `/model` arrives in the existing `GET /slash/commands` response. Do not special-case or hard-code it in the client — a hard-coded entry would shadow the server's and drift from its description.
- Keep the server's ordering (built-ins first). If the picker sorts or groups client-side, give `model` a group label (e.g. "Built-in") rather than letting it fall into an MCP-sourced group such as "Tools".
- Filtering is the server's `contains` match on `command` and `description`; the client keeps passing the typed prefix as `command`.

### 3. Sending
- Reuse the existing send path unchanged. The only code that can break it is validation:
  - Remove or relax any "message must be non-empty" check **when `commands` is non-empty**. A bare `/model` is a valid, meaningful send.
  - Same for any "disable send button while input is empty" rule.
- Do not split the input on whitespace or on `/`. The text after the command chip is the argument, as a single string.
- Attachments: `/model` ignores them. The UI need not block attaching, but should not claim they were used. (Open Question 4.)

### 4. Rendering the reply
- No new component. The reply is Markdown from the normal text-message events.
- Verify the Markdown renderer shows inline code and bullet lists acceptably in the assistant bubble — the reply is the only place a user sees the model ids.
- Verify the "waiting for the model" indicator doesn't hang: a `/model` turn finishes in one short text message with no tool calls or thinking.

### 5. History
- Load of `GET /chats/{chatId}` returns user + assistant rows with `commands: ["model"]`. Render the assistant row as usual.
- The user row has an empty or bare-name `chatMessage`. Render it the way other command invocations are rendered (command chip plus argument). If rows with an empty `chatMessage` are currently filtered or shown as a blank bubble, fix that generically for command rows, not for `model` alone.

### 6. Docs
- Fix the `commands` example in `docs/api.md` (`["/ask"]` → the bare command name) in this repo. The UI repo's own docs get a line noting that `/model` is a built-in served by the catalog.

## Tests (UI repo)
- Catalog parsing: a response containing `commandType: "model"` parses; an unknown `commandType` is skipped without failing the rest.
- Picker: `/` shows `/model` first; typing `mod` filters to it; selecting it adds the `model` command to the draft.
- Send: with `model` selected and empty text, a request goes out with `commands:["model"]` and `chatMessage:""`; with text `openai/gpt-4o`, `chatMessage` is exactly that string.
- Send payload carries exactly one command.
- History: a chat containing a `commands:["model"]` user row and its reply renders both without a blank or crashing bubble.
- Manual check against a running API: `/model` lists; `/model <valid>` confirms; `/model nonsense` lists with "Unknown model"; the next plain message goes out (confirm via the API's response metadata or logs that the chosen model was used); a different chat is unaffected and still shows the default.

## Build order
1. Types and exhaustive-switch fixes (compile-driven).
2. Relax the empty-message validation for command sends.
3. Picker grouping/label.
4. History rendering of command rows.
5. Tests, then the manual check against a running API.

## Open questions
1. **Where is the UI repo?** It isn't in this workspace, so none of the file-level work above could be pinned to real files; the plan names behaviours, not paths. Point me at it before implementing.
2. **How should a command row show in history?** The server stores the argument as the user row's `chatMessage` (empty for a bare `/model`). Decide whether the UI shows `/model` + argument (needs the `commands` array, which is returned) or hides command user rows entirely.
3. **Should the UI show the current model persistently?** Out of scope for "behave like any other command": the only source today is the human-readable reply text, and the UI shouldn't parse Markdown to recover it. If a model indicator is wanted, it needs a small server addition (e.g. a field on `GET /chats/{chatId}`) — a separate decision.
4. **Attachments with `/model`:** ignore silently, or have the UI clear/warn? Server ignores them, and the staged attachment would remain unsent.
