import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {downscaleImage, MAX_LONGEST_EDGE_PIXELS} from '../../src/util/downscaleImage.js';
import {MAX_VISION_BYTES} from '../../src/util/imageValidation.js';

const OVERSIZED_BYTES = MAX_VISION_BYTES + 1;

let drawImageCalls;
let createdCanvas;
let encodedBlobSize;
let loadedImageDimensions;
let shouldImageFail;

function fakeFile({name = 'big.png', type = 'image/png', size = OVERSIZED_BYTES} = {}) {
    return {name, type, size, lastModified: 42};
}

class FakeFile {
    constructor(parts, name, options) {
        this.parts = parts;
        this.name = name;
        this.type = options.type;
        this.lastModified = options.lastModified;
        this.size = parts[0]?.size ?? 0;
    }
}

class FakeImage {
    constructor() {
        this.naturalWidth = loadedImageDimensions.width;
        this.naturalHeight = loadedImageDimensions.height;
    }

    set src(value) {
        this._src = value;

        queueMicrotask(() => {
            if (shouldImageFail) {
                this.onerror?.();
                return;
            }

            this.onload?.();
        });
    }
}

beforeEach(() => {
    drawImageCalls = [];
    encodedBlobSize = 1024;
    loadedImageDimensions = {width: 4000, height: 2000};
    shouldImageFail = false;

    createdCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
            drawImage: (...callArguments) => drawImageCalls.push(callArguments),
        })),
        toBlob: vi.fn((callback, contentType) => {
            callback({size: encodedBlobSize, type: contentType});
        }),
    };

    vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:downscale-1'),
        revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('File', FakeFile);
    vi.stubGlobal('document', {
        createElement: vi.fn(() => createdCanvas),
    });
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('downscaleImage', () => {
    it('returns the original file when it is already under the vision limit', async () => {
        const smallFile = fakeFile({size: 1024});

        await expect(downscaleImage(smallFile)).resolves.toBe(smallFile);
        expect(document.createElement).not.toHaveBeenCalled();
    });

    it('exempts animated GIFs, which canvas would flatten to one frame', async () => {
        const gifFile = fakeFile({name: 'animation.gif', type: 'image/gif'});

        await expect(downscaleImage(gifFile)).resolves.toBe(gifFile);
        expect(document.createElement).not.toHaveBeenCalled();
    });

    it('returns a smaller File preserving name, type and lastModified', async () => {
        const bigFile = fakeFile();

        const downscaledFile = await downscaleImage(bigFile);

        expect(downscaledFile).not.toBe(bigFile);
        expect(downscaledFile.name).toBe('big.png');
        expect(downscaledFile.type).toBe('image/png');
        expect(downscaledFile.lastModified).toBe(42);
        expect(downscaledFile.size).toBe(1024);
    });

    it('caps the longest edge and preserves the aspect ratio', async () => {
        await downscaleImage(fakeFile());

        expect(createdCanvas.width).toBe(MAX_LONGEST_EDGE_PIXELS);
        expect(createdCanvas.height).toBe(MAX_LONGEST_EDGE_PIXELS / 2);
        expect(drawImageCalls[0].slice(1)).toEqual([0, 0, MAX_LONGEST_EDGE_PIXELS, MAX_LONGEST_EDGE_PIXELS / 2]);
    });

    it('caps a portrait image on its height', async () => {
        loadedImageDimensions = {width: 1000, height: 5000};

        await downscaleImage(fakeFile());

        expect(createdCanvas.height).toBe(MAX_LONGEST_EDGE_PIXELS);
        expect(createdCanvas.width).toBe(Math.round(MAX_LONGEST_EDGE_PIXELS / 5));
    });

    it('keeps the original dimensions when both edges are already under the cap', async () => {
        loadedImageDimensions = {width: 800, height: 600};

        await downscaleImage(fakeFile());

        expect(createdCanvas.width).toBe(800);
        expect(createdCanvas.height).toBe(600);
    });

    it('re-encodes with an explicit content type rather than defaulting to PNG', async () => {
        await downscaleImage(fakeFile({name: 'photo.jpg', type: 'image/jpeg'}));

        expect(createdCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg');
    });

    it('keeps the original when re-encoding did not actually shrink it', async () => {
        encodedBlobSize = OVERSIZED_BYTES + 100;
        const bigFile = fakeFile();

        await expect(downscaleImage(bigFile)).resolves.toBe(bigFile);
    });

    it('falls back to the original file when the image cannot be decoded', async () => {
        shouldImageFail = true;
        const bigFile = fakeFile();

        await expect(downscaleImage(bigFile)).resolves.toBe(bigFile);
    });

    it('revokes the temporary object URL in every path', async () => {
        await downscaleImage(fakeFile());

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:downscale-1');
    });

    it('returns a missing file unchanged', async () => {
        await expect(downscaleImage(null)).resolves.toBeNull();
    });

    it('skips non-image files without touching the canvas', async () => {
        const pdfFile = fakeFile({name: 'notes.pdf', type: 'application/pdf'});

        await expect(downscaleImage(pdfFile)).resolves.toBe(pdfFile);
        expect(document.createElement).not.toHaveBeenCalled();
    });
});
