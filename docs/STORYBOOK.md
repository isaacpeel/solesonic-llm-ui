# Storybook

Storybook lets you build and visually verify individual components in isolation, in a browser,
without the backend (`solesonic-llm-api`), Keycloak, or a network connection running. It is
mainly useful for presentational components — components whose behavior is driven by props
rather than by fetching their own data.

Coverage today is scoped to **plain text chat messages** (`ChatMessage` and the components it
composes, for `USER`/`ASSISTANT`/`SYSTEM` messages built from `text` alone). Messages that carry
attachments or generated images pull in hooks that fetch authenticated blobs from the backend
(`useAttachmentUrl`, `useGeneratedImageUrl`) and are not mocked yet — see Known gaps.

## Running it

```
npm run storybook        # dev server at http://localhost:6006, hot-reloads on save
npm run build-storybook  # static build to storybook-static/ (gitignored)
```

Both scripts are plain `npm`/`npx` invocations of the `storybook` CLI (added to `package.json`
by `npx storybook@latest init`), not IntelliJ run configurations — there is currently no run
configuration for them.

## What's installed

Storybook 10 with the Vite builder, matching this project's Vite 8 + React 19 stack:

- `storybook`, `@storybook/react-vite` — core + framework. The Vite builder reuses
  `vite.config.js`'s plugins (`react()`, `tailwindcss()`) automatically, so JSX and Tailwind
  work in stories without any duplicate config.
- `@storybook/addon-docs` — autodocs pages generated from stories.
- `@storybook/addon-a11y` — accessibility panel (axe-core) per story.
- `@chromatic-com/storybook` — Chromatic publish/visual-review integration. Installed but not
  configured against a Chromatic project; harmless to leave until someone wants it.
- `eslint-plugin-storybook` — wired into `eslint.config.js` (`storybook.configs['flat/recommended']`
  appended to the flat config array), so `.stories.jsx` files get linted the same as the rest of
  the project via `mcp__idea__lint_files` / `mcp__idea__get_file_problems`.

### Deliberately not installed

`npx storybook@latest init` also proposed `@storybook/addon-vitest` (Vitest browser-mode
integration via Playwright) and `@storybook/addon-mcp`. Both failed to auto-configure during
setup, and `addon-vitest` pulls in Playwright's browser binaries — a large download with no
payoff here, since it would run stories as tests through a second, parallel Vitest
configuration rather than the project's existing `vite.config.js` `test` block (see the
`CLAUDE.md` note about the IntelliJ Vitest runner already being particular about environment
config). Both packages were removed after init. Component *tests* stay in `tests/`, run the
usual way (`mcp__idea__execute_run_configuration`); Storybook here is for visual/manual
development, not test execution.

## Configuration

- **`.storybook/main.js`** — story discovery glob (`src/**/*.stories.@(js|jsx|mjs|ts|tsx)` and
  `src/**/*.mdx`), the addon list above, and the Vite framework.
- **`.storybook/preview.jsx`** — global setup applied to every story:
  - Imports `src/main.css` so the CSS custom properties (`--background-color`, `--text-color`,
    etc.) and base `body` styling that most components depend on are present, same as
    `main.jsx` does for the real app.
  - Wraps every story in `SharedDataProvider` (`src/context/SharedDataContext.jsx`). That
    context is pure in-memory `useState`/`useRef` — no network calls — so it's safe to provide
    globally rather than asking every story that touches `useSharedData()` to wrap itself.
  - Sets a dark canvas background (`#1e1e1e`, matching `--background-color`) so components
    aren't previewed against Storybook's default white background.

## Writing a story

Stories use Component Story Format 3 (a default export describing the component, named exports
as variants):

```jsx
import ChatMessage from './ChatMessage.jsx';

export default {
    title: 'Chat/ChatMessage',
    component: ChatMessage,
};

export const UserMessage = {
    args: {
        message: {_key: 'msg-1', type: 'USER', text: 'Hello'},
    },
};
```

Put the file next to the component it covers (`Foo.jsx` → `Foo.stories.jsx`), matching how
`Foo.css` already sits next to `Foo.jsx`.

### Picking good candidates

The best components to write stories for are the ones that already read cleanly in isolation:
props in, JSX out, no `ApiClient`/`service/` calls of their own. `ChatMessage`, `ChatCard`,
`MessageResponseMetadata`, and `MessageCopyButton` are all like this — see
`src/chat/message/ChatMessage.stories.jsx` and `src/chat/message/MessageCopyButton.stories.jsx`
for worked examples covering user/assistant/system messages, streaming, elicitation-resolved,
error, and notification-log variants.

The one thing a plain text message depends on:

- **`SharedDataContext`** — already provided globally (see above); nothing to do.

## Known gaps

- **Attachments and generated images are out of scope for now.** `MessageAttachments` /
  `useAttachmentUrl` and `MessageGeneratedImages` → `GeneratedImage` / `useGeneratedImageUrl`
  fetch authenticated blobs from the backend and will fail with no API running. `useAttachmentUrl`
  does short-circuit when an attachment carries a `localObjectUrl` (a just-uploaded image already
  has its bytes locally — see `src/hooks/useAttachmentUrl.js`), which is a usable seam if this
  gets picked up later; `useGeneratedImageUrl` has no equivalent. The project's own tests mock
  this by swapping the hook module (`vi.mock('.../useGeneratedImageUrl.js', ...)` in
  `tests/image/GeneratedImage.test.jsx`) — the Storybook equivalent would be a `viteFinal`
  `resolve.alias` pointing the hook's import at a mock implementation under a new
  `.storybook/mocks/` directory, scoped to Storybook's own Vite instance only.
- **`useKeycloak()` / `RoleGuard`** (`src/authorizer/`) — depends on `KeycloakProvider`, which
  initializes a real Keycloak client. There is no mock provider for this yet. A component that
  calls `useKeycloak()` (directly, or via `RoleGuard`) isn't currently coverable in Storybook.
- No visual regression / interaction testing is wired in (that's what `addon-vitest` would have
  given us, at the cost described above). Storybook here is for manual/visual development only.
