import {useCallback, useEffect, useState} from 'react';
import ConsoleErrors from "../common/ConsoleErrors";
import {useSharedData} from "../context/useSharedData.jsx";
import './ChatScreen.css';
import chatService from "../service/ChatService.js";
import {parseSSELines} from "../service/SeeService.js";
import {SharedDataContext} from "../context/SharedDataContext.jsx";
import ChatMessage, {AI, SYSTEM, USER} from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";
import {toJsx} from "../util/htmlFunctions.jsx";

// Inline elicitation prompt rendered below the last assistant message
function ElicitationPrompt({ elicitation, values, onChange, onSubmit, submitting }) {
    if (!elicitation) {
        return null;
    }

    const schema = elicitation.requestedSchema || {};
    const properties = schema.properties || {};
    const requiredList = Array.isArray(schema.required) ? schema.required : [];
    const requiredSet = new Set(requiredList);

    const nonMetaPropertyEntries = Object.entries(properties).filter(([fieldName]) => fieldName !== 'chatId');
    const isBooleanOnlyPrompt = nonMetaPropertyEntries.length === 1 && (nonMetaPropertyEntries[0][1]?.type === 'boolean');

    const handleInputChange = (fieldName) => (event) => {
        onChange(fieldName, event.target.value);
    };

    const fieldControl = (propertyName, propertyDef) => {
        const currentValue = values[propertyName] ?? '';
        const isReadOnlyField = propertyName === 'chatId';

        if (propertyDef?.type === 'boolean') {
            return (
                <div className="mt-1 flex items-center gap-3">
                    <button
                        type="button"
                        className={`${currentValue === 'accept' ? 'border-slate-500 bg-slate-700 text-white hover:bg-slate-600' : 'border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800'} rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60`}
                        onClick={() => {
                            onChange(propertyName, 'accept');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'accept' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Accept
                    </button>
                    <button
                        type="button"
                        className={`${currentValue === 'decline' ? 'border-slate-500 bg-slate-700 text-white hover:bg-slate-600' : 'border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800'} rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60`}
                        onClick={() => {
                            onChange(propertyName, 'decline');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'decline' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        className={`${currentValue === 'cancel' ? 'border-slate-500 bg-slate-700 text-white hover:bg-slate-600' : 'border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800'} rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60`}
                        onClick={() => {
                            onChange(propertyName, 'cancel');

                            if (isBooleanOnlyPrompt) {
                                onSubmit({ [propertyName]: 'cancel' });
                            }
                        }}
                        disabled={submitting || isReadOnlyField}
                    >
                        Cancel
                    </button>

                    {submitting && isBooleanOnlyPrompt && (
                        <div className="inline-flex items-center text-xs text-slate-400">
                            <svg className="mr-2 h-4 w-4 animate-spin text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            Waiting for assistant...
                        </div>
                    )}
                </div>
            );
        }

        if (Array.isArray(propertyDef?.enum) && propertyDef.enum.length > 0) {
            return (
                <select
                    className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    value={currentValue}
                    onChange={handleInputChange(propertyName)}
                    disabled={submitting || isReadOnlyField}
                >
                    <option value="">Select...</option>
                    {propertyDef.enum.map((option) => (
                        <option key={String(option)} value={String(option)}>{String(option)}</option>
                    ))}
                </select>
            );
        }

        const placeholder = propertyDef?.description || (propertyDef?.format ? `Format: ${propertyDef.format}` : '');

        return (
            <input
                type="text"
                className="mt-1 block w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder={placeholder}
                value={currentValue}
                onChange={handleInputChange(propertyName)}
                disabled={submitting || isReadOnlyField}
            />
        );
    };

    return (
        <div className="mx-10 mb-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-slate-100">
            <div className="mb-2 text-sm font-medium text-slate-100">{elicitation.message}</div>
            <div className="space-y-3">
                {Object.entries(properties)
                    .filter(([propertyName]) => propertyName !== 'chatId')
                    .map(([propertyName, propertyDef]) => (
                        <div key={propertyName} className="">
                            {fieldControl(propertyName, propertyDef)}
                            {propertyDef?.description && (
                                <p className="mt-1 text-[11px] text-slate-400">{propertyDef.description}</p>
                            )}
                        </div>
                    ))}
            </div>
            {!isBooleanOnlyPrompt && (
                <div className="mt-3 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={(() => {
                            const hasMissingRequired = Array.from(requiredSet).some((propertyName) => {
                                const property = properties[propertyName];
                                const value = values[propertyName];

                                if (property?.type === 'boolean') {
                                    return !(value === 'accept' || value === 'decline' || value === 'cancel');
                                }

                                return value === undefined || value === null || value === '';
                            });

                            return submitting || hasMissingRequired;
                        })()}
                        className="inline-flex items-center rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Submit
                    </button>
                    {submitting && (
                        <div className="inline-flex items-center text-xs text-slate-400">
                            <svg className="mr-2 h-4 w-4 animate-spin text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            Waiting for assistant...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ChatScreen() {
    const {chatId, setChatId} = useSharedData(null);
    const {chatHistory, setChatHistory} = useSharedData([]);
    const sharedRef = useSharedData(SharedDataContext);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [inputValue, setInputValue] = useState('');

    // MCP elicitation state
    const [activeElicitation, setActiveElicitation] = useState(null);
    const [elicitationValues, setElicitationValues] = useState({});
    const [elicitationSubmitting, setElicitationSubmitting] = useState(false);

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    // Helper to append streaming text to the last AI message
    const appendToLastAIMessage = (textToAppend) => {
        setChatHistory((previousHistory) => {
            const lastIndex = previousHistory.length - 1;

            if (lastIndex < 0) {
                return previousHistory;
            }

            const newHistory = [...previousHistory];
            const lastMessage = newHistory[lastIndex];

            if (lastMessage.type === AI) {
                newHistory[lastIndex] = {
                    ...lastMessage,
                    text: (lastMessage.text || '') + String(textToAppend),
                };
            }

            return newHistory;
        });
    };

    // Helper to ensure chatId exists when backend returns it
    const ensureChatIdFromResponse = (response) => {
        if (!chatId && response?.id) {
            setChatId(response.id);
        }
    };

    // Helper to finalize the last AI message with final content and metadata
    const finalizeLastAIMessage = (response) => {
        setChatHistory((previousHistory) => {
            const newHistory = [...previousHistory];
            const lastIndex = newHistory.length - 1;

            if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                const finalText = response?.message?.message ?? newHistory[lastIndex].text;
                newHistory[lastIndex] = {
                    ...newHistory[lastIndex],
                    text: finalText,
                    formattedText: toJsx(finalText),
                    model: response?.message?.model ?? newHistory[lastIndex].model,
                    isStreaming: false,
                };
            }

            return newHistory;
        });
    };

    // Handle streaming chunks including SSE frames for chunk/done/elicitation
    const handleStreamChunk = useCallback((raw) => {
        const frames = parseSSELines(raw);

        if (frames.length === 0) {
            if (activeElicitation) {
                setActiveElicitation(null);
                setElicitationSubmitting(false);
            }

            appendToLastAIMessage(String(raw));
            return;
        }

        for (const {event, data} of frames) {
            if (event === 'chunk' || event === 'message') {
                if (activeElicitation) {
                    setActiveElicitation(null);
                    setElicitationSubmitting(false);
                }

                appendToLastAIMessage(data);
            } else if (event === 'done') {
                try {
                    const parsed = JSON.parse(data);
                    ensureChatIdFromResponse(parsed);
                    finalizeLastAIMessage(parsed);
                } catch (parseError) {
                    console.error('[ChatScreen] Failed to parse done payload:', parseError);
                }

                setActiveElicitation(null);
                setElicitationSubmitting(false);
            } else if (event === 'elicitation') {
                try {
                    const elicitation = JSON.parse(data);

                    setElicitationSubmitting(false);
                    setActiveElicitation(elicitation);

                    const schema = elicitation.requestedSchema || {};
                    const properties = schema.properties || {};
                    const initialValues = {};

                    for (const propertyName of Object.keys(properties)) {
                        if (propertyName === 'chatId') {
                            initialValues[propertyName] = elicitation?._meta?.chatId || elicitation?.chatId || chatId || '';
                        } else {
                            initialValues[propertyName] = '';
                        }
                    }

                    setElicitationValues(initialValues);
                } catch (parseError) {
                    console.error('[ChatScreen] Failed to parse elicitation payload:', parseError);
                }
            }
        }
    }, [activeElicitation, appendToLastAIMessage, ensureChatIdFromResponse, finalizeLastAIMessage]);

    useEffect(() => {
        if (chatHistory.length === 0) {
            const welcomeMessage = {
                type: AI,
                text: "Hi! How can I assist you today?",
                ephemeral: true,
                _key: `welcome-${Date.now()}`,
            };
            setChatHistory([welcomeMessage]);
        }
    }, [chatHistory, setChatHistory]);

    useEffect(() => {
        if (!chatId) {
            return;
        }

        async function fetchChatDetails() {
            const response = await chatService.findChatDetails(chatId);

            return response.chatMessages.map((message, idx) => {
                return {
                    type: message.messageType,
                    text: message.message,
                    model: message.model,
                    _key: message.id ?? `${chatId || 'new'}-${idx}`,
                };
            });
        }

        fetchChatDetails().then(formattedMessages => {
            setChatHistory(formattedMessages)
        });
    }, [chatId, setChatHistory]);

    const handleElicitationChange = (name, value) => {
        setElicitationValues((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleElicitationSubmit = async (overrideFields) => {
        if (!activeElicitation) {
            return;
        }

        const fieldsToSend = {
            ...elicitationValues,
            ...(overrideFields || {}),
        };

        const ts = Date.now() + Math.random().toString(36).slice(2);

        const summaryParts = Object.entries(fieldsToSend)
            .filter(([key]) => key !== 'chatId')
            .map(([key, value]) => `${value}`);

        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const systemElicitationMessage = { type: SYSTEM, text: activeElicitation.message, _key: `user-${ts}` };
        const userElicitationResponse = {type: USER, text: summaryParts.join(', ')};
        const aiPlaceholder = { type: AI, text: '', _key: `ai-${ts}`, isStreaming: true };

        setChatHistory([...updatedHistory, systemElicitationMessage, userElicitationResponse, aiPlaceholder]);

        setElicitationSubmitting(true);
        
        const elicitationId = activeElicitation.elicitationId;
        const chatId = activeElicitation.chatId;

        const responsePayload = {
            elicitationResponse: {
                name: activeElicitation.name,
                fields: { ...fieldsToSend },
            },
        };

        setError(null);

        try {
            await chatService.chatStreamElicitationResponse(responsePayload, chatId, elicitationId,{
                onChunk: handleStreamChunk,
            });
        } catch (error) {
            console.error('[ChatScreen] Elicitation streaming error:', error);
            setError(error);
            setChatHistory((previous) => {
                const newHistory = [...previous];
                const lastIndex = newHistory.length - 1;

                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                    newHistory[lastIndex] = { ...newHistory[lastIndex], isStreaming: false };
                }

                return newHistory;
            });
        }

        setActiveElicitation(null);
        setElicitationSubmitting(false);
    };

    const handleSubmit = async () => {

        if (!inputValue.trim()) {
            return;
        }

        // Remove the ephemeral message before appending new user input
        const updatedHistory = chatHistory.filter(message => !message.ephemeral);
        const ts = Date.now() + Math.random().toString(36).slice(2);
        const userMessage = {type: USER, text: inputValue, _key: `user-${ts}`};

        // Append user message and a placeholder AI message for streaming
        const aiPlaceholder = {type: AI, text: '', _key: `ai-${ts}`, isStreaming: true};
        setChatHistory([...updatedHistory, userMessage, aiPlaceholder]);
        setLoading(true);
        setInputValue('');

        if (sharedRef.chatInputRef.current) {
            sharedRef.chatInputRef.current.style.height = "auto";
        }

        setError(null);

        try {
            // Ensure we handle raw SSE properly, supporting both:
            // - onChunk receiving raw "event:.../data:..." strings
            // - onChunk receiving plain text tokens
            await chatService.chatStream(inputValue, chatId, {
                onChunk: handleStreamChunk,
            });

        } catch (error) {
            console.error('[ChatScreen] Streaming error:', error);
            setError(error);
            setChatHistory((prev) => {
                const newHistory = [...prev];
                const lastIndex = newHistory.length - 1;
                if (lastIndex >= 0 && newHistory[lastIndex].type === AI && !newHistory[lastIndex].text) {
                    newHistory.pop();
                } else if (lastIndex >= 0 && newHistory[lastIndex].type === AI) {
                    newHistory[lastIndex] = {...newHistory[lastIndex], isStreaming: false};
                }
                return newHistory;
            });
        } finally {
            setLoading(false);
            setTimeout(() => {
                sharedRef.chatInputRef.current?.focus();
            }, 300);
        }

        return true;
    }

    return (
        <div className="chat-app">
            {error && <ConsoleErrors error={error}/>}

            <div className="chat-content">
                {chatHistory.map((entry) => (
                    <ChatMessage key={entry._key} message={entry}/>
                ))}

                {activeElicitation && (
                    <ElicitationPrompt
                        elicitation={activeElicitation}
                        values={elicitationValues}
                        onChange={handleElicitationChange}
                        onSubmit={handleElicitationSubmit}
                        submitting={elicitationSubmitting}
                    />
                )}

                <ChatInput
                    loading={loading}
                    inputValue={inputValue}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    chatInputRef={sharedRef.chatInputRef}
                />
            </div>
        </div>
    );
}

export default ChatScreen;