import { ClientEvent, IStartClientOpts, MatrixClient, PendingEventOrdering } from 'matrix-js-sdk/lib/client'
import { AuthChain, EthAddress } from '@dcl/crypto'
import {
    Timestamp,
    Conversation,
    SocialId,
    TextMessage,
    MessageId,
    CursorOptions,
    ConversationId,
    BasicMessageInfo,
    FriendshipRequest,
    CurrentUserStatus,
    UpdateUserStatus,
    GetOrCreateConversationResponse,
    SearchChannelsResponse,
    ProfileInfo,
    Member
} from './types'
import { ConversationCursor } from './ConversationCursor'
import { MessagingAPI } from './MessagingAPI'
import { SessionManagementAPI } from './SessionManagementAPI'
import { MessagingClient } from './MessagingClient'
import { SessionManagementClient } from './SessionManagementClient'
import { FriendsManagementAPI } from './FriendsManagementAPI'
import { FriendsManagementClient } from './FriendsManagementClient'
import { SocialAPI } from './SocialAPI'
import { login } from './Utils'
import { SyncState } from 'matrix-js-sdk/lib/sync'
import { Room } from 'matrix-js-sdk'

export type ClientLoginOptions = {
    pendingEventOrdering: 'chronological' | 'detached'
    disablePresence: boolean
    initialSyncLimit: number
    getLocalStorage?: () => Storage
    createOpts?: Record<string, any>
}

export class SocialClient implements SocialAPI {
    private readonly sessionManagement: SessionManagementAPI
    private readonly messaging: MessagingAPI
    // @internal
    private readonly friendsManagement: FriendsManagementAPI

    private constructor(matrixClient: MatrixClient) {
        this.sessionManagement = new SessionManagementClient(matrixClient, this)
        this.friendsManagement = new FriendsManagementClient(matrixClient, this)
        this.messaging = new MessagingClient(matrixClient, this)
    }

    listenToEvents(): void {
        this.messaging.listenToEvents()
    }

    static async loginToServer(
        synapseUrl: string,
        ethAddress: EthAddress,
        timestamp: Timestamp,
        authChain: AuthChain,
        options?: Partial<ClientLoginOptions> | undefined
    ): Promise<SocialClient> {
        // Destructure options
        const _options: IStartClientOpts = {
            pendingEventOrdering: PendingEventOrdering.Detached,
            initialSyncLimit: 3,
            disablePresence: false,
            ...(options as any)
        }

        // Login
        const matrixClient = await login(
            synapseUrl,
            ethAddress,
            timestamp,
            authChain,
            options?.getLocalStorage,
            options?.createOpts
        )

        // Listen to initial sync
        const waitForInitialSync = new Promise<void>(resolve => {
            const resolveOnSync = (state: SyncState) => {
                if (state === 'SYNCING') {
                    resolve(void 0)
                    // remove this listener, otherwhise, it'll be listening all the session and calling an invalid function
                    matrixClient.removeListener(ClientEvent.Sync, resolveOnSync)
                    return
                }
            }
            matrixClient.on(ClientEvent.Sync, resolveOnSync)
        })

        // Create the client before starting the matrix client, so our event hooks can detect all events during the initial sync
        const socialClient = new SocialClient(matrixClient)

        // Start the client
        await matrixClient.startClient(_options)

        // Wait for sync from cache + incremental sync
        await waitForInitialSync

        // Starting listening to new events after initial sync
        socialClient.listenToEvents()

        return socialClient
    }

    //////    SESSION - STATUS MANAGEMENT    //////

    isLoggedIn(): boolean {
        return this.sessionManagement.isLoggedIn()
    }

    logout(): Promise<void> {
        return this.sessionManagement.logout()
    }

    getUserId(): SocialId {
        return this.sessionManagement.getUserId()
    }

    getDomain(): string {
        return this.sessionManagement.getDomain()
    }

    setStatus(status: UpdateUserStatus): Promise<void> {
        return this.sessionManagement.setStatus(status)
    }

    getMemberInfo(roomId: string, userId: string): ProfileInfo {
        return this.messaging.getMemberInfo(roomId, userId)
    }

    getProfileInfo(userId: string): Promise<ProfileInfo> {
        return this.messaging.getProfileInfo(userId)
    }

    setProfileInfo(profileInfo: ProfileInfo): Promise<void> {
        return this.sessionManagement.setProfileInfo(profileInfo)
    }

    getUserStatuses(...users: SocialId[]): Map<SocialId, CurrentUserStatus> {
        return this.sessionManagement.getUserStatuses(...users)
    }

    onStatusChange(listener: (userId: SocialId, status: CurrentUserStatus) => void): void {
        return this.sessionManagement.onStatusChange(listener)
    }

    //////             MESSAGING             //////
    getAllCurrentConversations(): { conversation: Conversation; unreadMessages: boolean }[] {
        return this.messaging.getAllCurrentConversations()
    }
    getAllCurrentFriendsConversations(): { conversation: Conversation; unreadMessages: boolean }[] {
        return this.messaging.getAllCurrentFriendsConversations()
    }

    getAllConversationsWithUnreadMessages(): Conversation[] {
        return this.messaging.getAllConversationsWithUnreadMessages()
    }

    getTotalUnseenMessages(): number {
        return this.messaging.getTotalUnseenMessages()
    }

    sendMessageTo(conversationId: ConversationId, message: string): Promise<MessageId> {
        return this.messaging.sendMessageTo(conversationId, message)
    }

    markAsRead(conversationId: ConversationId, messageId: MessageId): Promise<void> {
        return this.messaging.markAsRead(conversationId, messageId)
    }

    markMessagesAsSeen(conversationId: ConversationId): Promise<void> {
        return this.messaging.markMessagesAsSeen(conversationId)
    }

    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void {
        return this.messaging.onMessage(listener)
    }

    onChannelMembership(listener: (conversation: Conversation, membership: string) => void): void {
        return this.messaging.onChannelMembership(listener)
    }

    onChannelMembers(listener: (conversation: Conversation, members: Member[]) => void): void {
        return this.messaging.onChannelMembers(listener)
    }

    getLastReadMessage(conversationId: ConversationId): BasicMessageInfo | undefined {
        return this.messaging.getLastReadMessage(conversationId)
    }

    getCursorOnMessage(
        conversationId: ConversationId,
        messageId?: MessageId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        return this.messaging.getCursorOnMessage(conversationId, messageId, options)
    }

    getCursorOnLastRead(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        return this.messaging.getCursorOnLastRead(conversationId, options)
    }

    getCursorOnLastMessage(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        return this.messaging.getCursorOnLastMessage(conversationId, options)
    }

    getFriendRequestMessageBody(
        friendshipId: string
    ): Promise<TextMessage[]> {
        return this.messaging.getFriendRequestMessageBody(friendshipId)
    }

    createDirectConversation(userId: SocialId): Promise<Conversation> {
        return this.messaging.createDirectConversation(userId)
    }

    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean {
        return this.messaging.doesConversationHaveUnreadMessages(conversationId)
    }

    getConversationUnreadMessages(conversationId: ConversationId): Array<BasicMessageInfo> {
        return this.messaging.getConversationUnreadMessages(conversationId)
    }

    //////        FRIENDS MANAGEMENT         //////

    /**
     * @deprecated use getAllFriendsAddresses()
     */
    getAllFriends(): SocialId[] {
        return this.friendsManagement.getAllFriends()
    }

    getAllFriendsAddresses(): Promise<string[]> {
        return this.friendsManagement.getAllFriendsAddresses()
    }

    // @internal
    getAllFriendsRooms(): Room[] {
        return this.friendsManagement.getAllFriendsRooms()
    }

    getPendingRequests(): FriendshipRequest[] {
        return this.friendsManagement.getPendingRequests()
    }

    isUserMyFriend(userId: SocialId): boolean {
        return this.friendsManagement.isUserMyFriend(userId)
    }

    addAsFriend(userId: SocialId, message?: string | undefined): Promise<void> {
        return this.friendsManagement.addAsFriend(userId, message)
    }

    deleteFriendshipWith(userId: SocialId): Promise<void> {
        return this.friendsManagement.deleteFriendshipWith(userId)
    }

    approveFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.friendsManagement.approveFriendshipRequestFrom(userId)
    }

    rejectFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.friendsManagement.rejectFriendshipRequestFrom(userId)
    }

    cancelFriendshipRequestTo(userId: SocialId): Promise<void> {
        return this.friendsManagement.cancelFriendshipRequestTo(userId)
    }

    onFriendshipRequest(listener: (requestedBy: SocialId, message?: string | undefined) => void): void {
        return this.friendsManagement.onFriendshipRequest(listener)
    }

    onFriendshipRequestCancellation(listener: (canceledBy: SocialId) => void): void {
        return this.friendsManagement.onFriendshipRequestCancellation(listener)
    }

    onFriendshipRequestRejection(listener: (rejectedBy: SocialId) => void): void {
        return this.friendsManagement.onFriendshipRequestRejection(listener)
    }

    onFriendshipRequestApproval(listener: (approvedBy: SocialId) => void): void {
        return this.friendsManagement.onFriendshipRequestApproval(listener)
    }

    onFriendshipDeletion(listener: (deletedBy: SocialId) => void): void {
        return this.friendsManagement.onFriendshipDeletion(listener)
    }

    getChannel(roomId: string): Conversation | undefined {
        return this.messaging.getChannel(roomId)
    }

    getChannelByName(alias: string): Promise<Conversation | undefined> {
        return this.messaging.getChannelByName(alias)
    }

    getOrCreateChannel(channelName: string, userIds: string[]): Promise<GetOrCreateConversationResponse> {
        return this.messaging.getOrCreateChannel(channelName, userIds)
    }

    joinChannel(roomIdOrChannelAlias: string): Promise<void> {
        return this.messaging.joinChannel(roomIdOrChannelAlias)
    }

    leaveChannel(roomId: string): Promise<void> {
        return this.messaging.leaveChannel(roomId)
    }

    searchChannel(limit: number, searchTerm?: string, since?: string): Promise<SearchChannelsResponse> {
        return this.messaging.searchChannel(limit, searchTerm, since)
    }
}
