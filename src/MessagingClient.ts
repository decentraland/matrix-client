import { ClientEvent, IPublicRoomsChunkRoom, MatrixClient } from 'matrix-js-sdk/lib/client'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { Room, RoomEvent } from 'matrix-js-sdk/lib/models/room'
import {
    Conversation,
    ConversationType,
    SocialId,
    TextMessage,
    MessageType,
    MessageStatus,
    MessageId,
    CursorOptions,
    ConversationId,
    BasicMessageInfo,
    CHANNEL_TYPE,
    GetOrCreateConversationResponse,
    SearchChannelsResponse,
    Channel,
    ProfileInfo,
    Member
} from './types'
import {
    findEventInRoom,
    buildTextMessage,
    getOnlyMessagesSentByMeTimelineSetFromRoom,
    matrixEventToBasicEventInfo,
    getConversationTypeFromRoom,
    waitSyncToFinish
} from './Utils'
import { ConversationCursor } from './ConversationCursor'
import { MessagingAPI } from './MessagingAPI'
import { SocialClient } from './SocialClient'
import { SyncState } from 'matrix-js-sdk/lib/sync'
import { RoomMember, RoomMemberEvent } from 'matrix-js-sdk/lib/models/room-member'
import { EventType } from 'matrix-js-sdk/lib/@types/event'
import { RoomStateEvent } from 'matrix-js-sdk/lib/models/room-state'
import { Preset, Visibility } from 'matrix-js-sdk/lib/@types/partials'
import { ICreateRoomOpts } from 'matrix-js-sdk/lib/@types/requests'

// TODO: Delete this when matrix-client exports the actual one
interface IPublicRoomsResponse {
    chunk: IPublicRoomsChunkRoom[]
    next_batch?: string
    prev_batch?: string
    total_room_count_estimate?: number
}

/**
 * The channel name should always match with the regex: ^[a-zA-Z0-9-]{3,20}$
 * @param channelId a string with the channelId to validate
 * */
function validateRegexChannelId(channelId: string) {
    const regex = /^[a-zA-Z0-9-]{3,20}$/

    if (channelId.match(regex)) return true

    return false
}

const CHANNEL_RESERVED_IDS = ['nearby']

export class MessagingClient implements MessagingAPI {
    private readonly lastSentMessage: Map<ConversationId, BasicMessageInfo> = new Map()

    // @internal
    constructor(private readonly matrixClient: MatrixClient, private readonly socialClient: SocialClient) {
        // Listen to when the sync is finishes, and join all rooms I was invited to
        const resolveOnSync = async (state: SyncState) => {
            if (state === 'SYNCING') {
                const members: RoomMember[] = []
                const rooms = this.getAllRooms()
                const join: Promise<void>[] = rooms
                    .filter(room => room.getMyMembership() === 'invite') // Consider rooms that I have been invited to
                    .map(room => {
                        const member = room.getMember(this.socialClient.getUserId())
                        if (member) {
                            members.push(member)
                        }
                        return this.joinRoom(member)
                    })

                await this.addDirectRoomsToUser(members)

                await Promise.all(join)

                // remove this listener, otherwhise, it'll be listening all the session and calling an invalid function
                matrixClient.removeListener(ClientEvent.Sync, resolveOnSync)
            }
        }
        matrixClient.on(ClientEvent.Sync, resolveOnSync)
    }

    listenToEvents(): void {
        // Listen to events, and store the last message I send
        this.matrixClient.on(RoomEvent.Timeline, (event, room) => {
            if (!room) return
            if (
                event.getType() === 'm.room.message' &&
                event.getContent().msgtype === MessageType.TEXT &&
                event.getSender() === this.socialClient.getUserId()
            ) {
                const currentLastSentMessage = this.lastSentMessage.get(room.roomId)
                if (!currentLastSentMessage || currentLastSentMessage.timestamp < event.getTs()) {
                    this.lastSentMessage.set(room.roomId, matrixEventToBasicEventInfo(event))
                }
            }
        })

        // Listen to invitations and accept them automatically
        this.matrixClient.on(RoomMemberEvent.Membership, async (_, member) => {
            if (member.membership === 'invite' && member.userId === this.socialClient.getUserId()) {
                await waitSyncToFinish(this.matrixClient)

                await this.addDirectRoomsToUser([member])

                await this.joinRoom(member)
            }
        })
    }

    /** @internal */
    getRoomInformation(room: Room): { conversation: Conversation; unreadMessages: boolean }
    /** @public */
    getRoomInformation(room: any): { conversation: Conversation; unreadMessages: boolean }
    getRoomInformation(room: Room): { conversation: Conversation; unreadMessages: boolean } {
        const otherId = room.guessDMUserId()
        const unreadMessages = this.getRoomUnreadMessages(room)
        const type = getConversationTypeFromRoom(this.matrixClient, room)
        return {
            unreadMessages: this.doesRoomHaveUnreadMessages(room),
            conversation: {
                id: room.roomId,
                type,
                unreadMessages: unreadMessages.length > 0 ? unreadMessages : undefined,
                lastEventTimestamp: room.timeline[room.timeline.length - 1]?.getTs(),
                userIds:
                    type === ConversationType.DIRECT
                        ? [this.socialClient.getUserId(), otherId]
                        : room
                              .getMembers()
                              .filter(x => x.membership === 'join')
                              .map(x => x.userId),
                hasMessages: room.timeline.some(event => event.getType() === EventType.RoomMessage),
                name: room.name
            }
        }
    }

    async getProfileInfo(userId: string): Promise<ProfileInfo> {
        const profile = await this.matrixClient.getProfileInfo(userId)

        return { displayName: profile.displayname, avatarUrl: profile.avatar_url }
    }

    getMemberInfo(roomId: string, userId: string): ProfileInfo {
        const member = this.matrixClient.getRoom(roomId)?.getMember(userId)
        if (!member) return {}

        return {
            displayName: member.name,
            avatarUrl: member.getMxcAvatarUrl() ?? undefined
        }
    }

    /**
     * Get all conversation the user has joined including DMs, channels, etc
     */
    getAllCurrentConversations(): { conversation: Conversation; unreadMessages: boolean }[] {
        const rooms = this.getAllRooms()
        return rooms
            .filter(room => room.getMyMembership() === 'join') // Consider rooms that I have joined
            .map(room => this.getRoomInformation(room))
    }

    /**
     * Get all conversation with unread messages the user has joined including DMs, channels, etc
     */
    getAllConversationsWithUnreadMessages(): Conversation[] {
        return this.getAllCurrentConversations()
            .filter(conv => conv.unreadMessages)
            .map((conv): Conversation => conv.conversation)
    }

    /**
     * Get all conversation with the user's current friends
     * @returns `conversation` & `unreadMessages` boolean that indicates whether the conversation has unread messages.
     */
    getAllCurrentFriendsConversations(): { conversation: Conversation; unreadMessages: boolean }[] {
        const rooms = this.socialClient.getAllFriendsRooms()
        return rooms.map(room => this.getRoomInformation(room))
    }

    /** Get total number of unseen messages from all conversations the user has joined */
    getTotalUnseenMessages(): number {
        const rooms = this.getAllRooms()
        return rooms
            .filter(room => room.getMyMembership() === 'join') // Consider rooms that I have joined
            .reduce((accumulator, current) => {
                return accumulator + this.getRoomUnreadMessages(current).length
            }, 0)
    }

    /**
     * Send a message text to a conversation.
     * @returns the message id
     */
    async sendMessageTo(conversationId: ConversationId, message: string): Promise<MessageId> {
        const { event_id } = await this.matrixClient.sendTextMessage(conversationId, message)
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
        await this.matrixClient.sendReadReceipt(event)
    }

    /** Mark all messages in the conversation as seen */
    async markMessagesAsSeen(conversationId: ConversationId): Promise<void> {
        const room = this.matrixClient.getRoom(conversationId)
        // If there is no room, then there are no messages to mark as read. Anyway, we expect to always be able to get the room,
        // since the method is called when the user opens a conversation.
        if (!room) {
            return
        }

        const roomMessages = room.timeline.filter(event => event.getType() === EventType.RoomMessage)
        const lastMessage = roomMessages[roomMessages.length - 1].getId()

        await this.markAsRead(conversationId, lastMessage)
    }

    /**
     * Listen to new messages
     */
    onMessage(listener: (conversation: Conversation, message: TextMessage) => void): void {
        this.matrixClient.on(RoomEvent.Timeline, (event, room, toStartOfTimeline, _, data) => {
            if (
                event.getType() !== 'm.room.message' || // Make sure that it is in fact a message
                event.getContent().msgtype !== MessageType.TEXT // Make sure that the message is of type text
            ) {
                return
            }

            // Ignore anything but real-time updates at the end of the room
            if (toStartOfTimeline || !data || !data.liveEvent) return

            // Just listen to the unfiltered timeline, so we don't raise the same message more than once
            if (data.timeline.getFilter()) return

            if (!room) return

            const conversation = {
                type: getConversationTypeFromRoom(this.matrixClient, room),
                id: room.roomId
            }

            const message: TextMessage = buildTextMessage(event, MessageStatus.UNREAD)

            listener(conversation, message)
        })
    }

    /**
     * Listen to updates on the membership of a channel
     * @doc {membership} join | leave | invite
     */
    onChannelMembership(listener: (conversation: Conversation, membership: string) => void): void {
        this.matrixClient.on(RoomEvent.MyMembership, async (room, membership) => {
            if (!room || room.getType() !== CHANNEL_TYPE) return // we only want to know about the updates related to channels

            // Room creators already know about this room
            if (membership === 'join' && this.socialClient.getUserId() === room.getCreator()) return

            await waitSyncToFinish(this.matrixClient)

            const savedRoom = this.matrixClient.getRoom(room.roomId)
            const conversation = this.getRoomInformation(savedRoom).conversation

            listener(conversation, membership)
        })
    }

    /**
     * Listen to updates on the members of a channel
     */
    onChannelMembers(listener: (conversation: Conversation, members: Member[]) => void): void {
        this.matrixClient.on(RoomStateEvent.Members, async (_event, state) => {
            await waitSyncToFinish(this.matrixClient)
            const room = this.matrixClient.getRoom(state.roomId)
            if (!room || room.getType() !== CHANNEL_TYPE) return // we only want to know about the updates related to channels

            const stateMembers = state.getMembers()
            const members = stateMembers.map(member => ({ name: member.name, userId: member.userId }))

            const conversation = this.getRoomInformation(room).conversation
            listener(conversation, members)
        })
    }
    /**
     * Return basic information about the last read message. Since we don't mark messages sent by me as read,
     * we also check against the last sent message.
     */
    getLastReadMessage(conversationId: ConversationId): BasicMessageInfo | undefined {
        // Fetch last message marked as read
        const room = this.matrixClient.getRoom(conversationId)
        const lastReadEventId = room?.getEventReadUpTo(this.socialClient.getUserId(), false)
        const lastReadMatrixEvent = lastReadEventId
            ? findEventInRoom(this.matrixClient, conversationId, lastReadEventId)
            : undefined
        const lastReadEvent = lastReadMatrixEvent ? matrixEventToBasicEventInfo(lastReadMatrixEvent) : undefined

        // Fetch last message sent by me
        let lastEventSentByMe: BasicMessageInfo | undefined
        const knownLastSentMessage: BasicMessageInfo | undefined = this.lastSentMessage.get(conversationId)
        if (knownLastSentMessage) {
            lastEventSentByMe = knownLastSentMessage
        } else {
            const timelineSet = getOnlyMessagesSentByMeTimelineSetFromRoom(this.socialClient, room)
            const events = timelineSet?.getLiveTimeline().getEvents()
            const lastMatrixEventSentByMe = events ? events[events.length - 1] : undefined
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

    /**
     * Returns a cursor located on the given message. If there is no given message, then it is
     * located at the end of the conversation.
     */
    getCursorOnMessage(
        conversationId: ConversationId,
        messageId?: MessageId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        return ConversationCursor.build(
            this.matrixClient,
            this.socialClient.getUserId(),
            conversationId,
            messageId,
            roomId => this.getLastReadMessage(roomId),
            options
        )
    }

    /**
     * Returns a cursor located on the last read message. If no messages were read, then
     * it is located at the end of the conversation.
     */
    getCursorOnLastRead(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        const lastReadMessage = this.getLastReadMessage(conversationId)
        return ConversationCursor.build(
            this.matrixClient,
            this.socialClient.getUserId(),
            conversationId,
            lastReadMessage?.id,
            roomId => this.getLastReadMessage(roomId),
            options
        )
    }

    /**
     * Returns a cursor located at the end of the conversation
     */
    getCursorOnLastMessage(
        conversationId: ConversationId,
        options?: CursorOptions
    ): Promise<ConversationCursor | undefined> {
        return ConversationCursor.build(
            this.matrixClient,
            this.socialClient.getUserId(),
            conversationId,
            undefined,
            roomId => this.getLastReadMessage(roomId),
            options
        )
    }

    /** Get or create a direct conversation with the given user */
    async createDirectConversation(userId: SocialId): Promise<Conversation> {
        const { conversation, created } = await this.getOrCreateConversation(ConversationType.DIRECT, [userId])

        if (created) {
            await this.addDirectRoomToUser(userId, conversation.id)
        }

        return conversation
    }

    /** Get or create a group conversation with the given users
     * This is a direct conversation between multiple users
     */
    async createGroupConversation(conversationName: string, userIds: SocialId[]): Promise<Conversation> {
        if (userIds.length < 2) {
            throw new Error('Group conversations must include two or more people. ')
        }
        const { conversation } = await this.getOrCreateConversation(ConversationType.GROUP, userIds, conversationName)
        return conversation
    }

    /** Get or create a channel with the given users
     * If the channel already exists this will return the channel and won't invite the passed ids
     * If the channel is created, all user ids will be invited to join
     */
    async getOrCreateChannel(channelName: string, userIds: SocialId[]): Promise<GetOrCreateConversationResponse> {
        if (CHANNEL_RESERVED_IDS.includes(channelName.toLocaleLowerCase())) {
            throw new ChannelsError(ChannelErrorKind.RESERVED_NAME)
        }

        if (!validateRegexChannelId(channelName)) {
            throw new ChannelsError(ChannelErrorKind.BAD_REGEX)
        }

        try {
            return this.getOrCreateConversation(ConversationType.CHANNEL, userIds, channelName, channelName, {
                preset: Preset.PublicChat,
                is_direct: false,
                visibility: Visibility.Public,
                creation_content: {
                    type: CHANNEL_TYPE
                }
            })
        } catch (error) {
            throw new ChannelsError(ChannelErrorKind.GET_OR_CREATE)
        }
    }

    /**
     * Join a channel
     * @param roomIdOrChannelAlias the room id or name of the channel.
     */
    async joinChannel(roomIdOrChannelAlias: string): Promise<void> {
        try {
            // The doc says you can pass the room ID or room alias to join, but that's not true -.-
            // Technically we can validate if we have received a name with the regular expression
            const isAlias = validateRegexChannelId(roomIdOrChannelAlias)
            if (isAlias) {
                roomIdOrChannelAlias = `#${roomIdOrChannelAlias}:${this.matrixClient.getDomain()}`
            }
            await this.matrixClient.joinRoom(roomIdOrChannelAlias)
        } catch (error) {
            throw new ChannelsError(ChannelErrorKind.JOIN)
        }
    }

    async leaveChannel(roomId: string): Promise<void> {
        try {
            await this.matrixClient.leave(roomId)
        } catch (error) {
            throw new ChannelsError(ChannelErrorKind.LEAVE)
        }
    }

    /** Return whether a conversation has unread messages or not */
    doesConversationHaveUnreadMessages(conversationId: ConversationId): boolean {
        const room = this.matrixClient.getRoom(conversationId)
        return this.doesRoomHaveUnreadMessages(room)
    }

    /** Return a conversation unread messages */
    getConversationUnreadMessages(conversationId: ConversationId): BasicMessageInfo[] {
        const room = this.matrixClient.getRoom(conversationId)
        return room ? this.getRoomUnreadMessages(room) : []
    }

    /**
     * Get the conversation for a channel that exists locally, if it doesn't returns undefined
     * @param roomId the roomId of the channel
     */
    getChannel(roomId: string): Conversation | undefined {
        const room = this.matrixClient.getRoom(roomId)
        if (!room) {
            return
        }

        return this.getRoomInformation(room).conversation
    }

    /**
     * Get the conversation for a channel by its name.
     * @param alias the name of the channel.
     * @returns `Promise<Conversation>` if it exists | `Promise<undefined>` if it does not exist.
     */
    async getChannelByName(alias: string): Promise<Conversation | undefined> {
        try {
            // Try to find it locally
            const room: Room | undefined = this.findRoomByAliasLocally(`#${alias}:${this.matrixClient.getDomain()}`)

            if (room) {
                return {
                    id: room.roomId,
                    type: ConversationType.CHANNEL
                }
            } else {
                // Try to find it on the server
                const result = await this.undefinedIfError(() =>
                    this.matrixClient.getRoomIdForAlias(`#${alias}:${this.matrixClient.getDomain()}`)
                )
                if (result) {
                    return {
                        id: result.room_id,
                        type: ConversationType.CHANNEL
                    }
                } else {
                    return
                }
            }
        } catch (error) {
            throw new ChannelsError(ChannelErrorKind.GET_OR_CREATE)
        }
    }

    async searchChannel(limit: number, searchTerm?: string, since?: string): Promise<SearchChannelsResponse> {
        try {
            let publicRooms: Array<IPublicRoomsChunkRoom> = []
            let res: IPublicRoomsResponse
            let nextBatch = since
            const filter = searchTerm
                ? {
                      filter: {
                          generic_search_term: searchTerm
                      }
                  }
                : {}
            const options = {
                limit,
                since: nextBatch,
                ...filter
            }
            do {
                res = await this.matrixClient.publicRooms(options)
                publicRooms.push(...res.chunk)
                nextBatch = res.next_batch
            } while (publicRooms.length < limit && res.next_batch)

            return {
                channels: publicRooms.map(
                    (room): Channel => ({
                        id: room.room_id,
                        name: room.name,
                        description: room.topic,
                        memberCount: room.num_joined_members,
                        type: ConversationType.CHANNEL
                    })
                ),
                nextBatch
            }
        } catch (error) {
            throw new ChannelsError(ChannelErrorKind.SEARCH)
        }
    }

    private async assertThatUsersExist(userIds: SocialId[]): Promise<void> {
        const unknownUsers = userIds.filter(userId => this.matrixClient.getUser(userId) === null)
        const existsCheck = await Promise.all(
            unknownUsers.map<Promise<[string, { results: any[] }]>>(async userId => [
                userId,
                await this.matrixClient.searchUserDirectory({ term: this.toLocalpart(userId) })
            ])
        )
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
    private async getOrCreateConversation(
        type: ConversationType,
        userIds: SocialId[],
        conversationName?: string,
        defaultAlias?: string,
        createRoomOptions?: ICreateRoomOpts
    ): Promise<{ conversation: Conversation; created: boolean }> {
        await this.assertThatUsersExist(userIds)
        const allUsersInConversation = [this.matrixClient.getUserIdLocalpart()!, ...userIds]
        const alias = defaultAlias ?? this.buildAliasForConversationWithUsers(allUsersInConversation)
        let roomId: string
        let created: boolean
        // First, try to find the alias locally
        const room: Room | undefined = this.findRoomByAliasLocally(`#${alias}:${this.matrixClient.getDomain()}`)
        if (room) {
            roomId = room.roomId
            created = false
        } else {
            // Try to find alias on the server
            const result = await this.undefinedIfError(() =>
                this.matrixClient.getRoomIdForAlias(`#${alias}:${this.matrixClient.getDomain()}`)
            )
            if (result) {
                roomId = result.room_id
                created = false
            } else {
                // If alias wasn't found, then create the room
                const creationResult = await this.matrixClient.createRoom({
                    room_alias_name: alias,
                    preset: Preset.TrustedPrivateChat,
                    is_direct: type === ConversationType.DIRECT,
                    invite: userIds,
                    name: conversationName,
                    ...createRoomOptions
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
        return this.getAllRooms().filter(room => room.getCanonicalAlias() === alias)[0]
    }

    private async joinRoom(member: RoomMember | null): Promise<void> {
        if (!member) {
            return
        }

        await this.matrixClient.joinRoom(member.roomId)
    }

    private buildAliasForConversationWithUsers(userIds: (SocialId | MatrixIdLocalpart)[]): string {
        if (userIds.length < 2) {
            throw new Error('Conversation must have two users or more.')
        }
        return userIds
            .map(userId => this.toLocalpart(userId))
            .filter((elem, pos, array) => array.indexOf(elem) === pos)
            .sort()
            .join('+')
    }

    private toLocalpart(userId: SocialId): MatrixIdLocalpart {
        if (!userId.includes(':')) {
            return userId.toLowerCase()
        }
        return userId
            .split(':')[0]
            .substring(1)
            .toLowerCase()
    }

    private async undefinedIfError<T>(call: () => Promise<T>): Promise<T | undefined> {
        try {
            return await call()
        } catch (error) {
            return undefined
        }
    }

    private getAllRooms() {
        return this.matrixClient.getVisibleRooms().filter(room => !room.tags.hasOwnProperty('m.server_notice'))
    }

    private async addDirectRoomToUser(userId: SocialId, roomId: string): Promise<void> {
        // The documentation specifies that we should store a map from user to direct rooms in the 'm.direct' event
        // However, we only support having one direct room to each user, so the list will only have one element
        const mDirectEvent = this.matrixClient.getAccountData('m.direct')
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : {}

        if (directRoomMap[userId]?.includes(roomId)) return

        directRoomMap[userId] = [roomId]
        await this.matrixClient.setAccountData('m.direct', directRoomMap)
    }

    private async addDirectRoomsToUser(members: RoomMember[]): Promise<void> {
        // The documentation specifies that we should store a map from user to direct rooms in the 'm.direct' event
        // However, we only support having one direct room to each user, so the list will only have one element
        const mDirectEvent = this.matrixClient.getAccountData('m.direct')
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : {}

        members.map(member => {
            const event = member.events.member
            const memberContent = event?.getContent()
            const isDirect = memberContent?.membership === 'invite' && memberContent?.is_direct
            if (event && isDirect) {
                const userId = event.getSender()
                if (!directRoomMap[userId]?.includes(member.roomId)) {
                    directRoomMap[userId] = [member.roomId]
                }
            }
        })

        await this.matrixClient.setAccountData('m.direct', directRoomMap)
    }

    private getRoomUnreadMessages(room: Room | null): Array<BasicMessageInfo> {
        if (!room) {
            return []
        }
        // Fetch message events

        // this line should use `getOnlyMessagesTimelineSetFromRoom` but there's a bug in the client
        // that for some reason the last message (in real time) it's not always in the `room.getLiveTimeline()`
        // generating a bug where the only unread message is discarded by this function
        const timeline: Array<any> = room.timeline.filter(x => x.getType() === 'm.room.message')

        // If there are no messages, then there are no unread messages
        if (timeline.length === 0) {
            return []
        }

        const lastReadMessage = this.getLastReadMessage(room.roomId)

        return timeline
            .filter(event => !lastReadMessage || event.getTs() > lastReadMessage?.timestamp)
            .map(event => matrixEventToBasicEventInfo(event))
    }

    private doesRoomHaveUnreadMessages(room: Room | null): boolean {
        return room ? this.getRoomUnreadMessages(room).length > 0 : false
    }
}

export enum ChannelErrorKind {
    GET_OR_CREATE,
    BAD_REGEX,
    RESERVED_NAME,
    JOIN,
    LEAVE,
    SEARCH
}

export class ChannelsError extends Error {
    constructor(private readonly kind: ChannelErrorKind) {
        super(`Failed to interact with channel: ${kind}`)
    }

    getKind(): ChannelErrorKind {
        return this.kind
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
