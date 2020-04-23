import Matrix from 'matrix-js-sdk';
import { MatrixId, ConversationType, FriendshipRequest } from './types';
import { FriendsManagementAPI } from 'FriendsManagementAPI';
import { getConversationTypeFromRoom } from 'Utils';
import { SocialClient } from 'SocialClient';

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

    async getAllFriends(): Promise<MatrixId[]> {
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

    async addAsFriend(userId: MatrixId): Promise<void> {
        return this.actByStatus(userId,
            // Send request
            this.action(FriendshipStatus.NOT_FRIENDS,
                userId => this.sendFriendshipEvent(FriendshipEvent.REQUEST, userId)),

            // Approve friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.approveFriendshipRequestFrom(userId)),
        )
    }

    deleteFriendshipWith(userId: MatrixId): Promise<void> {
        return this.actByStatus(userId,
            // Delete friendship
            this.action(FriendshipStatus.FRIENDS,
                userId => this.sendFriendshipEvent(FriendshipEvent.DELETE, userId)),
        )
    }

    approveFriendshipRequestFrom(userId: MatrixId): Promise<void> {
        return this.actByStatus(userId,
            // Accept friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.ACCEPT, userId)),
        )
    }

    rejectFriendshipRequestFrom(userId: MatrixId): Promise<void> {
        return this.actByStatus(userId,
            // Reject friendship
            this.action(FriendshipStatus.REQUEST_SENT_TO_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.REJECT, userId)),
        )
    }

    cancelFriendshipRequestTo(userId: MatrixId): Promise<void> {
        return this.actByStatus(userId,
            // Cancel friendship request
            this.action(FriendshipStatus.REQUEST_SENT_BY_ME_PENDING,
                userId => this.sendFriendshipEvent(FriendshipEvent.CANCEL, userId)),
        )
    }

    onFriendshipRequest(listener: (requestedBy: MatrixId) => void): void {
        return this.listenToEvent(FriendshipEvent.REQUEST, listener)
    }

    onFriendshipRequestCancellation(listener: (canceledBy: MatrixId) => void): void {
        return this.listenToEvent(FriendshipEvent.CANCEL, listener)
    }

    onFriendshipRequestRejection(listener: (rejectedBy: MatrixId) => void): void {
        return this.listenToEvent(FriendshipEvent.REJECT, listener)
    }

    onFriendshipRequestApproval(listener: (approvedBy: MatrixId) => void): void {
        return this.listenToEvent(FriendshipEvent.ACCEPT, listener)
    }

    onFriendshipDeletion(listener: (deletedBy: MatrixId) => void): void {
        return this.listenToEvent(FriendshipEvent.DELETE, listener)
    }

    private listenToEvent(eventToListenTo: FriendshipEvent, listener: (from: MatrixId) => void): void {
        this.matrixClient.on('Room.timeline', (event) => {
            if (event.getType() === FriendsManagementClient.FRIENDSHIP_EVENT_TYPE) {
                const { type, from, to } = event.getContent()
                if (type === eventToListenTo && to === this.matrixClient.getUserId()) {
                    listener(from)
                }
            }
        })
    }

    private async sendFriendshipEvent(event: FriendshipEvent, otherUser: MatrixId): Promise<void> {
        const { id: roomId } = await this.socialClient.createDirectConversation(otherUser)
        const content = { type: event, from: this.matrixClient.getUserId(), to: otherUser }
        await this.matrixClient.sendStateEvent(roomId, FriendsManagementClient.FRIENDSHIP_EVENT_TYPE, content, '')
    }

    /**
     * Perform an action according to the current friendship status between the logged in user, and the given user id.
     * If an action for the current status isn't provided, then nothing will be done
     */
    private async actByStatus(userId: MatrixId, ...actions: ActionByStatus[]): Promise<void> {
        const actionsAsEntries: [FriendshipStatus, (userId: MatrixId) => Promise<void>][] = actions.map(({ status, action }) => [ status, action ])
        const actionMap: Map<FriendshipStatus, (userId: MatrixId) => Promise<void>> = new Map(actionsAsEntries)
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
        const event: Matrix.MatrixEvent | null = room.currentState.getStateEvents(FriendsManagementClient.FRIENDSHIP_EVENT_TYPE, '')
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
                    return FriendshipStatus.FRIENDS
                case FriendshipEvent.CANCEL:
                case FriendshipEvent.REJECT:
                case FriendshipEvent.DELETE:
                    return FriendshipStatus.NOT_FRIENDS
            }
        }

        return FriendshipStatus.NOT_FRIENDS
    }

    private action(status: FriendshipStatus, action: (userId: MatrixId) => Promise<void>): ActionByStatus {
        return {
            status,
            action,
        }
    }
}

type ActionByStatus = {
    status: FriendshipStatus
    action: (userId: MatrixId) => Promise<void>
}

enum FriendshipEvent {
    REQUEST = 'request', // Send a friendship request
    CANCEL = 'cancel', // Cancel a friendship request
    ACCEPT = 'accept', // Accept a friendship request
    REJECT = 'reject', // Reject a friendship request
    DELETE = 'delete', // Delete an existing friendship
}
