import { ClientEvent, MatrixClient } from 'matrix-js-sdk/lib/client'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { SocialId, ConversationType, FriendshipRequest } from './types'
import { FriendsManagementAPI } from './FriendsManagementAPI'
import { getConversationTypeFromRoom, getLastFriendshipEventInRoom, waitSyncToFinish } from './Utils'
import { SocialClient } from './SocialClient'
import { SyncState } from 'matrix-js-sdk/lib/sync'
import { EventType } from 'matrix-js-sdk/lib/@types/event'
import { Room, RoomEvent } from 'matrix-js-sdk/lib/models/room'

enum FriendshipStatus {
    NOT_FRIENDS = 'not friends',
    REQUEST_SENT_BY_ME_PENDING = 'request sent my me pending',
    REQUEST_SENT_TO_ME_PENDING = 'request sent to me pending',
    FRIENDS = 'friends'
}

export const FRIENDSHIP_EVENT_TYPE = 'org.decentraland.friendship'

export class FriendsManagementClient implements FriendsManagementAPI {
    private static readonly PENDING_STATUSES = [
        FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
        FriendshipStatus.REQUEST_SENT_BY_ME_PENDING
    ]

    // @internal
    constructor(private readonly matrixClient: MatrixClient, private readonly socialClient: SocialClient) {
        // Listen to when the sync is finishes, and join all rooms I was invited to
        const resolveOnSync = async (state: SyncState) => {
            if (state === 'SYNCING') {
                const friends = this.getAllFriends()

                await this.fixAccountData(friends)
                // remove this listener, otherwhise, it'll be listening all the session and calling an invalid function
                matrixClient.removeListener(ClientEvent.Sync, resolveOnSync)
            }
        }
        matrixClient.on(ClientEvent.Sync, resolveOnSync)
    }

    /*
     * Ensure all friends are declared as direct messages under the account data
     */
    private async fixAccountData(friends: SocialId[]) {
        const mDirectEvent = this.matrixClient.getAccountData(EventType.Direct)
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : {}
        let shouldUpdate = false
        for (const friend of friends) {
            const friendRooms = directRoomMap[friend]
            const room = this.getRoomIdByFriendId(friend)
            if (!room) continue
            if (!friendRooms || !friendRooms.includes(room)) {
                directRoomMap[friend] = [room]
                shouldUpdate = true
            }
        }
        if (shouldUpdate) {
            await this.matrixClient.setAccountData(EventType.Direct, directRoomMap)
        }
    }

    private getRoomIdByFriendId(friendId: SocialId): string | undefined {
        const rooms = this.matrixClient.getVisibleRooms()
        return rooms.map(room => room.guessDMUserId()).find(userId => userId === friendId)
    }

    getAllFriends(): SocialId[] {
        const rooms = this.matrixClient.getVisibleRooms()
        return rooms
            .filter(room => getConversationTypeFromRoom(this.matrixClient, room) === ConversationType.DIRECT)
            .filter(room => this.getFriendshipStatusInRoom(room) === FriendshipStatus.FRIENDS)
            .map(room => room.guessDMUserId())
    }

    // @internal
    getAllFriendsRooms(): Room[] {
        const rooms = this.matrixClient.getVisibleRooms()
        return rooms
            .filter(room => getConversationTypeFromRoom(this.matrixClient, room) === ConversationType.DIRECT)
            .filter(room => this.getFriendshipStatusInRoom(room) === FriendshipStatus.FRIENDS)
    }

    getPendingRequests(): FriendshipRequest[] {
        const rooms = this.matrixClient.getVisibleRooms()
        return rooms
            .filter(room => getConversationTypeFromRoom(this.matrixClient, room) === ConversationType.DIRECT)
            .map(room => [room, this.getFriendshipStatusInRoom(room)] as [Room, FriendshipStatus])
            .filter(([, status]) => FriendsManagementClient.PENDING_STATUSES.includes(status))
            .map(([room, status]) => {
                const sentByMe = status === FriendshipStatus.REQUEST_SENT_BY_ME_PENDING
                const other = room.guessDMUserId()
                // we ask for the friendship event of the requester
                const key = sentByMe ? this.socialClient.getUserId() : other
                const event = getLastFriendshipEventInRoom(room, key)
                const message: string | undefined = event?.getContent().message
                if (sentByMe) {
                    return {
                        from: this.socialClient.getUserId(),
                        to: other,
                        createdAt: room.timeline[0].getTs(),
                        message
                    }
                } else {
                    return {
                        to: this.socialClient.getUserId(),
                        from: other,
                        createdAt: room.timeline[0].getTs(),
                        message
                    }
                }
            })
    }

    isUserMyFriend(userId: SocialId): boolean {
        const friends = this.getAllFriends()
        return friends.includes(userId)
    }

    async addAsFriend(userId: SocialId, message?: string | undefined): Promise<void> {
        return this.actByStatus(
            userId,
            // Send request
            this.action(FriendshipStatus.NOT_FRIENDS, userId =>
                this.sendFriendshipEvent(FriendshipEvent.REQUEST, userId, message)
            ),

            // Approve friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING, userId =>
                this.approveFriendshipRequestFrom(userId)
            )
        )
    }

    deleteFriendshipWith(userId: SocialId): Promise<void> {
        return this.actByStatus(
            userId,
            // Delete friendship
            this.action(FriendshipStatus.FRIENDS, userId => this.sendFriendshipEvent(FriendshipEvent.DELETE, userId))
        )
    }

    approveFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.actByStatus(
            userId,
            // Accept friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING, userId =>
                this.sendFriendshipEvent(FriendshipEvent.ACCEPT, userId)
            )
        )
    }

    rejectFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.actByStatus(
            userId,
            // Reject friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING, userId =>
                this.sendFriendshipEvent(FriendshipEvent.REJECT, userId)
            )
        )
    }

    cancelFriendshipRequestTo(userId: SocialId): Promise<void> {
        return this.actByStatus(
            userId,
            // Cancel friendship request
            this.action(FriendshipStatus.REQUEST_SENT_BY_ME_PENDING, userId =>
                this.sendFriendshipEvent(FriendshipEvent.CANCEL, userId)
            )
        )
    }

    onFriendshipRequest(listener: (requestedBy: SocialId, message?: string) => void): void {
        return this.listenToEvent(FriendshipEvent.REQUEST, listener)
    }

    onFriendshipRequestCancellation(listener: (canceledBy: SocialId) => void): void {
        return this.listenToEvent(FriendshipEvent.CANCEL, listener)
    }

    onFriendshipRequestRejection(listener: (rejectedBy: SocialId) => void): void {
        return this.listenToEvent(FriendshipEvent.REJECT, listener)
    }

    onFriendshipRequestApproval(listener: (approvedBy: SocialId) => void): void {
        return this.listenToEvent(FriendshipEvent.ACCEPT, listener)
    }

    onFriendshipDeletion(listener: (deletedBy: SocialId) => void): void {
        return this.listenToEvent(FriendshipEvent.DELETE, listener)
    }

    private listenToEvent(
        eventToListenTo: FriendshipEvent,
        listener: (from: SocialId, message?: string) => void
    ): void {
        this.matrixClient.on(RoomEvent.Timeline, async (event, _, toStartOfTimeline, __, data) => {
            // wait for sync to store changes in memory before processing the event
            await waitSyncToFinish(this.matrixClient)

            // Ignore anything but real-time updates at the end of the room
            if (toStartOfTimeline || !data || !data.liveEvent) return

            // Just listen to the unfiltered timeline, so we don't raise the same event more than once
            if (data.timeline.getFilter()) return

            if (event.getType() === FRIENDSHIP_EVENT_TYPE && event.getStateKey() === '') {
                const { type, message } = event.getContent()
                if (type === eventToListenTo && event.getSender() !== this.socialClient.getUserId()) {
                    listener(event.getSender(), message)
                }
            }
        })
    }

    private async sendFriendshipEvent(event: FriendshipEvent, otherUser: SocialId, message?: string): Promise<void> {
        const { id: roomId } = await this.socialClient.createDirectConversation(otherUser)
        const content = { type: event, message }
        await this.matrixClient.sendStateEvent(roomId, FRIENDSHIP_EVENT_TYPE, content, '')
        await this.matrixClient.sendStateEvent(roomId, FRIENDSHIP_EVENT_TYPE, content, this.socialClient.getUserId())
    }

    /**
     * Perform an action according to the current friendship status between the logged in user, and the given user id.
     * If an action for the current status isn't provided, then nothing will be done
     */
    private async actByStatus(userId: SocialId, ...actions: ActionByStatus[]): Promise<void> {
        const actionsAsEntries: [
            FriendshipStatus,
            (userId: SocialId) => Promise<void>
        ][] = actions.map(({ status, action }) => [status, action])
        const actionMap: Map<FriendshipStatus, (userId: SocialId) => Promise<void>> = new Map(actionsAsEntries)
        const { id: roomId } = await this.socialClient.createDirectConversation(userId)
        const room = this.matrixClient.getRoom(roomId)
        if (!room) {
            return
        }
        const status = this.getFriendshipStatusInRoom(room)
        const action = actionMap.get(status)
        if (action) {
            return action(userId)
        }
        return Promise.resolve()
    }

    private getFriendshipStatusInRoom(room: Room): FriendshipStatus {
        const event: MatrixEvent | null = getLastFriendshipEventInRoom(room)
        if (event) {
            const sender = event.getSender()
            const { type }: { type: FriendshipEvent } = event.getContent()
            switch (type) {
                case FriendshipEvent.REQUEST:
                    if (sender === this.socialClient.getUserId()) {
                        return FriendshipStatus.REQUEST_SENT_BY_ME_PENDING
                    } else {
                        return FriendshipStatus.REQUEST_SENT_TO_ME_PENDING
                    }
                case FriendshipEvent.ACCEPT:
                    // If the last friendship event is FriendshipEvent.ACCEPT, then we perform an extra check, to verify
                    // that both participants actually agreed to the friendship. The start of a friendship MUST be mutual.
                    const othersLastFriendshipEvent: MatrixEvent | undefined =
                        sender === room.guessDMUserId()
                            ? event
                            : this.getLastFriendshipEventInRoomByUser(room, room.guessDMUserId())
                    const myLastFriendshipEvent: MatrixEvent | undefined =
                        sender === this.socialClient.getUserId()
                            ? event
                            : this.getLastFriendshipEventInRoomByUser(room, this.socialClient.getUserId())
                    if (othersLastFriendshipEvent && myLastFriendshipEvent) {
                        const wasInvited =
                            othersLastFriendshipEvent.getContent().type === FriendshipEvent.REQUEST &&
                            myLastFriendshipEvent.getContent().type === FriendshipEvent.ACCEPT
                        const didTheInvite =
                            othersLastFriendshipEvent.getContent().type === FriendshipEvent.ACCEPT &&
                            myLastFriendshipEvent.getContent().type === FriendshipEvent.REQUEST
                        if (wasInvited || didTheInvite) {
                            return FriendshipStatus.FRIENDS
                        }
                    }
                    break
                case FriendshipEvent.CANCEL:
                case FriendshipEvent.REJECT:
                case FriendshipEvent.DELETE:
                    return FriendshipStatus.NOT_FRIENDS
            }
        }

        return FriendshipStatus.NOT_FRIENDS
    }

    private getLastFriendshipEventInRoomByUser(room: Room, userId: SocialId): MatrixEvent | undefined {
        const lastFriendshipEvent: MatrixEvent | null = getLastFriendshipEventInRoom(room, userId)
        // Make sure that the sender was the actual user
        if (lastFriendshipEvent && lastFriendshipEvent.getSender() === userId) {
            return lastFriendshipEvent
        }
        return undefined
    }

    private action(status: FriendshipStatus, action: (userId: SocialId) => Promise<void>): ActionByStatus {
        return {
            status,
            action
        }
    }
}

type ActionByStatus = {
    status: FriendshipStatus
    action: (userId: SocialId) => Promise<void>
}

enum FriendshipEvent {
    REQUEST = 'request', // Send a friendship request
    CANCEL = 'cancel', // Cancel a friendship request
    ACCEPT = 'accept', // Accept a friendship request
    REJECT = 'reject', // Reject a friendship request
    DELETE = 'delete' // Delete an existing friendship
}
