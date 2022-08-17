import { SocialId, CurrentUserStatus, UpdateUserStatus } from './types'

export interface SessionManagementAPI {
    isLoggedIn(): boolean
    logout(): Promise<void>
    getUserId(): SocialId
    getDomain(): string

    setStatus(status: UpdateUserStatus): Promise<void>
    getUserStatuses(...users: SocialId[]): Map<SocialId, CurrentUserStatus>
    onStatusChange(listener: (userId: SocialId, status: CurrentUserStatus) => void): void
}
