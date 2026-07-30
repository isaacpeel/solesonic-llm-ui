import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

vi.mock('../../src/client/ApiClient.js', () => ({
    default: {
        post: vi.fn(),
        getBlob: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../../src/properties/ApplicationProperties', () => ({
    default: {attachmentsUri: 'http://api.test/attachments'},
}));

import attachmentService from '../../src/service/AttachmentService.js';
import apiClient from '../../src/client/ApiClient.js';

class FakeFormData {
    constructor() {
        this.entries = [];
    }

    append(name, value) {
        this.entries.push([name, value]);
    }

    get(name) {
        const entry = this.entries.find(([entryName]) => entryName === name);

        return entry ? entry[1] : null;
    }

    has(name) {
        return this.entries.some(([entryName]) => entryName === name);
    }
}

beforeEach(() => {
    vi.stubGlobal('FormData', FakeFormData);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('stageAttachment', () => {
    it('posts FormData carrying the file to the attachments URI', async () => {
        apiClient.post.mockResolvedValue({id: 'attachment-1'});
        const file = {name: 'screenshot.png'};

        const result = await attachmentService.stageAttachment(file);

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        const [calledUri, calledBody] = apiClient.post.mock.calls[0];
        expect(calledUri).toBe('http://api.test/attachments');
        expect(calledBody).toBeInstanceOf(FakeFormData);
        expect(calledBody.get('file')).toBe(file);
        expect(result).toEqual({id: 'attachment-1'});
    });

    it('appends a trimmed description when one is supplied', async () => {
        apiClient.post.mockResolvedValue({id: 'attachment-1'});

        await attachmentService.stageAttachment({name: 'a.png'}, '  the error banner  ');

        expect(apiClient.post.mock.calls[0][1].get('description')).toBe('the error banner');
    });

    it('omits description when it is missing or blank', async () => {
        apiClient.post.mockResolvedValue({id: 'attachment-1'});

        await attachmentService.stageAttachment({name: 'a.png'});
        await attachmentService.stageAttachment({name: 'b.png'}, '   ');

        expect(apiClient.post.mock.calls[0][1].has('description')).toBe(false);
        expect(apiClient.post.mock.calls[1][1].has('description')).toBe(false);
    });
});

describe('fetchAttachmentBlob', () => {
    it('reads through the blob path of the client', async () => {
        const responseBlob = {size: 10};
        apiClient.getBlob.mockResolvedValue(responseBlob);

        const result = await attachmentService.fetchAttachmentBlob('attachment-1');

        expect(apiClient.getBlob).toHaveBeenCalledWith('http://api.test/attachments/attachment-1');
        expect(result).toBe(responseBlob);
    });
});

describe('deleteAttachment', () => {
    it('deletes the id URI', async () => {
        apiClient.delete.mockResolvedValue(null);

        await attachmentService.deleteAttachment('attachment-1');

        expect(apiClient.delete).toHaveBeenCalledWith('http://api.test/attachments/attachment-1');
    });
});

describe('attachmentExists', () => {
    it('is true when the blob resolves', async () => {
        apiClient.getBlob.mockResolvedValue({size: 10});

        await expect(attachmentService.attachmentExists('attachment-1')).resolves.toBe(true);
    });

    it('is false when the noOp request returns null', async () => {
        apiClient.getBlob.mockResolvedValue(null);

        await expect(attachmentService.attachmentExists('attachment-1')).resolves.toBe(false);
        expect(apiClient.getBlob).toHaveBeenCalledWith('http://api.test/attachments/attachment-1', {noOp: true});
    });
});
