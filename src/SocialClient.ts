import Matrix from 'matrix-js-sdk';
import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, Conversation, MatrixId, TextMessage, MessageId, CursorOptions, ConversationId, BasicMessageInfo, FriendshipRequest } from './types';
import { ConversationCursor } from './ConversationCursor';
import { MessagingAPI } from './MessagingAPI';
import { SessionManagementAPI } from './SessionManagementAPI';
import { MessagingClient } from './MessagingClient';
import { SessionManagementClient } from './SessionManagementClient';
import { FriendsManagementAPI } from 'FriendsManagementAPI';
import { FriendsManagementClient } from 'FriendsManagementClient';

export class SocialClient implements MessagingAPI, SessionManagementAPI, FriendsManagementAPI {

    private readonly sessionManagement: SessionManagementAPI;
    private readonly messaging: MessagingAPI;
    private readonly friendsManagement: FriendsManagementAPI;

    private constructor(matrixClient: Matrix.MatrixClient) {
        this.sessionManagement = new SessionManagementClient(matrixClient)
        this.messaging = new MessagingClient(matrixClient)
        this.friendsManagement = new FriendsManagementClient(matrixClient, this)
    }

    static async loginToServer(synapseUrl: string, ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<SocialClient> {
        // Create the client
        const matrixClient: Matrix.MatrixClient = Matrix.createClient({
            baseUrl: synapseUrl,
            timelineSupport: true,
        })

        // Actual login
        await matrixClient.login('m.login.decentraland', {
            identifier: {
                type: 'm.id.user',
                user: ethAddress.toLowerCase(),
            },
            timestamp: timestamp.toString(),
            auth_chain: authChain
        });

        // Create the client before starting the matrix client, so our event hooks can detect all events during the initial sync
        const socialClient = new SocialClient(matrixClient)

        // Start the client
        await matrixClient.startClient({
            pendingEventOrdering: 'detached',
            initialSyncLimit: 20, // This is the value that the Matrix React SDK uses
        });

        return socialClient
    }

    //////    SESSION - STATUS MANAGEMENT    //////

    isLoggedIn(): boolean {
        return this.sessionManagement.isLoggedIn()
    }

    logout(): Promise<void> {
        return this.sessionManagement.logout()
    }

    getUserId(): MatrixId {
        return this.sessionManagement.getUserId()
    }

    getDomain(): string {
        return this.sessionManagement.getDomain()
    }

    //////             MESSAGING             //////
    getAllCurrentConversations(): Promise<{ conversation: Conversation, unreadMessages: boolean }[]> {
       return this.messaging.getAllCurrentConversations()
    }

    sendMessageTo(conversation: Conversation, message: string): Promise<MessageId> {
        return this.messaging.sendMessageTo(conversation, message)
    }

    markAsRead(conversation: Conversation, messageId: MessageId): Promise<void> {
        return this.messaging.markAsRead(conversation, messageId)
    }

    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void {
        return this.messaging.onMessage(listener)
    }

    getLastReadMessage(conversationId: ConversationId): Promise<BasicMessageInfo | undefined> {
        return this.messaging.getLastReadMessage(conversationId)
    }

    getCursorOnMessage(conversation: Conversation, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor> {
        return this.messaging.getCursorOnMessage(conversation, messageId, options)
    }

    getCursorOnLastRead(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        return this.messaging.getCursorOnLastRead(conversation, options)
    }

    getCursorOnLastMessage(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        return this.messaging.getCursorOnLastMessage(conversation, options)
    }

    createDirectConversation(userId: MatrixId): Promise<Conversation> {
        return this.messaging.createDirectConversation(userId)
    }

    createGroupConversation(conversationName: string, userIds: MatrixId[]): Promise<Conversation> {
        return this.messaging.createGroupConversation(conversationName, userIds)
    }

    doesConversationHaveUnreadMessages(conversation: Conversation): Promise<boolean> {
        return this.messaging.doesConversationHaveUnreadMessages(conversation)
    }

    //////        FRIENDS MANAGEMENT         //////
    getAllFriends(): Promise<MatrixId[]> {
        return this.friendsManagement.getAllFriends()
    }

    getPendingRequests(): Promise<FriendshipRequest[]> {
        return this.friendsManagement.getPendingRequests()
    }

    addAsFriend(userId: MatrixId): Promise<void> {
        return this.friendsManagement.addAsFriend(userId)
    }

    deleteFriendshipWith(userId: MatrixId): Promise<void> {
        return this.friendsManagement.deleteFriendshipWith(userId)
    }

    approveFriendshipRequestFrom(userId: MatrixId): Promise<void> {
        return this.friendsManagement.approveFriendshipRequestFrom(userId)
    }

    rejectFriendshipRequestFrom(userId: MatrixId): Promise<void> {
        return this.friendsManagement.rejectFriendshipRequestFrom(userId)
    }

    cancelFriendshipRequestTo(userId: MatrixId): Promise<void> {
        return this.friendsManagement.cancelFriendshipRequestTo(userId)
    }

    onFriendshipRequest(listener: (requestedBy: MatrixId) => void): void {
        return this.friendsManagement.onFriendshipRequest(listener)
    }

    onFriendshipRequestCancellation(listener: (canceledBy: MatrixId) => void): void {
        return this.friendsManagement.onFriendshipRequestCancellation(listener)
    }

    onFriendshipRequestRejection(listener: (rejectedBy: MatrixId) => void): void {
        return this.friendsManagement.onFriendshipRequestRejection(listener)
    }

    onFriendshipRequestApproval(listener: (approvedBy: MatrixId) => void): void {
        return this.friendsManagement.onFriendshipRequestApproval(listener)
    }

    onFriendshipDeletion(listener: (deletedBy: MatrixId) => void): void {
        return this.friendsManagement.onFriendshipDeletion(listener)
    }

}
