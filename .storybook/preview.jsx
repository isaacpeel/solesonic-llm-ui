import '../src/main.css';
import {SharedDataProvider} from '../src/context/SharedDataContext.jsx';

/*
 * SharedDataProvider is app-wide state only (no network calls), so it is safe to wrap every
 * story with it here rather than making each story that touches useSharedData() do it itself.
 */
function SharedDataDecorator(Story) {
    return (
        <SharedDataProvider>
            <Story/>
        </SharedDataProvider>
    );
}

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },

        a11y: {
            // 'todo' - show a11y violations in the test UI only
            // 'error' - fail CI on a11y violations
            // 'off' - skip a11y checks entirely
            test: 'todo',
        },

        backgrounds: {
            default: 'app-dark',
            values: [
                {name: 'app-dark', value: '#1e1e1e'},
            ],
        },
    },

    decorators: [SharedDataDecorator],
};

export default preview;
