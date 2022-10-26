
import fs from 'fs'
import ms from 'ms'
import EthCrypto from 'eth-crypto'
import { SocialClient } from '../../src/SocialClient'
import { UpdateUserStatus, PresenceType } from '../../src/types'
import { loginWithIdentity, createUser } from '../utils/Utils'

describe.skip('Performance Test', () => {

    const N = 100
    const serverUrl = 'https://matrix.decentraland.zone'

    let client: SocialClient
    let results: Map<string, string>

    before(async () => {
        const identities = JSON.parse(fs.readFileSync(`${__dirname}/resources/identities.json`).toString())

        client = await loginWithIdentity(serverUrl, identities[0])
        results = new Map()
    })

    after(async () => {
        await client.logout()
        results.forEach((result, description) => console.log(`'${description.padEnd(47)}': ${result}`))
    })

    async function measure(execution: (input?: any) => (Promise<any> | any), description: string, setUp?: () => Promise<any>): Promise<void> {
        results.set(description, 'Something went wrong')
        let totalTime = 0

        const input = setUp ? (await setUp()) : undefined

        for (let i = 0; i < N; i++) {
            const now = Date.now()
            await execution(input)
            const lasted = Date.now() - now
            totalTime += lasted
        }

        const avg = totalTime / N
        results.set(description, `Avg response time for was '${ms(avg)}'`)
    }

    it(`FriendsManagement#getAllFriends`, async () => {
        await measure(() => client.getAllFriends(), 'FriendsManagement#getAllFriends')
    })

    it(`FriendsManagement#getPendingRequests`, async () => {
        await measure(() => client.getPendingRequests(), 'FriendsManagement#getPendingRequests')
    })

    it(`FriendsManagement#isUserMyFriend`, async () => {
        const friend = client.getAllFriends()[0]
        await measure(() => client.isUserMyFriend(friend), 'FriendsManagement#isUserMyFriend')
    })

    it(`FriendsManagement#addAsFriend`, async () => {
        await measure(
            (userId) => client.addAsFriend(userId),
            'FriendsManagement#getPendingRequests',
            () => createUser(serverUrl, EthCrypto.createIdentity()))
    })

    it(`FriendsManagement#deleteFriendshipWith`, async () => {
        await measure(
            (userId) => client.deleteFriendshipWith(userId),
            'FriendsManagement#deleteFriendshipWith',
            async () => {
                const otherClient = await loginWithIdentity(serverUrl, EthCrypto.createIdentity())
                await client.addAsFriend(otherClient.getUserId())
                await otherClient.approveFriendshipRequestFrom(client.getUserId())
                return otherClient.getUserId()
            })
    })

    it(`FriendsManagement#approveFriendshipRequestFrom`, async () => {
        await measure(
            (userId) => client.approveFriendshipRequestFrom(userId),
            'FriendsManagement#approveFriendshipRequestFrom',
            async () => {
                const otherClient = await loginWithIdentity(serverUrl, EthCrypto.createIdentity())
                await otherClient.addAsFriend(client.getUserId())
                return otherClient.getUserId()
            })
    })

    it(`FriendsManagement#rejectFriendshipRequestFrom`, async () => {
        await measure(
            (userId) => client.rejectFriendshipRequestFrom(userId),
            'FriendsManagement#rejectFriendshipRequestFrom',
            async () => {
                const otherClient = await loginWithIdentity(serverUrl, EthCrypto.createIdentity())
                await otherClient.addAsFriend(client.getUserId())
                return otherClient.getUserId()
            })
    })

    it(`FriendsManagement#cancelFriendshipRequestTo`, async () => {
        await measure(
            (userId) => client.cancelFriendshipRequestTo(userId),
            'FriendsManagement#cancelFriendshipRequestTo',
            async () => {
                const userId = await createUser(serverUrl, EthCrypto.createIdentity())
                await client.addAsFriend(userId)
                return userId
            })
    })

    it(`Messaging#getAllCurrentConversations`, async () => {
        await measure(() => client.getAllCurrentConversations(), 'Messaging#getAllCurrentConversations')
    })

    it  (`Messaging#sendMessageTo`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        await measure(() => client.sendMessageTo(conversationId, 'Message'), 'Messaging#sendMessageTo')
    })

    it(`Messaging#markAsRead`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        const messageId = await client.sendMessageTo(conversationId, 'Message')
        await measure(() => client.markAsRead(conversationId, messageId), 'Messaging#markAsRead')
    })

    it(`Messaging#getLastReadMessage`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        await measure(() => client.getLastReadMessage(conversationId), 'Messaging#getLastReadMessage')
    })

    it(`Messaging#getCursorOnMessage`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        const messageId = await client.sendMessageTo(conversationId, 'Message')
        await measure(() => client.getCursorOnMessage(conversationId, messageId), 'Messaging#getCursorOnMessage')
    })

    it(`Messaging#getCursorOnLastRead`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        await measure(() => client.getCursorOnLastRead(conversationId), 'Messaging#getCursorOnLastRead')
    })

    it(`Messaging#getCursorOnLastMessage`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        await measure(() => client.getCursorOnLastMessage(conversationId), 'Messaging#getCursorOnLastMessage')
    })

    it(`Messaging#doesConversationHaveUnreadMessages`, async () => {
        const convs = client.getAllCurrentConversations()
        const conversationId = convs[0].conversation.id
        await measure(() => client.doesConversationHaveUnreadMessages(conversationId), 'Messaging#doesConversationHaveUnreadMessages')
    })

    it(`Messaging#createDirectConversation`, async () => {
        const friend = client.getAllFriends()[0]
        await measure(() => client.createDirectConversation(friend), 'Messaging#createDirectConversation')
    })

    it(`StatusManagement#getUserStatuses`, async () => {
        const friends = client.getAllFriends()
        await measure(() => client.getUserStatuses(...friends), 'StatusManagement#getUserStatuses')
    })

    it(`StatusManagement#setStatus`, async () => {
        const status: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await measure(() => client.setStatus(status), 'StatusManagement#setStatus')
    })

})