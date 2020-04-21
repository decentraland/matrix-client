import Matrix from 'matrix-js-sdk';
import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, LoginData, Conversation, MatrixId, TextMessage, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { ConversationCursor } from './ConversationCursor';
import { MessagingAPI } from './MessagingAPI';
import { SessionManagementAPI } from './SessionManagementAPI';
import { MessagingClient } from './MessagingClient';
import { SessionManagementClient } from './SessionManagementClient';

export class SocialClient implements MessagingAPI, SessionManagementAPI{

    private readonly sessionManagement: SessionManagementAPI;
    private readonly messaging: MessagingAPI;

    constructor(synapseUrl: string) {
        const matrixClient: Matrix.MatrixClient = Matrix.createClient({
            baseUrl: synapseUrl,
            timelineSupport: true,
        })

        this.sessionManagement = new SessionManagementClient(matrixClient)
        this.messaging = new MessagingClient(matrixClient)
    }

    //////    SESSION - STATUS MANAGEMENT    //////
    loginWithEthAddress(ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<LoginData> {
        return this.sessionManagement.loginWithEthAddress(ethAddress, timestamp, authChain)
    }

    logout(): Promise<void> {
        return this.sessionManagement.logout()
    }

    getUserId(): MatrixId {
        return this.sessionManagement.getUserId()
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

}
