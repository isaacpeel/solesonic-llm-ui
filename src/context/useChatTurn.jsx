import {useContext} from 'react';
import {ChatTurnContext} from './ChatTurnContext.jsx';

export const useChatTurn = () => useContext(ChatTurnContext);
