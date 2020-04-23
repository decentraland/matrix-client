import { MatrixId, FriendshipRequest } from './types';

export interface FriendsManagementAPI {

    getAllFriends(): Promise<MatrixId[]>;
    getPendingRequests(): Promise<FriendshipRequest[]>;
    isUserMyFriend(userId: MatrixId): Promise<boolean>;

    addAsFriend(userId: MatrixId): Promise<void>
    deleteFriendshipWith(userId: MatrixId): Promise<void>
    approveFriendshipRequestFrom(userId: MatrixId): Promise<void>
    rejectFriendshipRequestFrom(userId: MatrixId): Promise<void>
    cancelFriendshipRequestTo(userId: MatrixId): Promise<void>

    onFriendshipRequest(listener: (requestedBy: MatrixId) => void): void
    onFriendshipRequestCancellation(listener: (canceledBy: MatrixId) => void): void
    onFriendshipRequestRejection(listener: (rejectedBy: MatrixId) => void): void
    onFriendshipRequestApproval(listener: (approvedBy: MatrixId) => void): void
    onFriendshipDeletion(listener: (deletedBy: MatrixId) => void): void
}