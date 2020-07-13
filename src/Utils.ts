import Matrix from 'matrix-js-sdk';
import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { WebStorageSessionStore } from 'matrix-js-sdk/lib/store/session/webstorage'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { Room } from 'matrix-js-sdk/lib/models/room'
import { Filter } from 'matrix-js-sdk/lib/filter'
import { LocalStorageCryptoStore } from "matrix-js-sdk/lib/crypto/store/localStorage-crypto-store";
import { EthAddress, AuthChain } from 'dcl-crypto';
import { ConversationType, MessageStatus, TextMessage, SocialId, BasicMessageInfo, Timestamp } from './types';

export async function login(synapseUrl: string, ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain, storage?: Storage): Promise<MatrixClient> {
    if (!storage) {
        throw new Error('You must set a storage for e2e encryption to work.')
    }

    // Create the client
    const loginClient: MatrixClient = Matrix.createClient({
        baseUrl: synapseUrl,
    })

    // Actual login
    const { user_id, access_token, device_id } = await loginClient.login('m.login.decentraland', {
        identifier: {
            type: 'm.id.user',
            user: ethAddress.toLowerCase(),
        },
        timestamp: timestamp.toString(),
        auth_chain: authChain
    });

    // New full client

    const fullClient = Matrix.createClient({
        baseUrl: synapseUrl,
        //@ts-ignore
        timelineSupport: true,
        sessionStore: new WebStorageSessionStore(storage),
        cryptoStore: new LocalStorageCryptoStore(storage),
        userId: user_id,
        deviceId: device_id,
        accessToken: access_token,
    })

    return fullClient
}

export function findEventInRoom(client: MatrixClient, roomId: string, eventId: string): Event | undefined {
    const room = client.getRoom(roomId)
    const timelineSet = room.getUnfilteredTimelineSet()
    return timelineSet.findEventById(eventId)
}

export function buildTextMessage(event: MatrixEvent, status: MessageStatus): TextMessage {
    return {
        text: event.getContent().body,
        timestamp: event.getTs(),
        sender: event.getSender(),
        status: status,
        id: event.getId(),
    }
}

export function getConversationTypeFromRoom(client: MatrixClient, room: Room): ConversationType {
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

export function getOnlyMessagesTimelineSetFromRoom(client: MatrixClient, room, limit?: number) {
    const filter = GET_ONLY_MESSAGES_FILTER(client.getUserId(), limit)
    return room.getOrCreateFilteredTimelineSet(filter)
}

export function getOnlyMessagesSentByMeTimelineSetFromRoom(client, room) {
    const filter = GET_ONLY_MESSAGES_SENT_BY_ME_FILTER(client.getUserId())
    return room.getOrCreateFilteredTimelineSet(filter)
}

export function matrixEventToBasicEventInfo(event: MatrixEvent): BasicMessageInfo {
    return { id: event.getId(), timestamp: event.getTs() }
}

/** Build a filter that only keeps messages in a room */
const GET_ONLY_MESSAGES_FILTER = (userId: SocialId, limit?: number) => Filter.fromJson(userId, 'ONLY_MESSAGES_FILTER',
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

const GET_ONLY_MESSAGES_SENT_BY_ME_FILTER = (userId: SocialId, limit?: number) => Filter.fromJson(userId, 'ONLY_MESSAGES_SENT_BY_ME_FILTER',
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