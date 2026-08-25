import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, fireEvent, waitFor} from '@testing-library/react';

vi.mock('../../src/service/ChatGroupService.js', () => ({
    default: {
        createGroup: vi.fn(),
    },
}));

vi.mock('loglevel', () => ({
    default: {error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn()},
}));

import CreateChatGroupDialog from '../../src/chat/message/CreateChatGroupDialog.jsx';
import chatGroupService from '../../src/service/ChatGroupService.js';

/* Portalled to document.body, so nothing this component renders is inside the render container. */
function dialogElements() {
    return {
        form: document.body.querySelector('.create-chat-group-dialog'),
        input: document.body.querySelector('.create-chat-group-input'),
        cancelButton: document.body.querySelector('.create-chat-group-cancel'),
        confirmButton: document.body.querySelector('.create-chat-group-confirm'),
        error: document.body.querySelector('.create-chat-group-dialog-error'),
    };
}

function renderDialog() {
    const onCancel = vi.fn();
    const onCreated = vi.fn();

    render(<CreateChatGroupDialog onCancel={onCancel} onCreated={onCreated}/>);

    return {onCancel, onCreated};
}

beforeEach(() => {
    chatGroupService.createGroup.mockReset();
    chatGroupService.createGroup.mockResolvedValue({id: 'group-1', name: 'Work'});
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('CreateChatGroupDialog', () => {
    it('caps the name at the length the server accepts', () => {
        renderDialog();

        expect(dialogElements().input.maxLength).toBe(255);
    });

    it('disables Create until the name has something in it', () => {
        renderDialog();

        expect(dialogElements().confirmButton.disabled).toBe(true);

        fireEvent.change(dialogElements().input, {target: {value: '   '}});
        expect(dialogElements().confirmButton.disabled).toBe(true);

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        expect(dialogElements().confirmButton.disabled).toBe(false);
    });

    it('submits the trimmed name and hands the created group back', async () => {
        const {onCreated} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: '  Work  '}});
        fireEvent.submit(dialogElements().form);

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith({id: 'group-1', name: 'Work'}));
        expect(chatGroupService.createGroup).toHaveBeenCalledTimes(1);
        expect(chatGroupService.createGroup).toHaveBeenCalledWith('Work');
    });

    it('issues no request on Cancel', () => {
        const {onCancel, onCreated} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        fireEvent.click(dialogElements().cancelButton);

        expect(onCancel).toHaveBeenCalled();
        expect(onCreated).not.toHaveBeenCalled();
        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
    });

    it('issues no request on Escape', () => {
        const {onCancel} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        fireEvent.keyDown(dialogElements().input, {key: 'Escape'});

        expect(onCancel).toHaveBeenCalled();
        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
    });

    it('does not submit a name that is only whitespace', () => {
        renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: '   '}});
        fireEvent.submit(dialogElements().form);

        expect(chatGroupService.createGroup).not.toHaveBeenCalled();
    });

    it('keeps the dialog open with an inline error when the create is rejected', async () => {
        chatGroupService.createGroup.mockRejectedValue(Object.assign(new Error('400'), {status: 400}));

        const {onCreated} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        fireEvent.submit(dialogElements().form);

        await waitFor(() => expect(dialogElements().error).not.toBeNull());
        expect(onCreated).not.toHaveBeenCalled();
        /* What the user typed survives, so the name can be corrected rather than retyped. */
        expect(dialogElements().input.value).toBe('Work');
        expect(dialogElements().confirmButton.disabled).toBe(false);
    });

    it('disables both buttons while the request is in flight', async () => {
        let releaseCreate;
        chatGroupService.createGroup.mockImplementation(() => new Promise(resolve => {
            releaseCreate = () => resolve({id: 'group-1', name: 'Work'});
        }));

        const {onCreated} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        fireEvent.submit(dialogElements().form);

        await waitFor(() => expect(dialogElements().confirmButton.disabled).toBe(true));
        expect(dialogElements().cancelButton.disabled).toBe(true);

        releaseCreate();
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });

    it('issues one request even when the form is submitted twice', async () => {
        const {onCreated} = renderDialog();

        fireEvent.change(dialogElements().input, {target: {value: 'Work'}});
        fireEvent.submit(dialogElements().form);
        fireEvent.submit(dialogElements().form);

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(chatGroupService.createGroup).toHaveBeenCalledTimes(1);
    });
});
