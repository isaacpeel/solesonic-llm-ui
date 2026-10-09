export const MODEL_COMMAND_TYPE = 'model';

export function isSettingCommand(command) {
    return command?.commandType === MODEL_COMMAND_TYPE;
}
