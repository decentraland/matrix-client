import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { SocialId, PresenceType, CurrentUserStatus, UpdateUserStatus, ProfileInfo } from './types'
import { SessionManagementAPI } from './SessionManagementAPI'
import { SocialClient } from './SocialClient'
import { User, UserEvent } from 'matrix-js-sdk/lib/models/user'

export class SessionManagementClient implements SessionManagementAPI {
    private loggedIn: boolean = true

    // @internal
    constructor(private readonly matrixClient: MatrixClient, private readonly socialClient: SocialClient) {}

    isLoggedIn(): boolean {
        return this.loggedIn
    }

    async logout(): Promise<void> {
        this.loggedIn = false
        this.matrixClient.stopClient()
        await this.matrixClient.logout()
    }

    /*
     * UserId should be present when client is logged-in
     */
    getUserId(): SocialId {
        const userId = this.matrixClient.getUserId()
        if (!userId) {
            // shouldn't happen since user id must be present when client is logged in
            throw new Error('UserId not present when it should')
        }
        return userId
    }

    getDomain(): string {
        return this.matrixClient.getDomain()
    }

    getAccessToken(): string | null {
        return this.matrixClient.getAccessToken()
    }

    async setProfileInfo({ displayName, avatarUrl }: ProfileInfo): Promise<void> {
        const userId = this.getUserId()

        const userInfo = await this.matrixClient.getProfileInfo(userId)
        if (displayName && userInfo.displayname !== displayName) {
            await this.matrixClient.setDisplayName(displayName)
        }
        if (avatarUrl && userInfo.avatar_url !== avatarUrl) {
            await this.matrixClient.setAvatarUrl(avatarUrl)
        }
    }

    setStatus(status: UpdateUserStatus): Promise<void> {
        const input = {
            presence: status.presence,
            status_msg: JSON.stringify({ realm: status.realm, position: status.position })
        }

        return this.matrixClient.setPresence(input)
    }

    getUserStatuses(...users: SocialId[]): Map<SocialId, CurrentUserStatus> {
        const entries: [SocialId, CurrentUserStatus][] = users
            .map(userId => this.matrixClient.getUser(userId))
            .filter((user): user is User => !!user)
            .map(user => [user.userId, SessionManagementClient.userToStatus(user!)])
        return new Map(entries)
    }

    onStatusChange(listener: (userId: SocialId, status: CurrentUserStatus) => void): void {
        const socialClient = this.socialClient

        this.matrixClient.on(UserEvent.Presence, async (event, user) => {
            if (!event) return

            const sender = event.getSender()
            if (sender !== this.getUserId() && socialClient.isUserMyFriend(sender)) {
                listener(sender, SessionManagementClient.eventToStatus(user))
            }
        })
    }

    private static eventToStatus(user: User): CurrentUserStatus {
        const presenceData = {
            presence: user.presence,
            lastActiveAgo: user.lastActiveAgo,
            presenceStatusMsg: user.presenceStatusMsg
        }
        return SessionManagementClient.userToStatus(presenceData)
    }

    private static userToStatus(user: {
        presence: string
        lastActiveAgo: number
        presenceStatusMsg?: string
    }): CurrentUserStatus {
        const presence: PresenceType = PresenceType[user.presence.toUpperCase().trim()]

        const userStatus: CurrentUserStatus = {
            presence,
            lastActiveAgo: user.lastActiveAgo
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
            } catch (error) {}
        }

        return userStatus
    }
}
