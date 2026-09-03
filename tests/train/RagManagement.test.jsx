import {render, waitFor, fireEvent, screen, act} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {describe, it, vi, expect, beforeEach} from 'vitest';

import RagManagement from '../../src/train/RagManagement.jsx';
import {useKeycloak} from '../../src/providers/KeycloakProvider.jsx';
import {useSharedData} from '../../src/context/useSharedData.jsx';

vi.mock('../../src/service/DocumentService.js', () => ({
    default: {
        findIngestedDocuments: vi.fn(),
        uploadDocument: vi.fn(),
        deleteIngestedDocument: vi.fn(),
        refreshIngestedDocument: vi.fn(),
        processDocumentQueue: vi.fn(),
    },
}));

vi.mock('../../src/service/UserPreferencesService.js', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
    },
}));

vi.mock('../../src/service/AuthService.js', () => ({
    default: {
        getAccessToken: vi.fn().mockResolvedValue('mock-token'),
        getUserId: vi.fn().mockResolvedValue('user-7'),
    },
}));

vi.mock('../../src/providers/KeycloakProvider.jsx', () => ({
    useKeycloak: vi.fn(),
}));

vi.mock('../../src/context/useSharedData.jsx', () => ({
    useSharedData: vi.fn(),
}));

import documentService from '../../src/service/DocumentService.js';
import userPreferencesService from '../../src/service/UserPreferencesService.js';

const RAG_ADMIN = 'rag-admin';

// A disconnected observer must stop firing, so that unmounting the sentinel really does stop
// paging. A no-op disconnect would let a stale callback keep requesting pages.
let liveObservers = new Set();

class FakeIntersectionObserver {
    constructor(callback) {
        this.callback = callback;
    }

    observe() {
        liveObservers.add(this);
    }

    unobserve() {
        liveObservers.delete(this);
    }

    disconnect() {
        liveObservers.delete(this);
    }
}

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

const scrollToSentinel = async () => {
    await act(async () => {
        liveObservers.forEach((observer) => observer.callback([{isIntersecting: true}]));
    });
};

const pagedDocuments = (content, {number = 0, totalPages = 1} = {}) => ({
    content,
    page: {size: 20, number, totalElements: content.length, totalPages},
});

const notFoundError = () => {
    const caughtError = new Error('404: GET - /chats/chat-42/documents Not Found');
    caughtError.status = 404;
    return caughtError;
};

function asUser({roles = [], chatId = 'chat-1'} = {}) {
    useKeycloak.mockReturnValue({hasRole: (role) => roles.includes(role)});
    useSharedData.mockReturnValue({chatId});
}

function renderRag(level) {
    return render(
        <MemoryRouter initialEntries={[`/settings/rag/${level}`]}>
            <Routes>
                <Route path="/settings/rag/:level" element={<RagManagement/>}/>
            </Routes>
        </MemoryRouter>
    );
}

const tabLabels = () => Array.from(document.querySelectorAll('.rag-tab'))
    .map((tab) => tab.textContent.trim());

const documentRows = () => Array.from(document.querySelectorAll('.rag-file-processing-row-filename'))
    .map((row) => row.textContent.trim());

beforeEach(() => {
    liveObservers = new Set();
});

describe('RagManagement level tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([]));
        documentService.uploadDocument.mockResolvedValue(undefined);
        userPreferencesService.get.mockResolvedValue({});
        userPreferencesService.patch.mockResolvedValue({});
    });

    it('shows only Chat and User to a non-admin', async () => {
        asUser({roles: []});

        renderRag('user');

        await waitFor(() => expect(tabLabels()).toEqual(['Chat', 'User']));
    });

    it('shows a Global tab to a rag-admin', async () => {
        asUser({roles: [RAG_ADMIN]});

        renderRag('user');

        await waitFor(() => expect(tabLabels().length).toBe(3));
        expect(tabLabels()[2]).toContain('Global');
    });

    it('redirects a non-admin away from the global level', async () => {
        asUser({roles: []});

        renderRag('global');

        await waitFor(() => {
            expect(screen.getByText('Documents in this chat')).toBeDefined();
        });
    });

    it('redirects an unknown level to the default level', async () => {
        asUser({roles: [RAG_ADMIN]});

        renderRag('nonsense');

        await waitFor(() => {
            expect(screen.getByText('Documents in this chat')).toBeDefined();
        });
    });
});

describe('RagManagement document scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([]));
        documentService.uploadDocument.mockResolvedValue(undefined);
        documentService.deleteIngestedDocument.mockResolvedValue(null);
        documentService.refreshIngestedDocument.mockResolvedValue(null);
        userPreferencesService.get.mockResolvedValue({});
        userPreferencesService.patch.mockResolvedValue({});
    });

    it('requests the USER collection on the user level', async () => {
        asUser({roles: []});

        renderRag('user');

        await waitFor(() => {
            expect(documentService.findIngestedDocuments).toHaveBeenCalledWith('USER', {chatId: null}, 0, 20);
        });
    });

    it('requests the GLOBAL collection on the global level', async () => {
        asUser({roles: [RAG_ADMIN]});

        renderRag('global');

        await waitFor(() => {
            expect(documentService.findIngestedDocuments).toHaveBeenCalledWith('GLOBAL', {chatId: null}, 0, 20);
        });
    });

    it('requests the CHAT collection for the active chat', async () => {
        asUser({roles: [], chatId: 'chat-42'});

        renderRag('chat');

        await waitFor(() => {
            expect(documentService.findIngestedDocuments).toHaveBeenCalledWith('CHAT', {chatId: 'chat-42'}, 0, 20);
        });
    });

    it('does not request chat documents when there is no active chat', async () => {
        asUser({roles: [], chatId: null});

        renderRag('chat');

        await waitFor(() => {
            expect(screen.getByText('Start a chat before attaching documents to it.')).toBeDefined();
        });

        expect(documentService.findIngestedDocuments).not.toHaveBeenCalled();
    });

    it('uploads to the collection for the active scope', async () => {
        asUser({roles: []});

        const {container} = renderRag('user');

        await waitFor(() => expect(container.querySelector('#fileInput')).not.toBeNull());

        const mockFile = new File(['content'], 'report.pdf', {type: 'application/pdf'});
        fireEvent.change(container.querySelector('#fileInput'), {target: {files: [mockFile]}});
        fireEvent.click(screen.getByText('Upload File'));

        await waitFor(() => {
            expect(documentService.uploadDocument).toHaveBeenCalledWith(
                expect.anything(),
                'USER',
                {chatId: null},
            );
        });
    });

    it('deletes within the collection for the active scope', async () => {
        asUser({roles: [], chatId: 'chat-42'});
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([
            {id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'},
        ]));

        renderRag('chat');

        await waitFor(() => expect(screen.getByLabelText('Delete guide.pdf')).toBeDefined());

        fireEvent.click(screen.getByLabelText('Delete guide.pdf'));

        await waitFor(() => {
            expect(documentService.deleteIngestedDocument).toHaveBeenCalledWith(
                'doc-1',
                'CHAT',
                {chatId: 'chat-42'},
            );
        });
    });

    it('refreshes within the collection for the active scope', async () => {
        asUser({roles: []});
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([
            {id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'},
        ]));

        renderRag('user');

        await waitFor(() => expect(screen.getByLabelText('Refresh guide.pdf')).toBeDefined());

        fireEvent.click(screen.getByLabelText('Refresh guide.pdf'));

        await waitFor(() => {
            expect(documentService.refreshIngestedDocument).toHaveBeenCalledWith(
                'doc-1',
                'USER',
                {chatId: null},
            );
        });
    });
});

describe('RagManagement chat ownership failures', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        userPreferencesService.get.mockResolvedValue({});
    });

    it('shows one message for a chat 404 without saying which thing was missing', async () => {
        asUser({roles: [], chatId: 'chat-42'});
        documentService.findIngestedDocuments.mockRejectedValue(notFoundError());

        renderRag('chat');

        await waitFor(() => {
            expect(screen.getByText("This conversation's documents are unavailable.")).toBeDefined();
        });

        expect(screen.queryByText(/chat-42/)).toBeNull();
    });

    it('still reports other failures with their detail', async () => {
        asUser({roles: []});
        documentService.findIngestedDocuments.mockRejectedValue(new Error('network down'));

        renderRag('user');

        await waitFor(() => {
            expect(screen.getByText(/network down/)).toBeDefined();
        });
    });
});

describe('RagManagement infinite scrolling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        userPreferencesService.get.mockResolvedValue({});
    });

    it('appends the next page when the sentinel comes into view', async () => {
        asUser({roles: []});
        documentService.findIngestedDocuments.mockImplementation(async (scope, identifiers, page) => {
            if (page === 0) {
                return pagedDocuments(
                    [{id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'}],
                    {number: 0, totalPages: 2},
                );
            }

            return pagedDocuments(
                [{id: 'doc-2', fileName: 'manual.pdf', documentStatus: 'COMPLETED'}],
                {number: 1, totalPages: 2},
            );
        });

        renderRag('user');

        await waitFor(() => expect(screen.getByText('guide.pdf')).toBeDefined());

        await scrollToSentinel();

        await waitFor(() => expect(screen.getByText('manual.pdf')).toBeDefined());

        expect(documentService.findIngestedDocuments).toHaveBeenCalledWith('USER', {chatId: null}, 1, 20);
        expect(documentRows()).toEqual(['guide.pdf', 'manual.pdf']);
    });

    it('renders no sentinel once the last page is loaded', async () => {
        asUser({roles: []});
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments(
            [{id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'}],
            {number: 0, totalPages: 1},
        ));

        const {container} = renderRag('user');

        await waitFor(() => expect(screen.getByText('guide.pdf')).toBeDefined());

        expect(container.querySelector('.rag-file-processing-sentinel')).toBeNull();
    });

    it('stops requesting further pages once every page is loaded', async () => {
        asUser({roles: []});
        documentService.findIngestedDocuments.mockImplementation(async (scope, identifiers, page) => pagedDocuments(
            [{id: `doc-${page}`, fileName: `page-${page}.pdf`, documentStatus: 'COMPLETED'}],
            {number: page, totalPages: 2},
        ));

        renderRag('user');

        await waitFor(() => expect(screen.getByText('page-0.pdf')).toBeDefined());

        await scrollToSentinel();

        await waitFor(() => expect(screen.getByText('page-1.pdf')).toBeDefined());

        const callCountAfterLastPage = documentService.findIngestedDocuments.mock.calls.length;

        await scrollToSentinel();

        expect(documentService.findIngestedDocuments.mock.calls.length).toBe(callCountAfterLastPage);
    });

    it('starts over when the level changes', async () => {
        asUser({roles: [], chatId: 'chat-42'});
        documentService.findIngestedDocuments.mockImplementation(async (scope) => {
            if (scope === 'USER') {
                return pagedDocuments([{id: 'doc-1', fileName: 'mine.pdf', documentStatus: 'COMPLETED'}]);
            }

            return pagedDocuments([{id: 'doc-2', fileName: 'theirs.pdf', documentStatus: 'COMPLETED'}]);
        });

        renderRag('user');

        await waitFor(() => expect(documentRows()).toEqual(['mine.pdf']));

        fireEvent.click(screen.getByText('Chat'));

        await waitFor(() => expect(documentRows()).toEqual(['theirs.pdf']));
    });
});

describe('RagManagement first page refresh', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        userPreferencesService.get.mockResolvedValue({});
        documentService.refreshIngestedDocument.mockResolvedValue(null);
    });

    it('updates a status in place rather than duplicating the row', async () => {
        asUser({roles: []});

        let documentStatus = 'QUEUED';
        documentService.findIngestedDocuments.mockImplementation(async () => pagedDocuments(
            [{id: 'doc-1', fileName: 'guide.pdf', documentStatus}],
        ));

        renderRag('user');

        await waitFor(() => expect(screen.getByText('QUEUED')).toBeDefined());

        documentStatus = 'COMPLETED';
        fireEvent.click(screen.getByLabelText('Refresh guide.pdf'));

        await waitFor(() => expect(screen.getByText('COMPLETED')).toBeDefined());

        expect(documentRows()).toEqual(['guide.pdf']);
    });

    it('prepends a newly ingested document without dropping the loaded pages', async () => {
        asUser({roles: []});

        let content = [{id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'}];
        documentService.findIngestedDocuments.mockImplementation(async () => pagedDocuments(content));
        documentService.uploadDocument.mockResolvedValue(undefined);

        const {container} = renderRag('user');

        await waitFor(() => expect(documentRows()).toEqual(['guide.pdf']));

        content = [
            {id: 'doc-2', fileName: 'fresh.pdf', documentStatus: 'QUEUED'},
            {id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'},
        ];

        const mockFile = new File(['content'], 'fresh.pdf', {type: 'application/pdf'});
        fireEvent.change(container.querySelector('#fileInput'), {target: {files: [mockFile]}});
        fireEvent.click(screen.getByText('Upload File'));

        await waitFor(() => expect(documentRows()).toEqual(['fresh.pdf', 'guide.pdf']));
    });
});

describe('RagManagement queue control', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([]));
        userPreferencesService.get.mockResolvedValue({});
    });

    it('is hidden from a non-admin on the user level', async () => {
        asUser({roles: []});

        renderRag('user');

        await waitFor(() => expect(screen.getByText('Your documents')).toBeDefined());
        expect(screen.queryByLabelText('Process document queue')).toBeNull();
    });

    it('is hidden from an admin outside the global level', async () => {
        asUser({roles: [RAG_ADMIN]});

        renderRag('user');

        await waitFor(() => expect(screen.getByText('Your documents')).toBeDefined());
        expect(screen.queryByLabelText('Process document queue')).toBeNull();
    });

    it('is shown to an admin on the global level', async () => {
        asUser({roles: [RAG_ADMIN]});

        renderRag('global');

        await waitFor(() => expect(screen.getByLabelText('Process document queue')).toBeDefined());
    });
});

describe('RagManagement threshold', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([]));
        userPreferencesService.patch.mockResolvedValue({});
    });

    it('loads the threshold for the active level', async () => {
        asUser({roles: []});
        userPreferencesService.get.mockResolvedValue({userSimilarityThreshold: 0.42});

        renderRag('user');

        await waitFor(() => {
            expect(document.querySelector('#similarityThreshold').value).toBe('0.42');
        });
    });

    it('patches only the field for the active level', async () => {
        asUser({roles: []});
        userPreferencesService.get.mockResolvedValue({userSimilarityThreshold: 0.5});

        renderRag('user');

        await waitFor(() => expect(document.querySelector('#similarityThreshold')).not.toBeNull());

        fireEvent.change(document.querySelector('#similarityThreshold'), {target: {value: '0.8'}});
        fireEvent.submit(document.querySelector('.rag-threshold-form'));

        await waitFor(() => {
            expect(userPreferencesService.patch).toHaveBeenCalledWith({userSimilarityThreshold: 0.8});
        });
    });
});

describe('RagManagement uploads and listing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([]));
        documentService.uploadDocument.mockResolvedValue(undefined);
        userPreferencesService.get.mockResolvedValue({});
        asUser({roles: []});
    });

    it('renders the file upload area', async () => {
        const {container} = renderRag('user');

        await waitFor(() => {
            expect(container.querySelector('.rag-dropzone')).not.toBeNull();
            expect(screen.getByText('Upload File')).toBeDefined();
        });
    });

    it('selecting a file displays the filename', async () => {
        const {container} = renderRag('user');

        await waitFor(() => expect(container.querySelector('#fileInput')).not.toBeNull());

        const mockFile = new File(['content'], 'document.pdf', {type: 'application/pdf'});
        fireEvent.change(container.querySelector('#fileInput'), {target: {files: [mockFile]}});

        await waitFor(() => expect(screen.getByText('document.pdf')).toBeDefined());
    });

    it('submitting without a file shows an error message', async () => {
        const {container} = renderRag('user');

        await waitFor(() => expect(container.querySelector('.rag-dropzone')).not.toBeNull());

        fireEvent.submit(container.querySelector('.rag-dropzone').closest('form'));

        await waitFor(() => {
            expect(screen.getByText(/Select a file before uploading/)).toBeDefined();
        });
    });

    it('successful upload shows confirmation message', async () => {
        const {container} = renderRag('user');

        await waitFor(() => expect(container.querySelector('#fileInput')).not.toBeNull());

        const mockFile = new File(['content'], 'report.pdf', {type: 'application/pdf'});
        fireEvent.change(container.querySelector('#fileInput'), {target: {files: [mockFile]}});
        fireEvent.click(screen.getByText('Upload File'));

        await waitFor(() => {
            expect(screen.getByText('File uploaded successfully!')).toBeDefined();
        });
    });

    it('renders the content of a paged listing', async () => {
        documentService.findIngestedDocuments.mockResolvedValue(pagedDocuments([
            {id: 'doc-1', fileName: 'guide.pdf', documentStatus: 'COMPLETED'},
            {id: 'doc-2', fileName: 'manual.pdf', documentStatus: 'IN_PROGRESS'},
        ]));

        renderRag('user');

        await waitFor(() => {
            expect(screen.getByText('guide.pdf')).toBeDefined();
            expect(screen.getByText('manual.pdf')).toBeDefined();
            expect(screen.getByText('COMPLETED')).toBeDefined();
        });
    });
});
