import {
    Conversation,
    SocialId,
    TextMessage,
    MessageId,
    CursorOptions,
    ConversationId,
    BasicMessageInfo,
    GetOrCreateConversationResponse,
    SearchChannelsResponse,
    ProfileInfo,
    Member
} from './types'
import { ConversationCursor } from './ConversationCursor'

export interface MessagingAPI {
    /** Start listening to events */
    listenToEvents(): void

    /**
     * Get all conversation the user has joined including DMs, channels, etc
     */
    getAllCurrentConversations(): { conversation: Conversation; unreadMessages: boolean }[]

    /**
     * Get all conversation with unread messages the user has joined including DMs, channels, etc
     */
    getAllConversationsWithUnreadMessages(): Conversation[]

    /**
     * Get all conversation with friends the user has joined
     * @returns `conversation` & `unreadMessages` boolean that indicates whether the conversation has unread messages.
     */
    getAllCurrentFriendsConversations(): { conversation: Conversation; unreadMessages: boolean }[]

    /** Get total number of unseen messages from all conversations the user has joined */
    getTotalUnseenMessages(): number

    getProfileInfo(userId: string): Promise<ProfileInfo>

    getMemberInfo(roomId: string, userId: string): ProfileInfo

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

    /** Listen to updates on the current user membership of a channel
     * membership - join | leave | invite
     */
    onChannelMembership(listener: (conversation: Conversation, membership: string) => void): void

    /**
     * Listen to updates on the members of a channel
     */
    onChannelMembers(listener: (conversation: Conversation, members: Member[]) => void): void

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
    ): Promise<ConversationCursor | undefined>

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined>

    /** Returns a cursor located at the end of the conversation */
    getCursorOnLastMessage(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined>

    /** Get or create a direct conversation with the given user */
    createDirectConversation(userId: SocialId): Promise<Conversation>

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean

    /** Return a conversation unread messages */
    getConversationUnreadMessages(conversationId: ConversationId): BasicMessageInfo[]

    /** Get or create a channel with the given users
     * If the channel already exists this will return the channel and won't invite the passed ids
     * If the channel is created, all user ids will be invited to join
     */
    getOrCreateChannel(channelName: string, userIds: SocialId[]): Promise<GetOrCreateConversationResponse>

    /**
     * Get the conversation for a channel if it exists, otherwise returns undefined
     * @param roomId - the roomId of the channel
     */
    getChannel(roomId: string): Conversation | undefined

    /**
     * Get the conversation for a channel by its name.
     * @param alias - the name of the channel.
     * @returns `Promise<Conversation>` if it exists | `Promise<undefined>` if it does not exist.
     */
    getChannelByName(alias: string): Promise<Conversation | undefined>

    /** Join a channel */
    joinChannel(roomIdOrChannelAlias: string): Promise<void>

    /** Leave a channel */
    leaveChannel(roomId: string): Promise<void>

    /** Search channels */
    searchChannel(limit: number, searchTerm?: string, since?: string): Promise<SearchChannelsResponse>
}
