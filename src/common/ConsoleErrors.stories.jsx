import { expect } from 'storybook/test';
import ConsoleErrors from './ConsoleErrors.jsx';

const meta = {
    component: ConsoleErrors,
    tags: ['ai-generated'],
};

export default meta;

export const BasicError = {
    args: {
        error: { errorMessage: 'Streaming failed: 503 Service Unavailable' },
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByText('Streaming failed: 503 Service Unavailable')).toBeVisible();
    },
};

export const WithRequestDetails = {
    args: {
        error: {
            errorMessage: 'Request failed',
            requestMethod: 'POST',
            requestUri: '/api/chats/users/42',
        },
    },
};

export const WithStackTrace = {
    args: {
        error: {
            errorMessage: 'Unexpected token in JSON',
            name: 'SyntaxError',
            stack: 'SyntaxError: Unexpected token in JSON\n    at parseSseStream (parseSseStream.js:12)',
        },
    },
};
