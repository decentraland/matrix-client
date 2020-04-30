import Matrix from 'matrix-js-sdk';
import { EthAddress, AuthChain } from 'dcl-crypto';
import { ConversationType, MessageStatus, TextMessage, SocialId, BasicMessageInfo, Timestamp } from './types';

export async function login(synapseUrl: string, ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<Matrix.MatrixClient> {
    // Create the client
    const matrixClient: Matrix.MatrixClient = Matrix.createClient({
        baseUrl: synapseUrl,
        timelineSupport: true,
    })

    // Actual login
    await matrixClient.login('m.login.decentraland', {
        identifier: {
            type: 'm.id.user',
            user: ethAddress.toLowerCase(),
        },
        timestamp: timestamp.toString(),
        auth_chain: authChain
    });

    return matrixClient
}

export function findEventInRoom(client: Matrix.MatrixClient, roomId: string, eventId: string): Event | undefined {
    const room = client.getRoom(roomId)
    const timelineSet = room.getUnfilteredTimelineSet()
    return timelineSet.findEventById(eventId)
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
const GET_ONLY_MESSAGES_FILTER = (userId: SocialId, limit?: number) => Matrix.Filter.fromJson(userId, 'ONLY_MESSAGES_FILTER',
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

const GET_ONLY_MESSAGES_SENT_BY_ME_FILTER = (userId: SocialId, limit?: number) => Matrix.Filter.fromJson(userId, 'ONLY_MESSAGES_SENT_BY_ME_FILTER',
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