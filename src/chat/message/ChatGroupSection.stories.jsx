import { expect, fn } from 'storybook/test';
import ChatGroupSection from './ChatGroupSection.jsx';
import { CHAT_GROUP_EMPTY_ROW, CHAT_GROUP_HEADER_ROW, CHAT_GROUP_LOAD_MORE_ROW } from '../../util/chatHistoryRows.js';

const NO_OP_DRAG_HANDLE_PROPS = () => ({});

const meta = {
    component: ChatGroupSection,
    tags: ['ai-generated'],
};

export default meta;

export const HeaderCollapsed = {
    args: {
        row: { type: CHAT_GROUP_HEADER_ROW, chatGroupId: 'group-1', label: 'Travel', fullLabel: 'Travel', count: 4, expanded: false },
        onToggle: fn(),
        onLoadMore: fn(),
        onRenameGroup: fn(),
        onDeleteGroup: fn(),
        renaming: false,
        renameSeed: { value: '', attempt: 0 },
        onRenameCommit: fn(),
        onRenameCancel: fn(),
        dragHandleProps: NO_OP_DRAG_HANDLE_PROPS,
        onDragHandleKeyDown: fn(),
    },
    play: async ({ canvasElement, userEvent, args }) => {
        const headerButton = canvasElement.querySelector('.chat-group-header');

        await expect(headerButton).toHaveAttribute('aria-expanded', 'false');
        await expect(headerButton).toHaveTextContent('4');

        await userEvent.click(headerButton);
        await expect(args.onToggle).toHaveBeenCalledWith('group-1');
    },
};

export const HeaderRenaming = {
    args: {
        row: { type: CHAT_GROUP_HEADER_ROW, chatGroupId: 'group-1', label: 'Travel', fullLabel: 'Travel', count: 4, expanded: true },
        onToggle: fn(),
        onLoadMore: fn(),
        onRenameGroup: fn(),
        onDeleteGroup: fn(),
        renaming: true,
        renameSeed: { value: 'Travel', attempt: 1 },
        onRenameCommit: fn(),
        onRenameCancel: fn(),
        dragHandleProps: NO_OP_DRAG_HANDLE_PROPS,
        onDragHandleKeyDown: fn(),
    },
    play: async ({ canvas }) => {
        await expect(canvas.getByLabelText('Group name')).toHaveValue('Travel');
    },
};

export const EmptyRow = {
    args: {
        row: { type: CHAT_GROUP_EMPTY_ROW, label: 'No conversations in this group yet.' },
        onToggle: fn(),
        onLoadMore: fn(),
        onRenameGroup: fn(),
        onDeleteGroup: fn(),
        renaming: false,
        renameSeed: { value: '', attempt: 0 },
        onRenameCommit: fn(),
        onRenameCancel: fn(),
        dragHandleProps: NO_OP_DRAG_HANDLE_PROPS,
        onDragHandleKeyDown: fn(),
    },
};

export const LoadMoreRow = {
    args: {
        row: { type: CHAT_GROUP_LOAD_MORE_ROW, chatGroupId: 'group-1', label: 'Load more…', loading: false },
        onToggle: fn(),
        onLoadMore: fn(),
        onRenameGroup: fn(),
        onDeleteGroup: fn(),
        renaming: false,
        renameSeed: { value: '', attempt: 0 },
        onRenameCommit: fn(),
        onRenameCancel: fn(),
        dragHandleProps: NO_OP_DRAG_HANDLE_PROPS,
        onDragHandleKeyDown: fn(),
    },
    play: async ({ canvas, userEvent, args }) => {
        await userEvent.click(canvas.getByRole('button', { name: 'Load more…' }));
        await expect(args.onLoadMore).toHaveBeenCalledWith('group-1');
    },
};
