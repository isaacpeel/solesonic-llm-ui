const config = {
    apiBaseUri: import.meta.env.VITE_API_BASE_URI,
    uiBaseUri: import.meta.env.VITE_UI_BASE_URI,
};

config.chatsUri = `${config.apiBaseUri}/chats`;
config.chatGroupsUri = `${config.apiBaseUri}/chatgroups`;
config.streamingChatsUri = `${config.apiBaseUri}/streaming/chats`;
config.usersUri = `${config.apiBaseUri}/users`;
config.ollamaUri = `${config.apiBaseUri}/ollama`;
config.atlassianUri = `${config.apiBaseUri}/atlassian`;
config.googleUri = `${config.apiBaseUri}/google`;
config.slashCommandsUri = `${config.apiBaseUri}/slash/commands`;
config.attachmentsUri = `${config.apiBaseUri}/attachments`;
config.imagesUri = `${config.apiBaseUri}/images`;
config.authFailureUri = `${config.uiBaseUri}/authFailure`;

export default config;
