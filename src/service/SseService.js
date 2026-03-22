/**
 * Parses raw Server-Sent Events payload into an array of frames.
 * Each frame is an object: { event: string, data: string }
 */
export function parseSSELines(rawInput) {
    const parsedEvents = [];

    // Separate SSE messages by blank lines per SSE spec
    const messageBlocks = String(rawInput).split(/\n\n+/);

    for (const messageBlock of messageBlocks) {
        if (!messageBlock.trim()) {
            continue;
        }

        let eventName = null;
        let eventData = '';

        for (const line of messageBlock.split('\n')) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                eventData += (eventData ? '\n' : '') + line.slice(5);
            }
        }

        if (eventName || eventData) {
            parsedEvents.push({event: eventName ?? 'message', data: eventData});
        }
    }

    return parsedEvents;
}

const SseService = { parseSSELines };
export default SseService;
