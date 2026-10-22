const isEmptyNewConversation = (chatId, chatHistory) => {
    return !chatId && (chatHistory ?? []).every((entry) => entry.ephemeral);
};

export default isEmptyNewConversation;
