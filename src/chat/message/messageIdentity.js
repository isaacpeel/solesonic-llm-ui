export const ASSISTANT_NAME = 'Izzy-Bot';

export function modelNameOf(message) {
    return message?.model
        || message?.responseMetadata?.routedModel
        || message?.responseMetadata?.model
        || null;
}

export function latestModelName(messages) {
    const list = Array.isArray(messages) ? messages : [];

    for (let index = list.length - 1; index >= 0; index--) {
        const modelName = modelNameOf(list[index]);

        if (modelName) {
            return modelName;
        }
    }

    return null;
}
