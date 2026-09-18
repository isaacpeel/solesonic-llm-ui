import MessageCopyButton from './MessageCopyButton.jsx';

/*
 * A minimal example of a component with internal state and a real (not mocked) browser API
 * call — clicking the button in the Storybook canvas actually writes to the clipboard.
 */
export default {
    title: 'Chat/MessageCopyButton',
    component: MessageCopyButton,
};

export const Default = {
    args: {
        text: 'Here is the markdown that gets copied.',
    },
};

export const LongMarkdown = {
    args: {
        text: '## Heading\n\n- one\n- two\n\n`code span`',
    },
};
