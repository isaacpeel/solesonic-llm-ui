import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen, fireEvent} from '@testing-library/react';

vi.mock('../../src/hooks/useGeneratedImageUrl.js', () => ({
    default: vi.fn(),
}));

import GeneratedImage from '../../src/image/GeneratedImage.jsx';
import useGeneratedImageUrl from '../../src/hooks/useGeneratedImageUrl.js';

const COMPLETED_IMAGE = {
    imageId: 'image-1',
    imageUrl: '/api/images/image-1',
    prompt: 'a lighthouse on a cliff in a storm',
    seed: 8339331079448168597n.toString(),
    width: 1024,
    height: 1024,
    steps: 4,
    elapsedSeconds: 8.2,
};

beforeEach(() => {
    useGeneratedImageUrl.mockReturnValue({objectUrl: 'blob:image-1', loading: false, error: null});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('GeneratedImage', () => {
    it('renders nothing without an image id', () => {
        const {container} = render(<GeneratedImage image={{prompt: 'a lighthouse'}}/>);

        expect(container.firstChild).toBeNull();
    });

    it('uses the prompt as alt text', () => {
        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.getByAltText('a lighthouse on a cliff in a storm')).toBeTruthy();
    });

    it('falls back to a generic alt when there is no prompt', () => {
        render(<GeneratedImage image={{...COMPLETED_IMAGE, prompt: ''}}/>);

        expect(screen.getByAltText('Generated image')).toBeTruthy();
    });

    it('reserves the square frame before the bytes arrive', () => {
        useGeneratedImageUrl.mockReturnValue({objectUrl: null, loading: true, error: null});

        const {container} = render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(container.querySelector('.generated-image-frame')).toBeTruthy();
        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByLabelText('Loading image')).toBeTruthy();
    });

    it('renders a message rather than a broken image when the URL 404s', () => {
        useGeneratedImageUrl.mockReturnValue({objectUrl: null, loading: false, error: 'missing'});

        const {container} = render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(container.querySelector('img')).toBeNull();
        expect(screen.getByText('This image is no longer available.')).toBeTruthy();
    });

    it('lazy-loads the picture', () => {
        const {container} = render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(container.querySelector('img').getAttribute('loading')).toBe('lazy');
    });

    it('keeps seed and elapsed time behind a details toggle', () => {
        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.queryByText('Seed')).toBeNull();

        fireEvent.click(screen.getByText('Details'));

        expect(screen.getByText('Seed')).toBeTruthy();
        expect(screen.getByText('8339331079448168597')).toBeTruthy();
        expect(screen.getByText('8.2s')).toBeTruthy();
        expect(screen.getByText('1024×1024')).toBeTruthy();
    });

    it('offers no details toggle when there is no provenance to show', () => {
        render(<GeneratedImage image={{imageId: 'image-1', prompt: 'a lighthouse'}}/>);

        expect(screen.queryByText('Details')).toBeNull();
    });

    it('downloads through an anchor named after the prompt', () => {
        const clickSpy = vi.fn();
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
            const element = originalCreateElement(tagName);

            if (tagName === 'a') {
                element.click = clickSpy;
            }

            return element;
        });

        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        fireEvent.click(screen.getByText('Download'));

        expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('disables the download while the bytes are still loading', () => {
        useGeneratedImageUrl.mockReturnValue({objectUrl: null, loading: true, error: null});

        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.getByText('Download').closest('button').disabled).toBe(true);
    });

    it('hides the copy action where the clipboard cannot take an image', () => {
        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.queryByText('Copy')).toBeNull();
    });

    it('copies the image bytes when the clipboard supports it', async () => {
        const writeMock = vi.fn().mockResolvedValue(undefined);
        const imageBlob = {type: 'image/png'};

        vi.stubGlobal('ClipboardItem', class {
            constructor(items) {
                this.items = items;
            }
        });
        vi.stubGlobal('navigator', {clipboard: {write: writeMock}});
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({blob: async () => imageBlob}));

        render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        await act(async () => {
            fireEvent.click(screen.getByText('Copy'));
        });

        expect(writeMock).toHaveBeenCalledTimes(1);
        expect(writeMock.mock.calls[0][0][0].items['image/png']).toBe(imageBlob);
        expect(screen.getByText('Copied')).toBeTruthy();
    });

    it('offers regenerate only when the caller can handle it', () => {
        const {rerender} = render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.queryByText('Regenerate')).toBeNull();

        const onRegenerate = vi.fn();
        rerender(<GeneratedImage image={COMPLETED_IMAGE} onRegenerate={onRegenerate}/>);

        fireEvent.click(screen.getByText('Regenerate'));

        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('offers full size only when the caller can host a lightbox', () => {
        const onExpand = vi.fn();
        const {rerender} = render(<GeneratedImage image={COMPLETED_IMAGE}/>);

        expect(screen.queryByText('Full size')).toBeNull();

        rerender(<GeneratedImage image={COMPLETED_IMAGE} onExpand={onExpand}/>);

        fireEvent.click(screen.getByText('Full size'));

        expect(onExpand).toHaveBeenCalledTimes(1);
        expect(onExpand.mock.calls[0][0].objectUrl).toBe('blob:image-1');
        expect(onExpand.mock.calls[0][0].description).toBe('a lighthouse on a cliff in a storm');
    });

    it('disables full size while the bytes are still loading', () => {
        useGeneratedImageUrl.mockReturnValue({objectUrl: null, loading: true, error: null});

        render(<GeneratedImage image={COMPLETED_IMAGE} onExpand={vi.fn()}/>);

        expect(screen.getByText('Full size').closest('button').disabled).toBe(true);
    });
});
