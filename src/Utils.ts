import Matrix from 'matrix-js-sdk';
import { ConversationType, MessageStatus, TextMessage, MatrixId, BasicMessageInfo, Conversation } from './types';

export async function findEventInRoom(client: Matrix.MatrixClient, roomId: string, eventId: string): Promise<Event> {
    const eventRaw = await client.fetchRoomEvent(roomId, eventId)
    return new Matrix.MatrixEvent(eventRaw)
}

export function buildTextMessage(event: Matrix.Event, status: MessageStatus): TextMessage {
    return {
        text: event.getContent().body,
        timestamp: event.getTs(),
        sender: event.getSender(),
        status: status,
        id: event.getId(),
    }
}

 /**
  * Find or create a conversation for the given other users. There is no need to include the
  * current user id.
  */
export async function getOrCreateConversation(client: Matrix.MatrixClient, type: ConversationType, userIds: MatrixId[], conversationName?: string): Promise<{ conversation: Conversation, created: boolean }> {
    const allUsersInConversation = [client.getUserIdLocalpart(), ...userIds]
    const alias = buildAliasForConversationWithUsers(allUsersInConversation)
    const result: { room_id: string } | undefined = await undefinedIfError(() => client.getRoomIdForAlias(`#${alias}:${client.getDomain()}`))
    let roomId: string
    let created: boolean
    if (!result) {
        const creationResult = await client.createRoom({
            room_alias_name: alias,
            preset: 'trusted_private_chat',
            is_direct: type === ConversationType.DIRECT,
            invite: userIds,
            name: conversationName,
        })
        roomId = creationResult.room_id
        created = true
    } else {
        roomId = result.room_id
        created = false
    }

    return {
        conversation: {
            type,
            id: roomId
        },
        created
    }
}

function buildAliasForConversationWithUsers(userIds: (MatrixId | MatrixIdLocalpart)[]): string {
    if (userIds.length < 2) {
        throw new Error('Conversation must have two users or more.')
    }
    return userIds.map(userId => toLocalpart(userId))
        .filter((elem, pos, array) => array.indexOf(elem) === pos)
        .sort()
        .join('+')
}

function toLocalpart(userId: MatrixId): MatrixIdLocalpart {
    if (!userId.includes(':')) {
        return userId
    }
    return userId.split(":")[0].substring(1);
}

async function undefinedIfError<T>(call: () => Promise<T>): Promise<T | undefined>  {
    try {
        return await call()
    } catch (error) {
        return undefined
    }
}

export function getOnlyMessagesTimelineSetFromRoom(client: Matrix.MatrixClient, room, limit?: number) {
    const filter = GET_ONLY_MESSAGES_FILTER(client.getUserId(), limit)
    return room.getOrCreateFilteredTimelineSet(filter)
}

export function getOnlyMessagesSentByMeTimelineSetFromRoom(client, room) {
    const filter = GET_ONLY_MESSAGES_SENT_BY_ME_FILTER(client.getUserId())
    return room.getOrCreateFilteredTimelineSet(filter)
}

export function matrixEventToBasicEventInfo(event: Matrix.MatrixEvent): BasicMessageInfo {
    return { id: event.getId(), timestamp: event.getTs() }
}

/** Build a filter that only keeps messages in a room */
const GET_ONLY_MESSAGES_FILTER = (userId: MatrixId, limit?: number) => Matrix.Filter.fromJson(userId, 'ONLY_MESSAGES_FILTER',
{
    room: {
        timeline: {
            limit: limit ?? 30,
            types: [
                "m.room.message",
            ],
        },
    },
})

const GET_ONLY_MESSAGES_SENT_BY_ME_FILTER = (userId: MatrixId, limit?: number) => Matrix.Filter.fromJson(userId, 'ONLY_MESSAGES_SENT_BY_ME_FILTER',
{
    room: {
        timeline: {
            limit: limit ?? 30,
            senders: [ userId ],
            types: [
                "m.room.message",
            ],
        },
    },
})

type MatrixIdLocalpart = string