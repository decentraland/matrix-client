import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { MatrixEvent } from 'matrix-js-sdk/lib/models/event'
import { Room } from 'matrix-js-sdk/lib/models/room'
import { Filter } from 'matrix-js-sdk/lib/filter'
import { EthAddress, AuthChain } from '@dcl/crypto'
import {
    ConversationType,
    MessageStatus,
    TextMessage,
    SocialId,
    BasicMessageInfo,
    Timestamp,
    CHANNEL_TYPE
} from './types'
import { IndexedDBStore, MemoryStore, createClient, ICreateClientOpts } from 'matrix-js-sdk'
import { IStore } from 'matrix-js-sdk/lib/store'
import { FRIENDSHIP_EVENT_TYPE } from './FriendsManagementClient'

// just *accessing* indexedDB throws an exception in firefox with
// indexeddb disabled.
let localStorage: Storage | undefined
let indexedDB: IDBFactory | undefined
try {
    indexedDB = window.indexedDB
    localStorage = window.localStorage
} catch (e) {}

export async function login(
    synapseUrl: string,
    ethAddress: EthAddress,
    timestamp: Timestamp,
    authChain: AuthChain,
    getLocalStorage?: () => Storage,
    createOpts?: Partial<ICreateClientOpts>
): Promise<MatrixClient> {
    let store: IStore
    let storage: Storage | undefined
    if (getLocalStorage) {
        storage = getLocalStorage()
    } else {
        storage = localStorage
    }
    if (indexedDB) {
        let opts = { indexedDB, localStorage: storage, dbName: `${ethAddress}:${synapseUrl}` }
        store = new IndexedDBStore(opts) as IStore
        await store.startup() // load from indexed db
    } else {
        store = new MemoryStore({ localStorage: storage }) as IStore
    }

    // Create the client
    const matrixClient: MatrixClient = createClient({
        ...createOpts,
        baseUrl: synapseUrl,
        timelineSupport: true,
        useAuthorizationHeader: true,
        store
    })

    // Actual login
    await matrixClient.login('m.login.decentraland', {
        identifier: {
            type: 'm.id.user',
            user: ethAddress.toLowerCase()
        },
        timestamp: timestamp.toString(),
        auth_chain: authChain
    })

    return matrixClient
}

export function findEventInRoom(client: MatrixClient, roomId: string, eventId: string): MatrixEvent | undefined {
    const room = client.getRoom(roomId)
    const timelineSet = room?.getUnfilteredTimelineSet()
    return timelineSet?.findEventById(eventId)
}

export function buildTextMessage(event: MatrixEvent, status: MessageStatus): TextMessage {
    return {
        text: event.getContent().body,
        timestamp: event.getTs(),
        sender: event.getSender(),
        status: status,
        id: event.getId()
    }
}

export function getConversationTypeFromRoom(client: MatrixClient, room: Room): ConversationType {
    if (room.getType() === CHANNEL_TYPE) {
        return ConversationType.CHANNEL
    }
    if (room.getInvitedAndJoinedMemberCount() === 2 && isDirectRoom(client, room)) {
        return ConversationType.DIRECT
    }
    return ConversationType.GROUP
}

function isDirectRoom(client: MatrixClient, room: Room): boolean {
    // Check if there is a friendship event
    const friendshipEvent = getLastFriendshipEventInRoom(room)
    if (friendshipEvent) {
        return true
    }

    // If there is no friendship event, then check if conversation was added as DM in the account data
    const membersWhoAreNotMe = room.currentState.getMembers().filter(member => member.userId !== client.getUserId())
    const otherMember = membersWhoAreNotMe[0].userId
    const mDirectEvent = client.getAccountData('m.direct')
    const directRoomMap = mDirectEvent ? mDirectEvent.getContent() : {}
    const directRoomsToClient = directRoomMap[otherMember] ?? []
    if (directRoomsToClient.includes(room.roomId)) {
        return true
    }

    return false
}

export function getOnlyMessagesTimelineSetFromRoom(userId: SocialId, room: Room, limit?: number) {
    const filter = GET_ONLY_MESSAGES_FILTER(userId, limit)
    return room?.getOrCreateFilteredTimelineSet(filter)
}

export function getOnlyMessagesSentByMeTimelineSetFromRoom(client, room) {
    const filter = GET_ONLY_MESSAGES_SENT_BY_ME_FILTER(client.getUserId())
    return room?.getOrCreateFilteredTimelineSet(filter)
}

export function matrixEventToBasicEventInfo(event: MatrixEvent): BasicMessageInfo {
    return { id: event.getId(), timestamp: event.getTs() }
}

export function getLastFriendshipEventInRoom(room: Room, key = ''): MatrixEvent | null {
    return room.currentState.getStateEvents(FRIENDSHIP_EVENT_TYPE, key)
}

/** Build a filter that only keeps messages in a room */
const GET_ONLY_MESSAGES_FILTER = (userId: SocialId, limit?: number) =>
    Filter.fromJson(userId, 'ONLY_MESSAGES_FILTER', {
        room: {
            timeline: {
                limit: limit ?? 30,
                types: ['m.room.message']
            }
        }
    })

const GET_ONLY_MESSAGES_SENT_BY_ME_FILTER = (userId: SocialId, limit?: number) =>
    Filter.fromJson(userId, 'ONLY_MESSAGES_SENT_BY_ME_FILTER', {
        room: {
            timeline: {
                limit: limit ?? 30,
                senders: [userId],
                types: ['m.room.message']
            }
        }
    })
