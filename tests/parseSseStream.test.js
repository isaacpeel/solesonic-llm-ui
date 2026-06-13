import { describe, it, expect } from 'vitest';
import { parseSseStream } from '../src/client/parseSseStream.js';

function makeStream(chunks) {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(encoder.encode(chunks[index++]));
            } else {
                controller.close();
            }
        },
    });
}

async function collectEvents(stream) {
    const events = [];
    for await (const event of parseSseStream(stream)) {
        events.push(event);
    }
    return events;
}

describe('parseSseStream', () => {
    it('single complete event', async () => {
        const stream = makeStream(['event: chunk\ndata: {"x":1}\n\n']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ event: 'chunk', data: '{"x":1}' }]);
    });

    it('multiple events separated by double newline', async () => {
        const stream = makeStream(['event: chunk\ndata: first\n\nevent: done\ndata: second\n\n']);
        const events = await collectEvents(stream);

        expect(events).toHaveLength(2);
        expect(events[0]).toEqual({ event: 'chunk', data: 'first' });
        expect(events[1]).toEqual({ event: 'done', data: 'second' });
    });

    it('event split across two read() calls', async () => {
        const stream = makeStream(['event: chunk\n', 'data: hello\n\n']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ event: 'chunk', data: 'hello' }]);
    });

    it('done event with JSON data', async () => {
        const stream = makeStream(['event: done\ndata: {"id":"c1"}\n\n']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ event: 'done', data: '{"id":"c1"}' }]);
    });

    it('multi-line data field joins with newline', async () => {
        const stream = makeStream(['event: chunk\ndata: line1\ndata: line2\n\n']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ event: 'chunk', data: 'line1\nline2' }]);
    });

    it('comment block yields nothing', async () => {
        const stream = makeStream([': heartbeat\n\n']);
        const events = await collectEvents(stream);

        expect(events).toHaveLength(0);
    });

    it('empty block yields nothing', async () => {
        const stream = makeStream(['\n\n']);
        const events = await collectEvents(stream);

        expect(events).toHaveLength(0);
    });

    it('event with id field', async () => {
        const stream = makeStream(['id: 123\nevent: chunk\ndata: x\n\n']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ id: '123', event: 'chunk', data: 'x' }]);
    });

    it('stream closes mid-buffer still yields final event', async () => {
        const stream = makeStream(['event: chunk\ndata: final']);
        const events = await collectEvents(stream);

        expect(events).toEqual([{ event: 'chunk', data: 'final' }]);
    });

    it('caller breaks early — no reader lock error', async () => {
        const stream = makeStream([
            'event: chunk\ndata: first\n\n',
            'event: chunk\ndata: second\n\n',
        ]);

        const events = [];
        for await (const event of parseSseStream(stream)) {
            events.push(event);
            break;
        }

        expect(events).toHaveLength(1);
        expect(events[0].data).toBe('first');
    });
});
