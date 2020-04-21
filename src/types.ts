
export type Timestamp = number
export type MatrixId = string
export type ConversationId = string
export type MessageId = string

export enum ConversationType {
    GROUP,
    DIRECT,
}

export type Conversation = {
    type: ConversationType,
    id: ConversationId,
}

export type BasicMessageInfo = {
    id: MessageId,
    timestamp: Timestamp,
}

export type TextMessage = BasicMessageInfo & {
    text: string,
    sender: MatrixId,
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

export type LoginData = {
    user_id: string,
    access_token: string,
    home_server: string,
}