import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { Room } from 'matrix-js-sdk/lib/models/room'
import { Conversation, ConversationType, SocialId, TextMessage, MessageType, MessageStatus, MessageId, CursorOptions, ConversationId, BasicMessageInfo } from './types';
import { findEventInRoom, buildTextMessage, getOnlyMessagesTimelineSetFromRoom, getOnlyMessagesSentByMeTimelineSetFromRoom, matrixEventToBasicEventInfo, getConversationTypeFromRoom } from './Utils';
import { ConversationCursor } from './ConversationCursor';
import { MessagingAPI } from './MessagingAPI';

export class MessagingClient implements MessagingAPI {

    private readonly lastSentMessage: Map<ConversationId, BasicMessageInfo> = new Map()

    constructor(private readonly matrixClient: MatrixClient) {
        // Listen to events, and store the last message I send
        matrixClient.on("Room.timeline", (event, room) => {
            if (event.getType() === "m.room.message" &&
                event.getContent().msgtype === MessageType.TEXT &&
                event.getSender() === this.matrixClient.getUserId()) {
                    const currentLastSentMessage = this.lastSentMessage.get(room.roomId)
                    if (!currentLastSentMessage || currentLastSentMessage.timestamp < event.getTs()) {
                        this.lastSentMessage.set(room.roomId, matrixEventToBasicEventInfo(event))
                    }
            }
        });

        // Listen to invitations and accept them automatically
        matrixClient.on("RoomMember.membership", async (_, member) => {
            if (member.membership === "invite" && member.userId === this.matrixClient.getUserId()) {
                await this.joinRoom(member)
            }
        });

        // Listen to when the sync is finishes, and join all rooms I was invited to
        matrixClient.once('sync', async (state) => {
            if (state === 'PREPARED') {
                const rooms = this.getAllRooms()
                const join: Promise<void>[] = rooms
                    .filter(room => room.getMyMembership() === 'invite') // Consider rooms that I have been invited to
                    .map(room => {
                        const member = room.getMember(this.matrixClient.getUserId())
                        return this.joinRoom(member)
                    })
                await Promise.all(join)
            }
        });
    }

    /** Get all conversation the user has joined */
    getAllCurrentConversations(): { conversation: Conversation, unreadMessages: boolean }[] {
        const rooms = this.getAllRooms()
        return rooms
            .filter(room => room.getMyMembership() === 'join') // Consider rooms that I have joined
            .map(room => ({
                unreadMessages: this.doesRoomHaveUnreadMessages(room),
                conversation: {
                    id: room.roomId,
                    type: getConversationTypeFromRoom(this.matrixClient, room),
                }
            }))
    }

    /**
     * Send a message text to a conversation.
     * Returns the message id
     */
    async sendMessageTo(conversationId: ConversationId, message: string): Promise<MessageId> {
        const { event_id } = await this.matrixClient.sendTextMessage(conversationId, message);
        return event_id
    }

    /** Mark a message (and all those that came before it on the conversation) as read */
    async markAsRead(conversationId: ConversationId, messageId: MessageId): Promise<void> {
        let event = findEventInRoom(this.matrixClient, conversationId, messageId)
        if (!event) {
            // If I couldn't find it locally, then fetch it from the server
            const eventRaw = await this.matrixClient.fetchRoomEvent(conversationId, messageId)
            event = new MatrixEvent(eventRaw)
        }
        return this.matrixClient.sendReadReceipt(event)
    }

    /**
     * Listen to new messages
     */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void {
        this.matrixClient.on("Room.timeline", (event, room, toStartOfTimeline, _, data) => {

            if (event.getType() !== "m.room.message" || // Make sure that it is in fact a message
                event.getContent().msgtype !== MessageType.TEXT || // Make sure that the message is of type text
                event.getSender() === this.matrixClient.getUserId()) {  // Don't raise an event if I was the sender
                return;
            }

            // Ignore anything but real-time updates at the end of the room
            if (toStartOfTimeline || !data || !data.liveEvent) return;

            // Just listen to the unfiltered timeline, so we don't raise the same message more than once
            if (data.timeline.getFilter()) return

            const conversation = {
                type: getConversationTypeFromRoom(this.matrixClient, room),
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
    getLastReadMessage(conversationId: ConversationId): BasicMessageInfo | undefined {
        // Fetch last message marked as read
        const room = this.matrixClient.getRoom(conversationId)
        const lastReadEventId: string | null = room.getEventReadUpTo(this.matrixClient.getUserId(), false)
        const lastReadMatrixEvent: Event | undefined = lastReadEventId ? findEventInRoom(this.matrixClient, conversationId, lastReadEventId) : undefined
        const lastReadEvent: BasicMessageInfo | undefined = lastReadMatrixEvent ? matrixEventToBasicEventInfo(lastReadMatrixEvent) : undefined

        // Fetch last message sent by me
        let lastEventSentByMe: BasicMessageInfo | undefined
        const knownLastSentMessage: BasicMessageInfo | undefined = this.lastSentMessage.get(conversationId)
        if (knownLastSentMessage) {
            lastEventSentByMe = knownLastSentMessage
        } else {
            const timelineSet = getOnlyMessagesSentByMeTimelineSetFromRoom(this.matrixClient, room)
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

        return undefined
    }

    /** Returns a cursor located on the given message */
    getCursorOnMessage(conversationId: ConversationId, messageId: MessageId, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.matrixClient, conversationId, messageId, roomId => this.getLastReadMessage(roomId), options)
    }

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor> {
        const lastReadMessage = this.getLastReadMessage(conversationId)
        return ConversationCursor.build(this.matrixClient, conversationId, lastReadMessage?.id, roomId => this.getLastReadMessage(roomId), options)
    }

    /**
     * Returns a cursor located at the end of the conversation
     */
    getCursorOnLastMessage(conversationId: ConversationId, options?: CursorOptions): Promise<ConversationCursor> {
        return ConversationCursor.build(this.matrixClient, conversationId, undefined, roomId => this.getLastReadMessage(roomId), options)
    }

    /** Get or create a direct conversation with the given user */
    async createDirectConversation(userId: SocialId): Promise<Conversation> {
        const { conversation, created } = await this.getOrCreateConversation(this.matrixClient, ConversationType.DIRECT, [userId])
        if (created) {
            await this.addDirectRoomToUser(userId, conversation.id)
        }
        return conversation
    }

    /** Get or create a group conversation with the given users */
    async createGroupConversation(conversationName: string, userIds: SocialId[]): Promise<Conversation> {
        if (userIds.length < 2) {
            throw new Error('Group conversations must include two or more people.')
        }
        const { conversation } = await this.getOrCreateConversation(this.matrixClient, ConversationType.GROUP, userIds, conversationName)
        return conversation
    }

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean {
        const room = this.matrixClient.getRoom(conversationId)
        return this.doesRoomHaveUnreadMessages(room)
    }

    private async assertThatUsersExist(userIds: SocialId[]): Promise<void> {
        const unknownUsers = userIds.filter(userId => this.matrixClient.getUser(userId) === null)
        const existsCheck = await Promise.all(unknownUsers
            .map<Promise<[string, { results: any[] }]>>(async userId => [userId, await this.matrixClient.searchUserDirectory({ term: this.toLocalpart(userId) })]))
        const doesNotExist: SocialId[] = existsCheck
            .filter(([, { results }]) => results.length === 0)
            .map(([userId]) => userId)
        if (doesNotExist.length > 0) {
            throw new UnknownUsersError(doesNotExist)
        }
    }

    /**
     * Find or create a conversation for the given other users. There is no need to include the
     * current user id.
     */
    private async getOrCreateConversation(client: MatrixClient, type: ConversationType, userIds: SocialId[], conversationName?: string): Promise<{ conversation: Conversation, created: boolean }> {
        await this.assertThatUsersExist(userIds)
        const allUsersInConversation = [client.getUserIdLocalpart(), ...userIds]
        const alias = this.buildAliasForConversationWithUsers(allUsersInConversation)
        let roomId: string
        let created: boolean
        // First, try to find the alias locally
        const room: Room | undefined = this.findRoomByAliasLocally(`#${alias}:${client.getDomain()}`)
        if (room) {
            roomId = room.roomId
            created = false
        } else {
            // Try to find alias on the server
            const result: { room_id: string } | undefined = await this.undefinedIfError(() => client.getRoomIdForAlias(`#${alias}:${client.getDomain()}`))
            if (result) {
                roomId = result.room_id
                created = false
            } else {
                // If alias wasn't found, then create the room
                const creationResult = await client.createRoom({
                    room_alias_name: alias,
                    preset: 'trusted_private_chat',
                    is_direct: type === ConversationType.DIRECT,
                    invite: userIds,
                    name: conversationName,
                })
                roomId = creationResult.room_id
                created = true
            }
        }

        return {
            conversation: {
                type,
                id: roomId
            },
            created
        }
    }

    private findRoomByAliasLocally(alias: string): Room | undefined {
        return this.getAllRooms()
            .filter(room => room.getCanonicalAlias() === alias)[0]
    }

    private async joinRoom(member): Promise<void> {
        const event = member.events.member;
        const isDirect = event.getContent().is_direct
        if (isDirect) {
            await this.addDirectRoomToUser(event.getSender(), member.roomId)
        }
        await this.matrixClient.joinRoom(member.roomId)
    }

    private buildAliasForConversationWithUsers(userIds: (SocialId | MatrixIdLocalpart)[]): string {
        if (userIds.length < 2) {
            throw new Error('Conversation must have two users or more.')
        }
        return userIds.map(userId => this.toLocalpart(userId))
            .filter((elem, pos, array) => array.indexOf(elem) === pos)
            .sort()
            .join('+')
    }

    private toLocalpart(userId: SocialId): MatrixIdLocalpart {
        if (!userId.includes(':')) {
            return userId.toLowerCase()
        }
        return userId.split(":")[0].substring(1).toLowerCase();
    }

    private async undefinedIfError<T>(call: () => Promise<T>): Promise<T | undefined>  {
        try {
            return await call()
        } catch (error) {
            return undefined
        }
    }

    private getAllRooms() {
        return this.matrixClient.getVisibleRooms()
            .filter(room => !room.tags.hasOwnProperty('m.server_notice'))
    }

    private async addDirectRoomToUser(userId: SocialId, roomId: string): Promise<void> {
        // The documentation specifies that we should store a map from user to direct rooms in the 'm.direct' event
        // However, we only support having one direct room to each user, so the list will only have one element
        const mDirectEvent = this.matrixClient.getAccountData('m.direct')
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : { }
        directRoomMap[userId] = [roomId]
        await this.matrixClient.setAccountData('m.direct', directRoomMap)
    }

    private doesRoomHaveUnreadMessages(room): boolean {
        // Fetch message events
        const timelineSet = getOnlyMessagesTimelineSetFromRoom(this.matrixClient, room)
        const timeline = timelineSet.getLiveTimeline().getEvents()

        // If there are no messages, then there are no unread messages
        if (timeline.length === 0) {
            return false
        }

        const lastMessageEvent = timeline[timeline.length - 1]

        const lastReadMessage = this.getLastReadMessage(room.roomId)

        if (!lastReadMessage) {
            return true
        } else {
            return lastMessageEvent.getTs() > lastReadMessage.timestamp
        }
    }

}

export class UnknownUsersError extends Error {

    constructor(private readonly unknownUsers: SocialId[]) {
        super(`Some of the given users are not part of the system: '${unknownUsers.join(', ')}'`)
    }

    getUnknownUsers(): SocialId[] {
        return this.unknownUsers
    }

}

type MatrixIdLocalpart = string
