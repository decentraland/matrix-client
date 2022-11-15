import { Room } from 'matrix-js-sdk'
import { SocialId, FriendshipRequest } from './types'

export interface FriendsManagementAPI {
    getAllFriends(): SocialId[]
    // @internal
    getAllFriendsRooms(): Room[]
    getPendingRequests(): FriendshipRequest[]
    isUserMyFriend(userId: SocialId): boolean

    addAsFriend(userId: SocialId, message?: string): Promise<void>
    deleteFriendshipWith(userId: SocialId): Promise<void>
    approveFriendshipRequestFrom(userId: SocialId): Promise<void>
    rejectFriendshipRequestFrom(userId: SocialId): Promise<void>
    cancelFriendshipRequestTo(userId: SocialId): Promise<void>

    onFriendshipRequest(listener: (requestedBy: SocialId, message?: string) => void): void
    onFriendshipRequestCancellation(listener: (canceledBy: SocialId) => void): void
    onFriendshipRequestRejection(listener: (rejectedBy: SocialId) => void): void
    onFriendshipRequestApproval(listener: (approvedBy: SocialId) => void): void
    onFriendshipDeletion(listener: (deletedBy: SocialId) => void): void
}
