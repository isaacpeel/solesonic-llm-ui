export async function* parseSseStream(responseBody) {
    const decoder = new TextDecoder();
    const reader = responseBody.getReader();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const blocks = buffer.split('\n\n');
            buffer = blocks.pop();

            for (const block of blocks) {
                const event = parseEventBlock(block);
                if (event !== null) {
                    yield event;
                }
            }
        }

        if (buffer.trim()) {
            const event = parseEventBlock(buffer);
            if (event !== null) {
                yield event;
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function parseEventBlock(block) {
    const lines = block.split('\n');
    const event = {};

    for (const line of lines) {
        if (line.startsWith('event:')) {
            event.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            const value = line.slice(5).trim();
            event.data = event.data !== undefined ? `${event.data}\n${value}` : value;
        } else if (line.startsWith('id:')) {
            event.id = line.slice(3).trim();
        }
    }

    if (event.event === undefined && event.data === undefined) {
        return null;
    }

    return event;
}
