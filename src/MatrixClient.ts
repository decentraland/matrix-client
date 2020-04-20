import Matrix from 'matrix-js-sdk';
import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, LoginData, Conversation, ConversationType, MatrixId, TextMessage, MessageType, MessageStatus, MessageId, CursorOptions } from './types';
import { getConversationTypeFromRoom, findEventInRoom, buildTextMessage, getOnlyMessagesTimelineSetFromRoom } from './Utils';
import { ConversationCursor } from './ConversationCursor';

export class MatrixClient {

    private readonly client: Matrix.MatrixClient;

    constructor(synapseUrl: string) {
        this.client = Matrix.createClient({
            baseUrl: synapseUrl,
            timelineSupport: true,
        })
    }

    //////    SESSION - STATUS MANAGEMENT    //////
    async loginWithEthAddress(ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<LoginData> {
        // Actual login
        const loginData: LoginData = await this.client.login('m.login.decentraland', {
            identifier: {
                type: 'm.id.user',
                user: ethAddress.toLowerCase(),
            },
            timestamp: timestamp.toString(),
            auth_chain: authChain
        });

        const { user_id: myUserId } = loginData

        // Listen to invitations and accept them automatically
        this.client.on("RoomMember.membership", async (event, member) => {
            if (member.membership === "invite" && member.userId === myUserId) {
                const isDirect = member.events.member.getContent().is_direct
                if (isDirect) {
                    await this.addDirectRoomToUser(event.getSender(), member.roomId)
                }
                await this.client.joinRoom(member.roomId)
            }
        });

        // Start the client
        await this.client.startClient({
            pendingEventOrdering: 'detached',
            initialSyncLimit: 1, // We need at least one event for things to work, but we don't want to consider too many past events as 'live'
        });

        return loginData
    }

    async logout(): Promise<void> {
        await this.client.stopClient()
        await this.client.logout();
    }

    getUserId(): MatrixId {
        return this.client.getUserId()
    }

    //////             MESSAGING             //////

    /** Get all conversation the user has joined */
    async getAllCurrentConversations(): Promise<{ conversation: Conversation, unreadMessages: boolean }[]> {
        const rooms = await this.client.getVisibleRooms()
        return rooms
            .filter(room => room.getMyMembership() === 'join') // Consider rooms that I have joined
            .map(room => ({
                unreadMessages: this.doesRoomHaveUnreadMessages(room),
                conversation: {
                    id: room.roomId,
                    type: getConversationTypeFromRoom(this.client, room),
                }
            }))
    }

    /**
     * Send a message text to a conversation.
     * Returns the message id
     */
    async sendMessageTo(conversation: Conversation, message: string): Promise<MessageId> {
        const { event_id } = await this.client.sendTextMessage(conversation.id, message);
        return event_id
    }

    /** Mark a message (and all those that came before it on the conversation) as read */
    async markAsRead(conversation: Conversation, messageId: MessageId): Promise<void> {
        const { id: roomId } = conversation
        const event = await findEventInRoom(this.client, roomId, messageId)
        return this.client.sendReadReceipt(event)
    }

    /**
     * Listen to new messages
     */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void {
        this.client.on("Room.timeline", (event, room, toStartOfTimeline, _, data) => {

            if (event.getType() !== "m.room.message" || // Make sure that it is in fact a message
                event.getSender() === this.client.getUserId() || // Make sure that I wasn't the sender
                event.getContent().msgtype !== MessageType.TEXT) { // Make sure that the message is text typed
                return;
            }

            // ignore anything but real-time updates at the end of the room:
            if (toStartOfTimeline || !data || !data.liveEvent) return;

            const conversation = {
                type: getConversationTypeFromRoom(this.client, room),
                id: room.roomId
            }

            const message: TextMessage = buildTextMessage(event, MessageStatus.UNREAD)

            listener(conversation, message)
        });
    }

    /** Returns a cursor located on the given message */
    getCursorOnMessage(conversation: Conversation, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.client, conversation.id, messageId, options)
    }

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        const room = this.client.getRoom(conversation.id)
        const lastReadEvent: string | null = room.getEventReadUpTo(this.client.getUserId(), false)
        return ConversationCursor.build(this.client, conversation.id, lastReadEvent, options)
    }

    /**
     * Returns a cursor located at the end of the conversation
     */
    getCursorOnLastMessage(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.client, conversation.id, undefined, options)
    }

    /** Get or create a direct conversation with the given user */
    async createDirectConversation(userId: MatrixId): Promise<Conversation> {
        const { conversation, created } = await this.getOrCreateConversation(ConversationType.DIRECT, [userId])
        if (created) {
            await this.addDirectRoomToUser(userId, conversation.id)
        }
        return conversation
    }

    /** Get or create a group conversation with the given users */
    async createGroupConversation(conversationName: string, userIds: MatrixId[]): Promise<Conversation> {
        if (userIds.length < 2) {
            throw new Error('Group conversations must include two or more people.')
        }
        const { conversation } = await this.getOrCreateConversation(ConversationType.GROUP, userIds, conversationName)
        return conversation
    }

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversation: Conversation): boolean {
        const room = this.client.getRoom(conversation.id)
        return this.doesRoomHaveUnreadMessages(room)
    }

    private async addDirectRoomToUser(userId: MatrixId, roomId: string): Promise<void> {
        // The documentation specifies that we should store a map from user to direct rooms in the 'm.direct' event
        // However, we only support having one direct room to each user, so the list will only have one element
        const mDirectEvent = this.client.getAccountData('m.direct')
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : { }
        directRoomMap[userId] = [roomId]
        await this.client.setAccountData('m.direct', directRoomMap)
    }

    /**
     * Find or create a conversation for the given other users. There is no need to include the
     * current user id.
     */
    private async getOrCreateConversation(type: ConversationType, userIds: MatrixId[], conversationName?: string): Promise<{ conversation: Conversation, created: boolean }> {
        const allUsersInConversation = [this.client.getUserIdLocalpart(), ...userIds]
        const alias = this.buildAliasForConversationWithUsers(allUsersInConversation)
        const result: { room_id: string } | undefined = await this.undefinedIfError(() => this.client.getRoomIdForAlias(this.toQualifiedAlias(alias)))
        let roomId: string
        let created: boolean
        if (!result) {
            const creationResult = await this.client.createRoom({
                room_alias_name: alias,
                preset: 'trusted_private_chat',
                is_direct: type === ConversationType.DIRECT,
                invite: userIds,
                name: conversationName,
            })
            roomId = creationResult.room_id
            created = true
        } else {
            roomId = result.room_id
            created = false
        }

        return {
            conversation: {
                type,
                id: roomId
            },
            created
        }
    }

    private buildAliasForConversationWithUsers(userIds: (MatrixId | MatrixIdLocalpart)[]): string {
        if (userIds.length < 2) {
            throw new Error('Conversation must have two users or more.')
        }
        return userIds.map(userId => this.toLocalpart(userId))
            .filter((elem, pos, array) => array.indexOf(elem) === pos)
            .sort()
            .join('+')
    }

    private toQualifiedAlias(aliasLocalpart: string) {
        return `#${aliasLocalpart}:${this.client.getDomain()}`
    }

    private toLocalpart(userId: MatrixId): MatrixIdLocalpart {
        if (!userId.includes(':')) {
            return userId
        }
        return userId.split(":")[0].substring(1);
    }

    private async undefinedIfError<T>(call: () => Promise<T>): Promise<T | undefined>  {
        try {
            return await call()
        } catch (error) {
            return undefined
        }
    }

    // Logic copied from Matrix React SDK
    private doesRoomHaveUnreadMessages(room): boolean {
        // Fetch message events
        const timelineSet = getOnlyMessagesTimelineSetFromRoom(this.client, room)
        const timeline = timelineSet.getLiveTimeline().getEvents()

        // If there are no messages, then there are no unread messages
        if (timeline.length === 0) {
            return false
        }

        const lastMessageEvent = timeline[timeline.length - 1]

        // If I was the last to send a message, then there are no unread messages
        if (lastMessageEvent.getSender() === this.getUserId()) {
            return false
        }

        const readUpToId = room.getEventReadUpTo(this.getUserId());

        // If I already read the last message, then there are no unread messages
        if (lastMessageEvent.getId() === readUpToId) {
            return false
        }

        return true
    }

}

type MatrixIdLocalpart = string

