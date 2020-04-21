import Matrix from 'matrix-js-sdk';
import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, LoginData, Conversation, ConversationType, MatrixId, TextMessage, MessageType, MessageStatus, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { getConversationTypeFromRoom, findEventInRoom, buildTextMessage, getOnlyMessagesTimelineSetFromRoom, getOnlyMessagesSentByMeTimelineSetFromRoom, matrixEventToBasicEventInfo } from './Utils';
import { ConversationCursor } from './ConversationCursor';

export class MatrixClient {

    private readonly client: Matrix.MatrixClient;
    private readonly lastSentMessage: Map<ConversationId, BasicMessageInfo> = new Map()

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
            initialSyncLimit: 0, // We don't want to consider past events as 'live'
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
                event.getContent().msgtype !== MessageType.TEXT) { // Make sure that the message is text typed
                return;
            }

            // Update the last sent message
            if (event.getSender() === this.getUserId()) {
                const currentLastSentMessage = this.lastSentMessage.get(room.roomId)
                if (!currentLastSentMessage || currentLastSentMessage.timestamp < event.getTs()) {
                    this.lastSentMessage.set(room.roomId, matrixEventToBasicEventInfo(event))
                }
                return; // Don't raise an event if I was the sender
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

    /**
     * Return basic information about the last read message. Since we don't mark messages sent by me as read,
     * we also check against the last sent message.
     */
    async getLastReadMessage(conversationId: ConversationId): Promise<BasicMessageInfo | undefined> {
        // Fetch last message marked as read
        const room = this.client.getRoom(conversationId)
        const lastReadEventId: string | null = room.getEventReadUpTo(this.getUserId(), false)
        const lastReadMatrixEvent: Matrix.Event | undefined = lastReadEventId ? await findEventInRoom(this.client, conversationId, lastReadEventId) : undefined
        const lastReadEvent: BasicMessageInfo | undefined = lastReadMatrixEvent ? matrixEventToBasicEventInfo(lastReadMatrixEvent) : undefined

        // Fetch last message sent by me
        let lastEventSentByMe: BasicMessageInfo | undefined
        const knownLastSentMessage: BasicMessageInfo | undefined = this.lastSentMessage.get(conversationId)
        if (knownLastSentMessage) {
            lastEventSentByMe = knownLastSentMessage
        } else {
            const timelineSet = getOnlyMessagesSentByMeTimelineSetFromRoom(this.client, room)
            const events = timelineSet.getLiveTimeline().getEvents()
            const lastMatrixEventSentByMe = events[events.length - 1]
            if (lastMatrixEventSentByMe) {
                lastEventSentByMe = matrixEventToBasicEventInfo(lastMatrixEventSentByMe)
                this.lastSentMessage.set(conversationId, lastEventSentByMe)
            }
        }

        // Compare and return the latest
        if (lastReadEvent && lastEventSentByMe) {
            return lastReadEvent.timestamp > lastEventSentByMe.timestamp ? lastReadEvent : lastEventSentByMe
        } else if (lastReadEvent) {
            return lastReadEvent
        } else if (lastEventSentByMe) {
            return lastEventSentByMe
        }

        return Promise.resolve(undefined)
    }

    /** Returns a cursor located on the given message */
    getCursorOnMessage(conversation: Conversation, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.client, conversation.id, messageId, roomId => this.getLastReadMessage(roomId), options)
    }

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    async getCursorOnLastRead(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        const lastReadMessage = await this.getLastReadMessage(conversation.id)
        return ConversationCursor.build(this.client, conversation.id, lastReadMessage?.id, roomId => this.getLastReadMessage(roomId), options)
    }

    /**
     * Returns a cursor located at the end of the conversation
     */
    getCursorOnLastMessage(conversation: Conversation, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.client, conversation.id, undefined, roomId => this.getLastReadMessage(roomId), options)
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
    doesConversationHaveUnreadMessages(conversation: Conversation): Promise<boolean> {
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

    private async doesRoomHaveUnreadMessages(room): Promise<boolean> {
        // Fetch message events
        const timelineSet = getOnlyMessagesTimelineSetFromRoom(this.client, room)
        const timeline = timelineSet.getLiveTimeline().getEvents()

        // If there are no messages, then there are no unread messages
        if (timeline.length === 0) {
            return Promise.resolve(false)
        }

        const lastMessageEvent = timeline[timeline.length - 1]
        const lastReadMessage = await this.getLastReadMessage(room.getRoomId)

        if (!lastReadMessage) {
            return Promise.resolve(true)
        } else {
            return lastMessageEvent.getTs() !== lastReadMessage.timestamp
        }
    }

}

type MatrixIdLocalpart = string

