import { Conversation, SocialId, TextMessage, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { ConversationCursor } from './ConversationCursor';

export interface MessagingAPI {

    /** Get all conversation the user has joined */
    getAllCurrentConversations(): { conversation: Conversation, unreadMessages: boolean }[]

    /**
     * Send a text message  to a conversation.
     * Returns the message id
     */
    sendMessageTo(conversationId: ConversationId, message: string): Promise<MessageId>;

    /** Mark a message (and all those that came before it on the conversation) as read */
    markAsRead(conversationId: ConversationId, messageId: MessageId): Promise<void>;

    /** Listen to new messages */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void;

    /**
     * Return basic information about the last read message. Since we don't mark messages sent by the logged in user as read,
     * we also check against the last sent message.
     */
    getLastReadMessage(conversationId: ConversationId): BasicMessageInfo | undefined;

    /** Returns a cursor located on the given message */
    getCursorOnMessage(conversationId: ConversationId, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor>;

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor>;

    /** Returns a cursor located at the end of the conversation */
    getCursorOnLastMessage(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor>;

    /** Get or create a direct conversation with the given user */
    createDirectConversation(userId: SocialId): Promise<Conversation>;

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean;
}
