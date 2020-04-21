import { Conversation, MatrixId, TextMessage, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { ConversationCursor } from './ConversationCursor';

export interface MessagingAPI {

    /** Get all conversation the user has joined */
    getAllCurrentConversations(): Promise<{ conversation: Conversation, unreadMessages: boolean }[]>

    /**
     * Send a text message  to a conversation.
     * Returns the message id
     */
    sendMessageTo(conversation: Conversation, message: string): Promise<MessageId>;

    /** Mark a message (and all those that came before it on the conversation) as read */
    markAsRead(conversation: Conversation, messageId: MessageId): Promise<void>;

    /** Listen to new messages */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void;

    /**
     * Return basic information about the last read message. Since we don't mark messages sent by the logged in user as read,
     * we also check against the last sent message.
     */
    getLastReadMessage(conversationId: ConversationId): Promise<BasicMessageInfo | undefined>;

    /** Returns a cursor located on the given message */
    getCursorOnMessage(conversation: Conversation, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor>;

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor>;

    /** Returns a cursor located at the end of the conversation */
    getCursorOnLastMessage(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor>;

    /** Get or create a direct conversation with the given user */
    createDirectConversation(userId: MatrixId): Promise<Conversation>;

    /** Get or create a group conversation with the given users */
    createGroupConversation(conversationName: string, userIds: MatrixId[]): Promise<Conversation>;

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversation: Conversation): Promise<boolean>;
}
