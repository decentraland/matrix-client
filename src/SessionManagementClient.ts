import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { SocialId, PresenceType, CurrentUserStatus, UpdateUserStatus } from './types';
import { SessionManagementAPI } from './SessionManagementAPI';
import { SocialClient } from './SocialClient';

export class SessionManagementClient implements SessionManagementAPI {

    private loggedIn: boolean = true

    constructor(private readonly matrixClient: MatrixClient,
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

    getUserStatuses(...users: SocialId[]): Map<SocialId, CurrentUserStatus> {
        const friends = this.socialClient.getAllFriends()
        const entries: [SocialId, CurrentUserStatus][] = users.filter(userId => friends.includes(userId))
            .map(userId => this.matrixClient.getUser(userId))
            .filter(user => !!user)
            .map(user => [user.userId, SessionManagementClient.userToStatus(user)])
        return new Map(entries)
    }

    onStatusChange(listener: (userId: SocialId, status: CurrentUserStatus) => void): void {
        const socialClient = this.socialClient

        this.matrixClient.on('event', async (event) =>{
            const sender = event.getSender()
            if (event.getType() === 'm.presence' &&
                sender !== this.getUserId() &&
                socialClient.isUserMyFriend(sender)) {
                    listener(sender, SessionManagementClient.eventToStatus(event.getContent()))
            }
        });
    }

    private static eventToStatus(event: MatrixEvent): CurrentUserStatus {
        const content = event
        const presenceData = {
            presence: content.presence,
            lastActiveAgo: content.last_active_ago,
            presenceStatusMsg: content.status_msg,
        }
        return SessionManagementClient.userToStatus(presenceData)
    }

    private static userToStatus(user: { presence: string, lastActiveAgo: number, presenceStatusMsg: string }): CurrentUserStatus {
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
