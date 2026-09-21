# Storybook

Storybook lets you build and visually verify individual components in isolation, in a browser,
without the backend (`solesonic-llm-api`), Keycloak, or a network connection running. It is
mainly useful for presentational components — components whose behavior is driven by props
rather than by fetching their own data.

## Running it

```
npm run storybook        # dev server at http://localhost:6006, hot-reloads on save
npm run build-storybook  # static build to storybook-static/ (gitignored)
```

Stories also run as real browser tests (via `@storybook/addon-vitest`, Playwright + Chromium)
alongside the rest of the Vitest suite:

```
npx vitest run --project=storybook
```

## What's installed

Storybook 10 with the Vite builder, matching this project's Vite 8 + React 19 stack:

- `storybook`, `@storybook/react-vite` — core + framework. The Vite builder reuses
  `vite.config.js`'s plugins (`react()`, `tailwindcss()`) automatically, so JSX and Tailwind
  work in stories without any duplicate config.
- `@storybook/addon-docs` — autodocs pages generated from stories.
- `@storybook/addon-a11y` — accessibility panel (axe-core) per story.
- `@storybook/addon-vitest` — runs each story's `play` function as a real Vitest browser test
  (`vitest run --project=storybook`), wired into `vite.config.js`'s `test.projects`.
- `@storybook/addon-mcp` — exposes Storybook to MCP tooling.
- `@chromatic-com/storybook` — Chromatic publish/visual-review integration. Installed but not
  configured against a Chromatic project; harmless to leave until someone wants it.
- `msw` / `msw-storybook-addon` — mocks the backend HTTP calls components make (chats, chat
  groups, attachments, generated images, Atlassian/Google connections, RAG documents), so
  components that fetch their own data can be storied without a running API.
- `eslint-plugin-storybook` — wired into `eslint.config.js` (`storybook.configs['flat/recommended']`
  appended to the flat config array), so `.stories.jsx` files get linted the same as the rest of
  the project.

## Configuration

- **`.storybook/main.js`** — story discovery glob (`src/**/*.stories.@(js|jsx|mjs|ts|tsx)` and
  `src/**/*.mdx`), the addon list above, and the Vite framework.
- **`.storybook/preview.jsx`** — global setup applied to every story:
  - Imports `src/main.css` and `src/App.css` so the CSS custom properties and base styling most
    components depend on are present, same as `main.jsx` does for the real app.
  - Wraps every story in a stubbed `KeycloakContext.Provider` fed through the real `AuthService`
    singleton — the real `KeycloakProvider` does a live OIDC login-required redirect on mount,
    which has no server to talk to here, so every story instead gets an already-authenticated
    stand-in `keycloak-js` instance with the same shape. `useKeycloak()` / `RoleGuard` work
    normally in stories as a result.
  - Wraps every story in `SharedDataProvider` (`src/context/SharedDataContext.jsx`) and a
    `MemoryRouter`/`Routes` — a story whose component reads `useParams()` (e.g. `RagManagement`'s
    `:level`) sets `parameters.router = {initialEntries, path}` to get real route matching.
  - Installs the MSW handlers (`.storybook/msw-handlers.js`) via `msw-storybook-addon`'s loader,
    and fixes "now" with `MockDate` so relative-time labels render deterministically.
  - Sets a dark canvas background (`#1e1e1e`, matching `--background-color`).

## Writing a story

Stories use Component Story Format 3 (a default export describing the component, named exports
as variants):

```jsx
import ChatMessage, { USER } from './ChatMessage.jsx';

const meta = {
    component: ChatMessage,
};

export default meta;

export const UserMessage = {
    args: {
        message: { _key: 'msg-1', type: USER, text: 'Hello' },
    },
};
```

Put the file next to the component it covers (`Foo.jsx` → `Foo.stories.jsx`), matching how
`Foo.css` already sits next to `Foo.jsx`. Prefer adding a `play` function (using `storybook/test`)
that asserts on the rendered result — these run as real tests via `addon-vitest`, not just
visual scaffolding.

## Known gaps

A handful of components are still not covered, all for the same underlying reason — they own
something Storybook has no real backing for, rather than being missed by omission:

- **`App.jsx`** — owns real browser routing (`createBrowserRouter`) and the live auth flow.
  Storybook substitutes the pieces it needs (`MemoryRouter`, the Keycloak stub) as decorators
  in `preview.jsx` instead of mounting `App` itself.
- **`providers/KeycloakProvider.jsx`** — performs a real OIDC login-required redirect on mount
  with no Keycloak server available in Storybook; see the stub described above.
- A couple of thin pass-through wrapper components (e.g. `ChatGroupDialogs.jsx`) are skipped
  since they're already exercised through their children's own stories.
