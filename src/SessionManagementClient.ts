import Matrix from 'matrix-js-sdk';
import { SocialId, PresenceType, CurrentUserStatus, UpdateUserStatus } from './types';
import { SessionManagementAPI } from 'SessionManagementAPI';
import { SocialClient } from 'SocialClient';

export class SessionManagementClient implements SessionManagementAPI {

    private loggedIn: boolean = true

    constructor(private readonly matrixClient: Matrix.MatrixClient,
        private readonly socialClient: SocialClient) { }

    isLoggedIn(): boolean {
        return this.loggedIn
    }

    async logout(): Promise<void> {
        this.loggedIn = false
        await this.matrixClient.stopClient()
        await this.matrixClient.logout();
    }

    getUserId(): SocialId {
        return this.matrixClient.getUserId()
    }

    getDomain(): string {
        return this.matrixClient.getDomain()
    }

    setStatus(status: UpdateUserStatus): Promise<void> {
        const input = {
            presence: status.presence,
            status_msg: JSON.stringify({ realm: status.realm, position: status.position }),
        }

        return this.matrixClient.setPresence(input)
    }

    async getUserStatuses(...users: SocialId[]): Promise<Map<SocialId, CurrentUserStatus>> {
        const friends = await this.socialClient.getAllFriends()
        const entries: [SocialId, CurrentUserStatus][] = users.filter(userId => friends.includes(userId))
            .map(userId => this.matrixClient.getUser(userId))
            .filter(user => !!user)
            .map(user => [user.userId, SessionManagementClient.userToStatus(user)])
        return new Map(entries)
    }

    onStatusChange(listener: (userId: SocialId, status: CurrentUserStatus) => void): void {
        const socialClient = this.socialClient
        this.matrixClient.on("User.lastPresenceTs", async function(_, user: Matrix.User) {
            if (await socialClient.isUserMyFriend(user.userId)) {
                listener(user.userId, SessionManagementClient.userToStatus(user))
            }
        });
    }

    private static userToStatus(user: Matrix.User): CurrentUserStatus {
        const presence: PresenceType = PresenceType[user.presence.toUpperCase().trim()]

        const userStatus: CurrentUserStatus = {
            presence,
            lastActiveAgo: user.lastActiveAgo,
        }

        if (presence !== PresenceType.OFFLINE && user.presenceStatusMsg) {
            try {
                const parseResult = JSON.parse(user.presenceStatusMsg)
                if (parseResult?.realm) {
                    userStatus.realm = parseResult?.realm
                }

                if (parseResult?.position) {
                    userStatus.position = parseResult?.position
                }
            } catch(error) { }
        }

        return userStatus
    }

}
