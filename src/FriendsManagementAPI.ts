import { Room } from 'matrix-js-sdk'
import { SocialId, FriendshipRequest } from './types'

export interface FriendsManagementAPI {
    getAllFriendsAddresses(): Promise<string[]>
    // @internal
    getAllRooms(): Room[]
    getPendingRequests(): FriendshipRequest[]
    isUserMyFriend(userId: SocialId): Promise<boolean>
    getMutualFriends(userId: SocialId): Promise<string[]>

    // @deprecated
    addAsFriend(userId: SocialId, message?: string | undefined): Promise<void>
    // @deprecated
    deleteFriendshipWith(userId: SocialId): Promise<void>
    // @deprecated
    approveFriendshipRequestFrom(userId: SocialId): Promise<void>
    // @deprecated
    rejectFriendshipRequestFrom(userId: SocialId): Promise<void>
    // @deprecated
    cancelFriendshipRequestTo(userId: SocialId): Promise<void>

    // @deprecated
    onFriendshipRequest(listener: (requestedBy: SocialId, message?: string | undefined) => void): void
    // @deprecated
    onFriendshipRequestCancellation(listener: (canceledBy: SocialId) => void): void
    // @deprecated
    onFriendshipRequestRejection(listener: (rejectedBy: SocialId) => void): void
    // @deprecated
    onFriendshipRequestApproval(listener: (approvedBy: SocialId) => void): void
    // @deprecated
    onFriendshipDeletion(listener: (deletedBy: SocialId) => void): void
}
