import Matrix from 'matrix-js-sdk';
import { ConversationType, MessageStatus, TextMessage, MatrixId } from './types';

export async function findEventInRoom(client: Matrix.MatrixClient, roomId: string, eventId: string): Promise<Event> {
    const eventRaw = await client.fetchRoomEvent(roomId, eventId)
    return new Matrix.MatrixEvent(eventRaw)
}

export function getConversationTypeFromRoom(client: Matrix.MatrixClient, room: Matrix.Room): ConversationType {
    if (room.getInvitedAndJoinedMemberCount() === 2 ) {
        const membersWhoAreNotMe = room.currentState.getMembers().filter(member => member.userId !== client.getUserId());
        const otherMember = membersWhoAreNotMe[0].userId
        const mDirectEvent = client.getAccountData('m.direct')
        const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : { }
        const directRoomsToClient = directRoomMap[otherMember] ?? []
        if (directRoomsToClient.includes(room.roomId)) {
            return ConversationType.DIRECT
        }
    }
    return ConversationType.GROUP
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

export function getOnlyMessagesTimelineSetFromRoom(client, room) {
    const filter = GET_ONLY_MESSAGES_FILTER(client.getUserId())
    return room.getOrCreateFilteredTimelineSet(filter)
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