import {render, waitFor, fireEvent} from '@testing-library/react';
import {describe, it, vi, expect, beforeEach} from 'vitest';
import RagManagement from '../../src/train/RagManagement.jsx';

vi.mock('../../src/service/DocumentService.js', () => ({
    default: {
        findIngestedDocuments: vi.fn(),
        uploadDocument: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    },
}));

import documentService from '../../src/service/DocumentService.js';

describe('RagManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue([]);
        documentService.uploadDocument.mockResolvedValue(undefined);
    });

    it('renders the file upload area', async () => {
        const {container, getByText} = render(<RagManagement/>);

        await waitFor(() => {
            expect(container.querySelector('.rag-dropzone')).not.toBeNull();
            expect(getByText('Upload File')).toBeDefined();
        });
    });

    it('selecting a file displays the filename', async () => {
        const {container, getByText} = render(<RagManagement/>);

        await waitFor(() => expect(container.querySelector('#fileInput')).not.toBeNull());

        const fileInput = container.querySelector('#fileInput');
        const mockFile = new File(['content'], 'document.pdf', {type: 'application/pdf'});
        fireEvent.change(fileInput, {target: {files: [mockFile]}});

        await waitFor(() => {
            expect(getByText('document.pdf')).toBeDefined();
        });
    });

    it('submitting without a file shows an error message', async () => {
        const {container, getByText} = render(<RagManagement/>);

        await waitFor(() => expect(container.querySelector('form')).not.toBeNull());

        fireEvent.submit(container.querySelector('form'));

        await waitFor(() => {
            expect(getByText(/Select a file before uploading/)).toBeDefined();
        });
    });

    it('successful upload shows confirmation message', async () => {
        const {container, getByText} = render(<RagManagement/>);

        await waitFor(() => expect(container.querySelector('#fileInput')).not.toBeNull());

        const fileInput = container.querySelector('#fileInput');
        const mockFile = new File(['content'], 'report.pdf', {type: 'application/pdf'});
        fireEvent.change(fileInput, {target: {files: [mockFile]}});

        fireEvent.click(getByText('Upload File'));

        await waitFor(() => {
            expect(getByText('File uploaded successfully!')).toBeDefined();
        });
    });

    it('renders existing ingested documents', async () => {
        documentService.findIngestedDocuments.mockResolvedValue([
            {id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'},
            {id: 'doc-2', fileName: 'manual.pdf', documentStatus: 'IN_PROGRESS'},
        ]);

        const {getByText} = render(<RagManagement/>);

        await waitFor(() => {
            expect(getByText('guide.pdf')).toBeDefined();
            expect(getByText('manual.pdf')).toBeDefined();
            expect(getByText('COMPLETED')).toBeDefined();
        });
    });
});
