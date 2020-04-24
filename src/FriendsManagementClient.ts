import Matrix from 'matrix-js-sdk';
import { SocialId, ConversationType, FriendshipRequest } from './types';
import { FriendsManagementAPI } from './FriendsManagementAPI';
import { getConversationTypeFromRoom } from './Utils';
import { SocialClient } from './SocialClient';

enum FriendshipStatus {
    NOT_FRIENDS = 'not friends',
    REQUEST_SENT_BY_ME_PENDING = 'request sent my me pending',
    REQUEST_SENT_TO_ME_PENDING = 'request sent to me pending',
    FRIENDS = 'friends',
}

export class FriendsManagementClient implements FriendsManagementAPI {

    private static readonly PENDING_STATUSES = [FriendshipStatus.REQUEST_SENT_TO_ME_PENDING, FriendshipStatus.REQUEST_SENT_BY_ME_PENDING]
    private static readonly FRIENDSHIP_EVENT_TYPE = 'org.decentraland.friendship'

    constructor(private readonly matrixClient: Matrix.MatrixClient,
        private readonly socialClient: SocialClient) { }

    async getAllFriends(): Promise<SocialId[]> {
        const rooms = await this.matrixClient.getVisibleRooms()
        return rooms.filter(room => getConversationTypeFromRoom(this.matrixClient, room) === ConversationType.DIRECT)
            .filter(room => this.getFriendshipStatusInRoom(room) === FriendshipStatus.FRIENDS)
            .map(room => room.guessDMUserId())
    }

    async getPendingRequests(): Promise<FriendshipRequest[]> {
        const rooms = await this.matrixClient.getVisibleRooms()
        return rooms.filter(room => getConversationTypeFromRoom(this.matrixClient, room) === ConversationType.DIRECT)
            .map(room => [room, this.getFriendshipStatusInRoom(room)])
            .filter(([, status]) => FriendsManagementClient.PENDING_STATUSES.includes(status))
            .map(([room, status]) => {
                const other = room.guessDMUserId()
                if (status === FriendshipStatus.REQUEST_SENT_BY_ME_PENDING) {
                    return { from: this.matrixClient.getUserId(), to: other }
                } else {
                    return { to: this.matrixClient.getUserId(), from: other }
                }
            })
    }

    async isUserMyFriend(userId: SocialId): Promise<boolean> {
        const { id: roomId } = await this.socialClient.createDirectConversation(userId)
        const room = this.matrixClient.getRoom(roomId)
        return this.getFriendshipStatusInRoom(room) === FriendshipStatus.FRIENDS;
    }

    async addAsFriend(userId: SocialId): Promise<void> {
        return this.actByStatus(userId,
            // Send request
            this.action(FriendshipStatus.NOT_FRIENDS,
                userId => this.sendFriendshipEvent(FriendshipEvent.REQUEST, userId)),

            // Approve friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.approveFriendshipRequestFrom(userId)),
        )
    }

    deleteFriendshipWith(userId: SocialId): Promise<void> {
        return this.actByStatus(userId,
            // Delete friendship
            this.action(FriendshipStatus.FRIENDS,
                userId => this.sendFriendshipEvent(FriendshipEvent.DELETE, userId)),
        )
    }

    approveFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.actByStatus(userId,
            // Accept friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.ACCEPT, userId)),
        )
    }

    rejectFriendshipRequestFrom(userId: SocialId): Promise<void> {
        return this.actByStatus(userId,
            // Reject friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.REJECT, userId)),
        )
    }

    cancelFriendshipRequestTo(userId: SocialId): Promise<void> {
        return this.actByStatus(userId,
            // Cancel friendship request
            this.action(FriendshipStatus.REQUEST_SENT_BY_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.CANCEL, userId)),
        )
    }

    onFriendshipRequest(listener: (requestedBy: SocialId) => void): void {
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

    private listenToEvent(eventToListenTo: FriendshipEvent, listener: (from: SocialId) => void): void {
        this.matrixClient.on('Room.timeline', (event) => {
            if (event.getType() === FriendsManagementClient.FRIENDSHIP_EVENT_TYPE && event.getStateKey() === '') {
                const { type } = event.getContent()
                if (type === eventToListenTo && event.getSender() !== this.matrixClient.getUserId()) {
                    listener(event.getSender())
                }
            }
        })
    }

    private async sendFriendshipEvent(event: FriendshipEvent, otherUser: SocialId): Promise<void> {
        const { id: roomId } = await this.socialClient.createDirectConversation(otherUser)
        const content = { type: event }
        await this.matrixClient.sendStateEvent(roomId, FriendsManagementClient.FRIENDSHIP_EVENT_TYPE, content, '')
        await this.matrixClient.sendStateEvent(roomId, FriendsManagementClient.FRIENDSHIP_EVENT_TYPE, content, this.matrixClient.getUserId())
    }

    /**
     * Perform an action according to the current friendship status between the logged in user, and the given user id.
     * If an action for the current status isn't provided, then nothing will be done
     */
    private async actByStatus(userId: SocialId, ...actions: ActionByStatus[]): Promise<void> {
        const actionsAsEntries: [FriendshipStatus, (userId: SocialId) => Promise<void>][] = actions.map(({ status, action }) => [ status, action ])
        const actionMap: Map<FriendshipStatus, (userId: SocialId) => Promise<void>> = new Map(actionsAsEntries)
        const { id: roomId } = await this.socialClient.createDirectConversation(userId)
        const room = this.matrixClient.getRoom(roomId)
        const status = this.getFriendshipStatusInRoom(room)
        const action = actionMap.get(status)
        if (action) {
            return action(userId)
        }
        return Promise.resolve()
    }

    private getFriendshipStatusInRoom(room): FriendshipStatus {
        const event: Matrix.MatrixEvent | null = this.getLastFriendshipEventInRoom(room)
        if (event) {
            const sender = event.getSender()
            const { type }: { type: FriendshipEvent } = event.getContent()
            switch (type) {
                case FriendshipEvent.REQUEST:
                    if (sender === this.matrixClient.getUserId()) {
                        return FriendshipStatus.REQUEST_SENT_BY_ME_PENDING
                    } else {
                        return FriendshipStatus.REQUEST_SENT_TO_ME_PENDING
                    }
                case FriendshipEvent.ACCEPT:
                    // If the last friendship event is FriendshipEvent.ACCEPT, then we perform an extra check, to verify
                    // that both participants actually agreed to the friendship. The start of a friendship MUST be mutual.
                    const othersLastFriendshipEvent: Matrix.MatrixEvent | undefined = this.getLastFriendshipEventInRoomByUser(room, room.guessDMUserId())
                    const myLastFriendshipEvent: Matrix.MatrixEvent | undefined = this.getLastFriendshipEventInRoomByUser(room, this.matrixClient.getUserId())
                    if (othersLastFriendshipEvent && myLastFriendshipEvent) {
                        const wasInvited = othersLastFriendshipEvent.getContent().type === FriendshipEvent.REQUEST && myLastFriendshipEvent.getContent().type === FriendshipEvent.ACCEPT
                        const didTheInvite = othersLastFriendshipEvent.getContent().type === FriendshipEvent.ACCEPT && myLastFriendshipEvent.getContent().type === FriendshipEvent.REQUEST
                        if (wasInvited || didTheInvite) {
                            return FriendshipStatus.FRIENDS
                        }
                    }
                    break;
                case FriendshipEvent.CANCEL:
                case FriendshipEvent.REJECT:
                case FriendshipEvent.DELETE:
                    return FriendshipStatus.NOT_FRIENDS
            }
        }

        return FriendshipStatus.NOT_FRIENDS
    }

    private getLastFriendshipEventInRoomByUser(room, userId: SocialId): Matrix.MatrixEvent | undefined {
        const lastFriendshipEvent: Matrix.MatrixEvent | null = this.getLastFriendshipEventInRoom(room, userId)
        // Make sure that the sender was the actual user
        if (lastFriendshipEvent && lastFriendshipEvent.getSender() === userId) {
            return lastFriendshipEvent
        }
        return undefined
    }

    private getLastFriendshipEventInRoom(room, key = ''): Matrix.MatrixEvent | null {
        return room.currentState.getStateEvents(FriendsManagementClient.FRIENDSHIP_EVENT_TYPE, key)
    }

    private action(status: FriendshipStatus, action: (userId: SocialId) => Promise<void>): ActionByStatus {
        return {
            status,
            action,
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
    DELETE = 'delete', // Delete an existing friendship
}
