import { SocialId, FriendshipRequest } from './types'

export interface FriendsManagementAPI {
    getAllFriends(): SocialId[]
    getPendingRequests(): FriendshipRequest[]
    isUserMyFriend(userId: SocialId): boolean

    addAsFriend(userId: SocialId): Promise<void>
    deleteFriendshipWith(userId: SocialId): Promise<void>
    approveFriendshipRequestFrom(userId: SocialId): Promise<void>
    rejectFriendshipRequestFrom(userId: SocialId): Promise<void>
    cancelFriendshipRequestTo(userId: SocialId): Promise<void>

    onFriendshipRequest(listener: (requestedBy: SocialId) => void): void
    onFriendshipRequestCancellation(listener: (canceledBy: SocialId) => void): void
    onFriendshipRequestRejection(listener: (rejectedBy: SocialId) => void): void
    onFriendshipRequestApproval(listener: (approvedBy: SocialId) => void): void
    onFriendshipDeletion(listener: (deletedBy: SocialId) => void): void
}
