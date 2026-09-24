import {AI, SYSTEM} from "../chat/message/ChatMessage.jsx";
import streamService from "./StreamService.js"
import {generateMessageKey} from "../util/keys.js";

/* randomUUID exists only in secure contexts; a plain-http deployment still needs an id. */
function generateToolMessageId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }

    return generateMessageKey('tool');
}


const DEFAULT_CONFIRMATION_ACTIONS = ['accept', 'cancel', 'decline'];

const ELICITATION_ACTION_ALIASES = new Map([
    ['accept', 'accept'],
    ['yes', 'accept'],
    ['confirm', 'accept'],
    ['ok', 'accept'],
    ['approve', 'accept'],
    ['decline', 'decline'],
    ['no', 'decline'],
    ['reject', 'decline'],
    ['deny', 'decline'],
    ['cancel', 'cancel'],
]);

function toElicitationAction(fieldValue) {
    if (typeof fieldValue !== 'string') {
        return null;
    }

    return ELICITATION_ACTION_ALIASES.get(fieldValue.trim().toLowerCase()) ?? null;
}

/*
 * The API reads only `action` from the answer. A schema that names its single choice something
 * else (`confirm: 'no'`) still maps onto one; a submitted form with no such choice is an accept.
 */
export function resolveElicitationAction(fields) {
    const explicitAction = toElicitationAction(fields.action);

    if (explicitAction) {
        return explicitAction;
    }

    const answeredFields = Object.entries(fields).filter(([fieldName]) => fieldName !== 'chatId');

    if (answeredFields.length === 1) {
        const singleChoiceAction = toElicitationAction(answeredFields[0][1]);

        if (singleChoiceAction) {
            return singleChoiceAction;
        }
    }

    return 'accept';
}

const elicitationService = {
    normalizeElicitationSchema: (requestedSchema) => {
        const schema = requestedSchema || {};
        const properties = schema.properties;

        if (properties !== undefined && Object.keys(properties).length === 0) {
            return {
                ...schema,
                properties: {
                    action: {
                        type: 'string',
                        enum: DEFAULT_CONFIRMATION_ACTIONS,
                    },
                },
            };
        }

        return schema;
    },

    /*
     * Single source of truth for turning a schema's `enum`/`oneOf` into {value, label} pairs —
     * shared by ElicitationPrompt (to render the picker) and describeFieldValue below (to render
     * the resolved-message summary), so the two can never disagree on what a submitted value
     * displays as.
     */
    getEnumOptions: (propertyDef) => {
        if (propertyDef.enum) {
            return propertyDef.enum.map((value) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
            }));
        }
        if (propertyDef.oneOf) {
            return propertyDef.oneOf.map((item) => ({ value: item.const, label: item.title }));
        }
        return null;
    },

    getMultiEnumOptions: (propertyDef) => {
        const items = propertyDef.items;
        if (!items) return null;
        if (items.enum) {
            return items.enum.map((value) => ({ value, label: value }));
        }
        if (items.anyOf) {
            return items.anyOf.map((item) => ({ value: item.const, label: item.title }));
        }
        return null;
    },

    /*
     * Resolves a submitted field's raw value to the schema's display label for it — the enum
     * `value`/`oneOf` `const` a select submits (a Jira account id, say) is rarely what a person
     * should see echoed back in the resolved-message bubble.
     */
    describeFieldValue: (schema, fieldKey, fieldValue) => {
        const isDirectSchema = !schema.properties && (schema.type || schema.enum || schema.oneOf);
        const propertyDef = isDirectSchema && fieldKey === 'value' ? schema : schema.properties?.[fieldKey];

        if (!propertyDef) {
            return `${fieldValue}`;
        }

        const enumOptions = elicitationService.getEnumOptions(propertyDef);
        if (enumOptions) {
            const matchedOption = enumOptions.find((option) => option.value === fieldValue);
            return matchedOption ? matchedOption.label : `${fieldValue}`;
        }

        if (propertyDef.type === 'array' && Array.isArray(fieldValue)) {
            const multiOptions = elicitationService.getMultiEnumOptions(propertyDef);
            if (multiOptions) {
                return fieldValue
                    .map((value) => multiOptions.find((option) => option.value === value)?.label ?? value)
                    .join(', ');
            }
        }

        return `${fieldValue}`;
    },

    handleElicitationChange: (fieldName, fieldValue, setElicitationValues) => {
        setElicitationValues((previousValues) => ({
            ...previousValues,
            [fieldName]: fieldValue,
        }));
    },
    handleElicitationSubmit: async ({
        overrideFields,
        activeElicitation,
        elicitationValues,
        chatHistory,
        setChatHistory,
        setActiveElicitation,
        setElicitationSubmitting,
        appendErrorMessage,
        handleStreamChunk,
        carriedNotifications,
    }) => {
        
        if (!activeElicitation) {
            return;
        }

        const fieldsToSend = {
            ...elicitationValues,
            ...(overrideFields || {}),
        };

        const timestamp = Date.now() + Math.random().toString(36).slice(2);

        const schema = elicitationService.normalizeElicitationSchema(activeElicitation.requestedSchema);
        const summaryParts = Object.entries(fieldsToSend)
            .filter(([fieldKey]) => fieldKey !== 'chatId')
            .map(([fieldKey, fieldValue]) => elicitationService.describeFieldValue(schema, fieldKey, fieldValue));

        const updatedHistory = chatHistory.filter((message) => !message.ephemeral);
        const resolvedElicitationMessage = {
            type: SYSTEM,
            text: activeElicitation.message,
            elicitationResponse: summaryParts.join(', '),
            _key: `elicitation-${timestamp}`,
        };
        const aiPlaceholder = {
            type: AI,
            text: '',
            _key: `ai-${timestamp}`,
            isStreaming: true,
            notifications: Array.isArray(carriedNotifications) ? carriedNotifications : [],
        };

        setActiveElicitation(null);
        setChatHistory([...updatedHistory, resolvedElicitationMessage, aiPlaceholder]);

        setElicitationSubmitting(true);

        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        try {
            const toolMessage = {
                id: generateToolMessageId(),
                role: 'tool',
                toolCallId: elicitationId,
                content: JSON.stringify({...fieldsToSend, action: resolveElicitationAction(fieldsToSend)}),
            };

            await streamService.chatStreamElicitationResponse(toolMessage, chatId, elicitationId, {
                onChunk: handleStreamChunk,
            });
        } catch (error) {
            streamService.handleStreamError(error, appendErrorMessage, setChatHistory);
        }

        setElicitationSubmitting(false);
    },
};

export default elicitationService;