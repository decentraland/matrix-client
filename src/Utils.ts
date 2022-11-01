import { ClientEvent, ICreateClientOpts, MatrixClient } from 'matrix-js-sdk/lib/client'
import { IClearEvent, MatrixEvent } from 'matrix-js-sdk/lib/models/event'
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
    CHANNEL_TYPE,
    MessageType
} from './types'
import { IStore } from 'matrix-js-sdk/lib/store'
import { FRIENDSHIP_EVENT_TYPE } from './FriendsManagementClient'
import { IndexedDBStore } from 'matrix-js-sdk/lib/store/indexeddb'
import { MemoryStore } from 'matrix-js-sdk/lib/store/memory'
import { MatrixScheduler } from 'matrix-js-sdk/lib/scheduler'
import { MemoryCryptoStore } from 'matrix-js-sdk/lib/crypto/store/memory-crypto-store'
import { IndexedDBCryptoStore } from 'matrix-js-sdk/lib/crypto/store/indexeddb-crypto-store'
import { CryptoStore } from 'matrix-js-sdk/lib/crypto/store/base'
import { IExportedDevice } from 'matrix-js-sdk/lib/crypto/OlmDevice'
import { SocialClient } from './SocialClient'
import * as sdk from 'matrix-js-sdk'

// just *accessing* indexedDB throws an exception in firefox with
// indexeddb disabled.
let localStorage: Storage | undefined
let indexedDB: IDBFactory | undefined
try {
    indexedDB = window.indexedDB
    localStorage = window.localStorage
} catch (e) {}

const MATRIX_DEVICE = 'mx_device_'; // + user address
const MATRIX_ACCESS_TOKEN = 'mx_access_token_'; // + user address

// @internal
export function createClient(opts: ICreateClientOpts) {
    opts.store =
        opts.store ||
        (new MemoryStore({
            localStorage: globalThis.localStorage
        }) as IStore)
    opts.scheduler = opts.scheduler || new MatrixScheduler()
    opts.cryptoStore = opts.cryptoStore || new MemoryCryptoStore()
    return sdk.createClient(opts)
}

// @internal
export async function login(
    synapseUrl: string,
    ethAddress: EthAddress,
    timestamp: Timestamp,
    authChain: AuthChain,
    enableCrypto: boolean,
    getLocalStorage?: () => Storage,
    createOpts?: Partial<ICreateClientOpts>,
): Promise<MatrixClient> {
    let store: IStore
    let storage: Storage | undefined
    let cryptoStore: CryptoStore | undefined = undefined
    if (getLocalStorage) {
        storage = getLocalStorage()
    } else {
        storage = localStorage
    }
    if (indexedDB) {
        let opts = { indexedDB, localStorage: storage, dbName: `${ethAddress}:${synapseUrl}` }
        store = new IndexedDBStore(opts) as IStore
        await store.startup() // load from indexed db
        if (enableCrypto) {
            cryptoStore = new IndexedDBCryptoStore(indexedDB, `matrix-crypto:${ethAddress}:${synapseUrl}`)
        }
    } else {
        store = new MemoryStore({ localStorage: storage }) as IStore
    }

    if (enableCrypto) {
        const userDevice = getUserStoredDevice(ethAddress)
        const userToken = getUserAccessToken(ethAddress)
        if (userDevice && userToken) {
            const matrixClient = createClient({
                ...createOpts,
                baseUrl: synapseUrl,
                timelineSupport: true,
                useAuthorizationHeader: true,
                cryptoStore,
                store,
                deviceToImport: userDevice,
                accessToken: userToken
            })

            return matrixClient
        } else {
            // Create the client
            const loginClient: MatrixClient = createClient({
                ...createOpts,
                baseUrl: synapseUrl,
                timelineSupport: true,
                useAuthorizationHeader: true,
                store
            })
            // Actual login
            const response = await loginClient.login('m.login.decentraland', {
                identifier: {
                    type: 'm.id.user',
                    user: ethAddress.toLowerCase()
                },
                timestamp: timestamp.toString(),
                auth_chain: authChain
            })

            loginClient.stopClient();

            const matrixClient = createClient({
                ...createOpts,
                baseUrl: synapseUrl,
                timelineSupport: true,
                useAuthorizationHeader: true,
                deviceId: response.device_id,
                accessToken: response.access_token,
                userId: response.user_id,
                cryptoStore,
                store,
            })

            return matrixClient
        }
    } else {
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
}

// @internal
export function handleMessage(
    client: MatrixClient, 
    event: MatrixEvent, 
    room: Room | undefined, 
    toStartOfTimeline: boolean | undefined, 
    data: sdk.IRoomTimelineData): { conversation: {type: ConversationType, id: string}, message: TextMessage} | null {
    if (
        event.getType() !== 'm.room.message' || // Make sure that it is in fact a message
        event.getContent().msgtype !== MessageType.TEXT || // Make sure that the message is of type text
        event.getSender() === client.getUserId()
    ) {
        // Don't raise an event if I was the sender
        console.log('MatrixClient: dont raise an event: ', event.getId())
        return null
    }
    // Ignore anything but real-time updates at the end of the room
    if (toStartOfTimeline || !data || !data.liveEvent) {
        console.log('MatrixClient: Ignore anything: ', event.getId())
        return null
    } 

    // Just listen to the unfiltered timeline, so we don't raise the same message more than once
    if (data.timeline.getFilter() && !event.isEncrypted()) {
        console.log('MatrixClient: Just listen to the unfiltered timeline: ', event.getId())
        return null
    } 

    if (!room) return null

    const conversation = {
        type: getConversationTypeFromRoom(client, room),
        id: room.roomId
    }

    const message: TextMessage = buildTextMessage(event, MessageStatus.UNREAD)

    return {conversation, message}
}

// @internal
export function findEventInRoom(client: MatrixClient, roomId: string, eventId: string): MatrixEvent | undefined {
    const room = client.getRoom(roomId)
    const timelineSet = room?.getUnfilteredTimelineSet()
    return timelineSet?.findEventById(eventId)
}

// @internal
export function buildTextMessage(event: MatrixEvent, status: MessageStatus, clearEvent?: IClearEvent): TextMessage {
    if (clearEvent) {
        return {
            text: clearEvent.content.body,
            timestamp: event.getTs(),
            sender: event.getSender(),
            status: status,
            id: event.getId()
        }
    }

    return {
        text: event.getContent().body,
        timestamp: event.getTs(),
        sender: event.getSender(),
        status: status,
        id: event.getId()
    }
}

// @internal
export function getConversationTypeFromRoom(client: MatrixClient, room: Room): ConversationType {
    if (room.getType() === CHANNEL_TYPE) {
        return ConversationType.CHANNEL
    }
    if (room.getInvitedAndJoinedMemberCount() === 2 && isDirectRoom(client, room)) {
        return ConversationType.DIRECT
    }
    return ConversationType.GROUP
}

export function isRoomEncrypted(room: Room) {
    return !!room.currentState.getStateEvents('m.room.encryption', '')
}

export function getUserStoredDevice(userId: string): {
    olmDevice: IExportedDevice
    userId: string;
    deviceId: string;
} | null {
    const device = localStorage?.getItem(`${MATRIX_DEVICE}${userId}`)
    if (device) {
        return JSON.parse(device)
    }
    return null
}

export function storeCurrentUserDevice(userId: string, device: {
    olmDevice: IExportedDevice;
    userId: string;
    deviceId: string;
}) {
    // For unknwon reason the last element in the array is null and 
    // makes the sdk fail
    device.olmDevice.sessions.pop()
    localStorage?.setItem(`${MATRIX_DEVICE}${userId}`, JSON.stringify(device))
}

export function getUserAccessToken(userId: string) {
    return localStorage?.getItem(`${MATRIX_ACCESS_TOKEN}${userId}`)
}

export function storeUserAccessToken(userId: string, token: string) {
    localStorage?.setItem(`${MATRIX_ACCESS_TOKEN}${userId}`, token)
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

/**
 * Call this function when you want to wait for sync to finish
 * Not meant to be used in other place than Matrix event processing
 * @internal
 */
export async function waitSyncToFinish(client: MatrixClient): Promise<void> {
    // Listen to Sync event
    return new Promise<void>(resolve => {
        client.once(ClientEvent.Sync, () => {
            resolve(void 0)
        })
    })
}

// @internal
export function getOnlyMessagesTimelineSetFromRoom(userId: SocialId, room: Room, limit?: number) {
    const encryptedRoom = isRoomEncrypted(room)
    const filter = GET_ONLY_MESSAGES_FILTER(userId, encryptedRoom, limit)
    return room?.getOrCreateFilteredTimelineSet(filter)
}

// @internal
export function getOnlyMessagesSentByMeTimelineSetFromRoom(client: SocialClient, room: Room | null) {
    const filter = GET_ONLY_MESSAGES_SENT_BY_ME_FILTER(client.getUserId())
    return room?.getOrCreateFilteredTimelineSet(filter)
}

// @internal
export function matrixEventToBasicEventInfo(event: MatrixEvent): BasicMessageInfo {
    return { id: event.getId(), timestamp: event.getTs() }
}

// @internal
export function getLastFriendshipEventInRoom(room: Room, key = ''): MatrixEvent | null {
    return room.currentState.getStateEvents(FRIENDSHIP_EVENT_TYPE, key)
}

/** Build a filter that only keeps messages in a room */
const GET_ONLY_MESSAGES_FILTER = (userId: SocialId, encryptedMessages: boolean ,limit?: number) =>
    Filter.fromJson(userId, 'ONLY_MESSAGES_FILTER', {
        room: {
            timeline: {
                limit: limit ?? 30,
                types: encryptedMessages ? ['m.room.encrypted', 'm.room.message'] : ['m.room.message']
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
