import Matrix from 'matrix-js-sdk';
import { Conversation, ConversationType, MatrixId, TextMessage, MessageType, MessageStatus, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { findEventInRoom, buildTextMessage, getOnlyMessagesTimelineSetFromRoom, getOnlyMessagesSentByMeTimelineSetFromRoom, matrixEventToBasicEventInfo, getOrCreateConversation } from './Utils';
import { ConversationCursor } from './ConversationCursor';
import { MessagingAPI } from './MessagingAPI';

export class MessagingClient implements MessagingAPI {

    private readonly lastSentMessage: Map<ConversationId, BasicMessageInfo> = new Map()

    constructor(private readonly client: Matrix.MatrixClient) {
        // Listen to events, and store the last message I send
        client.on("Room.timeline", (event, room) => {
            if (event.getType() === "m.room.message" &&
                event.getContent().msgtype === MessageType.TEXT &&
                event.getSender() === this.client.getUserId()) {
                    const currentLastSentMessage = this.lastSentMessage.get(room.roomId)
                    if (!currentLastSentMessage || currentLastSentMessage.timestamp < event.getTs()) {
                        this.lastSentMessage.set(room.roomId, matrixEventToBasicEventInfo(event))
                    }
            }
        });

        // Listen to invitations and accept them automatically
        client.on("RoomMember.membership", async (event, member) => {
            if (member.membership === "invite" && member.userId === this.client.getUserId()) {
                const isDirect = member.events.member.getContent().is_direct
                if (isDirect) {
                    await this.addDirectRoomToUser(event.getSender(), member.roomId)
                }
                await this.client.joinRoom(member.roomId)
            }
        });
    }

    /** Get all conversation the user has joined */
    async getAllCurrentConversations(): Promise<{ conversation: Conversation, unreadMessages: boolean }[]> {
        const rooms = await this.client.getVisibleRooms()
        return rooms
            .filter(room => room.getMyMembership() === 'join') // Consider rooms that I have joined
            .map(room => ({
                unreadMessages: this.doesRoomHaveUnreadMessages(room),
                conversation: {
                    id: room.roomId,
                    type: this.getConversationTypeFromRoom(this.client, room),
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
                event.getContent().msgtype !== MessageType.TEXT || // Make sure that the message is of type text
                event.getSender() === this.client.getUserId()) {  // Don't raise an event if I was the sender
                return;
            }

            // ignore anything but real-time updates at the end of the room:
            if (toStartOfTimeline || !data || !data.liveEvent) return;

            const conversation = {
                type: this.getConversationTypeFromRoom(this.client, room),
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
        const lastReadEventId: string | null = room.getEventReadUpTo(this.client.getUserId(), false)
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
        const { conversation, created } = await getOrCreateConversation(this.client, ConversationType.DIRECT, [userId])
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
        const { conversation } = await getOrCreateConversation(this.client, ConversationType.GROUP, userIds, conversationName)
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

    private getConversationTypeFromRoom(client: Matrix.MatrixClient, room: Matrix.Room): ConversationType {
        if (room.getInvitedAndJoinedMemberCount() === 2 ) {
            const membersWhoAreNotMe = room.currentState.getMembers().filter(member => member.userId !== client.getUserId());
            const otherMember = membersWhoAreNotMe[0].userId
            const mDirectEvent = client.getAccountData('m.direct')
            const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : { }
            const directRoomsToClient = directRoomMap[otherMember] ?? []
            if (directRoomsToClient.includes(room.roomId)) {
                return ConversationType.DIRECT
            }
        }
        return ConversationType.GROUP
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
