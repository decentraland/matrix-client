import {
    Conversation,
    SocialId,
    TextMessage,
    MessageId,
    CursorOptions,
    ConversationId,
    BasicMessageInfo
} from './types'
import { ConversationCursor } from './ConversationCursor'

export interface MessagingAPI {
    /** Start listening to events */
    listenToEvents(): void

    /** Get all conversation the user has joined */
    getAllCurrentConversations(): { conversation: Conversation; unreadMessages: boolean }[]

    /** Get all conversation the user has with unread messages */
    getAllConversationsWithUnreadMessages(): Conversation[]

    /** Get total number of unseen messages from all conversations the user has joined */
    getTotalUnseenMessages(): number

    /**
     * Send a text message  to a conversation.
     * Returns the message id
     */
    sendMessageTo(conversationId: ConversationId, message: string): Promise<MessageId>

    /** Mark a message (and all those that came before it on the conversation) as read */
    markAsRead(conversationId: ConversationId, messageId: MessageId): Promise<void>

    /** Mark all messages in the conversation as seen */
    markMessagesAsSeen(conversationId: ConversationId): Promise<void>

    /** Listen to new messages */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void

    /**
     * Return basic information about the last read message. Since we don't mark messages sent by the logged in user as read,
     * we also check against the last sent message.
     */
    getLastReadMessage(conversationId: ConversationId): BasicMessageInfo | undefined

    /** Returns a cursor located on the given message. If there is no given message, then it is
     * located at the end of the conversation. */
    getCursorOnMessage(
        conversationId: ConversationId,
        messageId?: MessageId,
        options?: CursorOptions
    ): Promise<ConversationCursor>

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor>

    /** Returns a cursor located at the end of the conversation */
    getCursorOnLastMessage(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor>

    /** Get or create a direct conversation with the given user */
    createDirectConversation(userId: SocialId): Promise<Conversation>

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean

    /** Return a conversation unread messages */
    getConversationUnreadMessages(conversationId: ConversationId): BasicMessageInfo[]

    /** Create a channel with the given users */
    createChannel(channelName: string, userIds: SocialId[]): Promise<Conversation>

    /** Get or create a channel with the given users
     * If the channel already exists this will return the channel and won't invite the passed ids
     * If the channel is created, all user ids will be invited to join
     */
    getOrCreateChannel(channelName: string, userIds: SocialId[]): Promise<Conversation>

    /** Join a channel */
    joinChannel(roomIdOrChannelAlias: string): Promise<void>

    /** Leave a channel */
    leaveChannel(roomId: string): Promise<void>
}
