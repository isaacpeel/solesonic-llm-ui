import PropTypes from 'prop-types';
import {
    ArrowDownTrayIcon,
    ArrowLeftIcon,
    ChatBubbleLeftRightIcon,
    PencilSquareIcon,
    ShareIcon,
    TrashIcon,
} from '@heroicons/react/20/solid';
import ChatHeader, {ChatHeaderMenu} from './ChatHeader.jsx';

function SampleBackButton() {
    return (
        <button
            type="button"
            className="chat-header-icon-button"
            aria-label="Back to chats"
            title="Back"
        >
            <ArrowLeftIcon aria-hidden="true"/>
        </button>
    );
}

function SampleMenuContent({close}) {
    return (
        <>
            <div className="chat-header-section-label">Conversation</div>
            <button
                type="button"
                className="chat-header-action"
                onClick={() => close?.()}
            >
                <PencilSquareIcon aria-hidden="true"/>
                <span>Rename</span>
            </button>
            <button
                type="button"
                className="chat-header-action"
                onClick={() => close?.()}
            >
                <ShareIcon aria-hidden="true"/>
                <span>Share chat</span>
            </button>
            <button
                type="button"
                className="chat-header-action"
                onClick={() => close?.()}
            >
                <ArrowDownTrayIcon aria-hidden="true"/>
                <span>Export transcript</span>
            </button>
            <div className="chat-header-divider"/>
            <button
                type="button"
                className="chat-header-action chat-header-action--danger"
                onClick={() => close?.()}
            >
                <TrashIcon aria-hidden="true"/>
                <span>Delete chat</span>
            </button>
        </>
    );
}

SampleMenuContent.propTypes = {
    close: PropTypes.func,
};

export default {
    title: 'Chat/Header/ChatHeader',
    component: ChatHeader,
    decorators: [
        (Story) => (
            <div style={{width: '100%', maxWidth: 640, margin: '0 auto', padding: 16}}>
                <Story/>
            </div>
        ),
    ],
};

export const Default = {
    args: {
        title: 'New conversation',
    },
};

export const WithSubtitle = {
    args: {
        title: 'Optimizing React Rendering',
        subtitle: 'Claude 3.5 Sonnet',
    },
};

export const Busy = {
    args: {
        title: 'Analyzing repository structure',
        subtitle: 'Generating response…',
        busy: true,
    },
};

export const WithLeadingAndTrailing = {
    args: {
        title: 'Project Roadmap & Milestones',
        subtitle: 'Updated 5 minutes ago',
        leading: <SampleBackButton/>,
        trailing: (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                    opacity: 0.7,
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid var(--border-color)',
                }}
            >
                <ChatBubbleLeftRightIcon style={{width: 14, height: 14}} aria-hidden="true"/>
                <span>12 msgs</span>
            </span>
        ),
    },
};

export const WithHeaderMenu = {
    args: {
        title: 'Refactoring Architecture',
        subtitle: 'Claude 3.5 Sonnet',
        children: (
            <ChatHeaderMenu label="Chat options">
                {({close}) => <SampleMenuContent close={close}/>}
            </ChatHeaderMenu>
        ),
    },
};

export const HeaderMenuOpen = {
    args: {
        title: 'Refactoring Architecture',
        subtitle: 'Claude 3.5 Sonnet',
        children: (
            <ChatHeaderMenu label="Chat options">
                {({close}) => <SampleMenuContent close={close}/>}
            </ChatHeaderMenu>
        ),
    },
    play: async ({canvasElement}) => {
        const menuButton = canvasElement.querySelector('.chat-header-icon-button[aria-haspopup="true"]');
        menuButton?.click();
    },
};

export const WithRename = {
    args: {
        title: 'Click title to rename',
        subtitle: 'Claude 3.5 Sonnet',
        rename: {
            initialValue: 'Click title to rename',
            placeholder: 'Name this conversation',
            onRename: async () => {},
        },
    },
};

export const RenameEditing = {
    args: {
        title: 'Editable conversation title',
        subtitle: 'Claude 3.5 Sonnet',
        rename: {
            initialValue: 'Editable conversation title',
            placeholder: 'Name this conversation',
            onRename: async () => {},
        },
    },
    play: async ({canvasElement}) => {
        const titleButton = canvasElement.querySelector('.chat-header-name-button');
        titleButton?.click();
    },
};

export const LongTitle = {
    args: {
        title: 'A very long conversation title that demonstrates how the chat header gracefully handles overflow with ellipsis',
        subtitle: 'Claude 3.5 Sonnet • 45 messages in thread',
        leading: <SampleBackButton/>,
        children: (
            <ChatHeaderMenu label="Chat options">
                {({close}) => <SampleMenuContent close={close}/>}
            </ChatHeaderMenu>
        ),
    },
};
