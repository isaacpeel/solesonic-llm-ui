import { expect } from 'storybook/test';
import MessageCopyButton from './MessageCopyButton.jsx';

const meta = {
    component: MessageCopyButton,
    tags: ['ai-generated'],
};

export default meta;

export const Default = {
    args: {
        text: 'Here is the answer in **markdown**.',
    },
    play: async ({ canvas }) => {
        const button = canvas.getByRole('button', { name: 'Copy message as markdown' });
        await expect(button).toHaveAttribute('title', 'Copy as markdown');
    },
};

export const LongMarkdown = {
    args: {
        text: '# Report\n\n- item one\n- item two\n\n```js\nconsole.log("hi");\n```',
    },
};
