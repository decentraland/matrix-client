
export type Timestamp = number
export type SocialId = string
export type ConversationId = string
export type MessageId = string

export enum ConversationType {
    GROUP,
    DIRECT,
}

export type Conversation = {
    type: ConversationType,
    id: ConversationId,
    unreadMessages?: Array<BasicMessageInfo>
    userIds?: Array<string>
}

export type BasicMessageInfo = {
    id: MessageId,
    timestamp: Timestamp,
}

export type TextMessage = BasicMessageInfo & {
    text: string,
    sender: SocialId,
    status: MessageStatus,
}

export enum MessageStatus {
    READ = 'read',
    UNREAD = 'unread',
}

export enum MessageType {
    TEXT = 'm.text',
}

export enum CursorDirection {
    BACKWARDS,
    FORWARDS
}

export type CursorOptions = {
    limit?: number,  // Maximum number of events to keep at once. If more events are retrieved via pagination requests, excess events will be dropped from the other end of the window.
    initialSize?: number
}

export type FriendshipRequest = {
    from: SocialId,
    to: SocialId,
    createdAt: number,
}

export type UpdateUserStatus = {
    presence: PresenceType,
    realm: Realm,
    position: UserPosition,
}

export type CurrentUserStatus = {
    presence: PresenceType,
    lastActiveAgo: Timestamp | undefined, // The time elapsed in ms since the user interacted proactively with the server, or we saw a message from the user
    realm?: Realm,
    position?: UserPosition,
}

export enum PresenceType {
    OFFLINE = 'offline',
    ONLINE = 'online',
    UNAVAILABLE = 'unavailable', // For example, idle
}

export type Realm = {
    serverName: string,
    layer: string
}

export type UserPosition = {
    x: number,
    y: number,
}
