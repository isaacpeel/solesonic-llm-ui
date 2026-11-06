import {useState} from 'react';
import {useLocation} from 'react-router';
import {ShareIcon} from '@heroicons/react/24/solid/index.js';
import {useSharedData} from '../context/useSharedData.jsx';
import {useChatTurn} from '../context/useChatTurn.jsx';
import chatService from '../service/ChatService.js';
import ShareChatDialog from './ShareChatDialog.jsx';
import './SharedSessions.css';

const TURN_IN_PROGRESS_REASON = 'Wait for the response to finish.';

const ShareChatButton = () => {
    const {chatId, chatHistory} = useSharedData();
    const chatTurn = useChatTurn();
    const {pathname} = useLocation();
    const [dialogChatName, setDialogChatName] = useState(null);

    const onChatRoute = pathname === '/' || pathname.startsWith('/chat/');

    const openDialog = async () => {
        let name = '';

        try {
            const details = await chatService.findChatDetails(chatId);
            name = typeof details?.name === 'string' ? details.name : '';
        } catch {
            name = '';
        }

        setDialogChatName(name);
    };

    if (!onChatRoute || !chatId || !Array.isArray(chatHistory) || chatHistory.length === 0) {
        return null;
    }

    const turnInProgress = !!chatTurn?.turnInProgress;

    return (
        <>
            <button
                type="button"
                className="icon-wrapper share-chat-button"
                aria-label="Share this chat"
                data-dialog="Share this chat"
                disabled={turnInProgress}
                title={turnInProgress ? TURN_IN_PROGRESS_REASON : undefined}
                onClick={openDialog}
            >
                <ShareIcon/>
            </button>

            {dialogChatName !== null && (
                <ShareChatDialog
                    sourceChatId={chatId}
                    chatName={dialogChatName}
                    onCancel={() => setDialogChatName(null)}
                    onShared={() => setDialogChatName(null)}
                />
            )}
        </>
    );
};

export default ShareChatButton;
