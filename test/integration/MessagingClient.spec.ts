import chai from 'chai'
import sinonChai from 'sinon-chai'
import sinon from 'sinon'
import ms from 'ms'
import EthCrypto from 'eth-crypto'
import { SocialClient } from 'SocialClient'
import { ConversationType, MessageStatus, Conversation, MessageId } from 'types'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'
import { sleep } from '../utils/Utils'

chai.use(sinonChai)
const expect = chai.expect

describe('Integration - Messaging Client', () => {
    const testEnv: TestEnvironment = loadTestEnvironment()

    before(async () => {
      const client = await testEnv.getRandomClient()

      await client.getOrCreateChannel('the-coolest-marthas', [])
      await client.getOrCreateChannel('channel-name', [])
      await client.getOrCreateChannel('read-club-marthas', [])
    })

    it(`When a direct conversation is started, then both participants can see it`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Check that neither of the clients report having conversations
        const conversations1 = client1.getAllCurrentConversations()
        expect(conversations1).to.be.empty

        const conversations2 = client2.getAllCurrentConversations()
        expect(conversations2).to.be.empty

        // Create a conversation
        const commonConversation = await client1.createDirectConversation(client2.getUserId())
        expect(commonConversation.type).to.equal(ConversationType.DIRECT)
        expect(commonConversation.id).to.not.be.undefined

        // Wait for sync
        await sleep('1s')

        // Assert that both clients see the conversation
        const conversations1Again = client1.getAllCurrentConversations()
        expect(conversations1Again.length).to.equal(1)
        const [{ conversation: conversation1 }] = conversations1Again
        expect(conversation1.id).to.equal(commonConversation.id)
        expect(conversation1.type).to.equal(commonConversation.type)
        expect(conversation1.unreadMessages).to.deep.equal(commonConversation.unreadMessages)
        expect(conversation1.userIds).to.deep.equal([client1.getUserId(), client2.getUserId()])
        expect(conversation1.hasMessages).to.equal(false)
        expect(conversation1.lastEventTimestamp).not.to.be.undefined

        const conversations2Again = client2.getAllCurrentConversations()
        expect(conversations2Again.length).to.equal(1)
        const [{ conversation: conversation2 }] = conversations2Again
        expect(conversation2.id).to.equal(commonConversation.id)
        expect(conversation2.type).to.equal(commonConversation.type)
        expect(conversation2.unreadMessages).to.deep.equal(commonConversation.unreadMessages)
        expect(conversation2.userIds).to.deep.equal([client2.getUserId(), client1.getUserId()])
        expect(conversation2.hasMessages).to.equal(false)
        expect(conversation2.lastEventTimestamp).not.to.be.undefined
        expect(conversation2.name).not.to.be.undefined
    })

    it(`When a direct conversation is started with a client that doesn't exist, then an exception is thrown`, async () => {
        const client = await testEnv.getRandomClient()
        const nonExistentUserId = `@randomuser:${client.getDomain()}`

        // Create a conversation
        const conversationPromise = client.createDirectConversation(nonExistentUserId)

        // Assert that it failed
        await expect(conversationPromise).to.be.rejectedWith(
            `Some of the given users are not part of the system: '${nonExistentUserId}'`
        )
    })

    it(`When a direct conversation is started again between the same users, then the same conversation is reused`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const commonConversation = await client1.createDirectConversation(client2.getUserId())

        // Try to create the conversation again
        const newConversation1 = await client1.createDirectConversation(client2.getUserId())
        const newConversation2 = await client2.createDirectConversation(client1.getUserId())

        // Assert that the same conversation was used
        expect(newConversation1).to.deep.equal(commonConversation)
        expect(newConversation2).to.deep.equal(commonConversation)
    })

    it(`When a user sends another one a message, then the message is correctly received`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Prepare spies
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()

        // Set listeners
        client1.onMessage(spy1)
        client2.onMessage(spy2)

        // Create a conversation
        const conversation = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Send message
        await client1.sendMessageTo(conversation.id, 'Hi there!')

        // Wait for sync
        await sleep('1s')

        // Make sure that client1 didn't get its own message
        expect(spy1).to.not.have.been.called

        // Assert that the message sent by client 1 was received
        assertMessageWasReceivedByEvent(spy2, client1, conversation, 'Hi there!')
    })

    it(`When a user logs in, they don't get message events for past events`, async () => {
        const sender = await testEnv.getRandomClient()

        // Create receiver
        const receiverIdentity = EthCrypto.createIdentity()
        const receiverUserId = await testEnv.createUserOnServer(receiverIdentity)

        // Create a conversation
        const conversation = await sender.createDirectConversation(receiverUserId)

        // Send message
        await sender.sendMessageTo(conversation.id, 'Hi there!')

        // Log in the receiver
        const receiver = await testEnv.getClientWithIdentity(receiverIdentity)

        // Wait for sync
        await sleep('1s')

        // Set the listener
        const spy = sinon.spy()
        receiver.onMessage(spy)

        // Assert that the message was received
        expect(spy).to.not.have.been.called

        // Assert that the receiver sees the conversation
        const receiverConversations = receiver.getAllCurrentConversations()
        expect(receiverConversations.length).to.equal(1)
        const [{ conversation: receiverConversation, unreadMessages }] = receiverConversations
        expect(receiverConversation.id).to.equal(conversation.id)
        expect(receiverConversation.type).to.equal(conversation.type)
        expect(receiverConversation.lastEventTimestamp).not.to.be.undefined
        expect(receiverConversation.hasMessages).to.be.true

        // Since the message was sent before the user could see the conversation for the first time, there are no unread messages
        expect(unreadMessages).to.be.false
    })

    it(`When a user reads all messages, then it is reported correctly`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Send message
        const messageId = await client1.sendMessageTo(conversationId, 'Hi there!')

        // Wait for sync
        await sleep('1s')

        // Assert that client2 has unread messages
        const unreadMessages1 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages1).to.be.true
        const unreadMessages = client2.getConversationUnreadMessages(conversationId)
        expect(unreadMessages).length.to.be.greaterThan(0)

        // Mark message as read
        await client2.markAsRead(conversationId, messageId)

        // Wait for sync
        await sleep('1s')

        // Assert that client2 doesn't have unread messages
        const unreadMessages2 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages2).to.be.false
    })

    it(`When a user reads all messages, then it is reported correctly`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Send message
        const messageId = await client1.sendMessageTo(conversationId, 'Hi there!')

        // Wait for sync
        await sleep('1s')

        // Assert that client2 has unread messages
        const unreadMessages1 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages1).to.be.true

        // Mark message as read
        await client2.markAsRead(conversationId, messageId)

        // Wait for sync
        await sleep('1s')

        // Assert that client2 doesn't have unread messages
        const unreadMessages2 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages2).to.be.false
    })

    it(`When a user sends a message, then the conversation is considered to have no unread messages`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Send message
        await client1.sendMessageTo(conversationId, 'Hi there!')

        // Wait for sync
        await sleep('1s')

        // Assert that client2 has unread messages
        const unreadMessages = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages).to.be.true

        // Respond to the message
        await client2.sendMessageTo(conversationId, 'Hello back!')

        // Wait for sync
        await sleep('1s')

        // Assert that client2 doesn't have unread messages
        const unreadMessages2 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages2).to.be.false
    })

    it(`When there are no messages on the conversation, then it is considered that it doesn't have unread messages`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that client2 doesn't have unread messages
        const unreadMessages2 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages2).to.be.false
    })

    it(`When a user opens a private chat, it marks as seen all the messages`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Send message
        await client1.sendMessageTo(conversationId, 'Hi there!')
        await client1.sendMessageTo(conversationId, 'How are you?')

        // Wait for sync
        await sleep('1s')

        // Assert that client2 has unread messages
        const unreadMessages1 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages1).to.be.true
        const totalUnreadMessages = client2.getTotalUnseenMessages()
        expect(totalUnreadMessages).to.be.greaterThan(0)

        // Mark message as read
        await client2.markMessagesAsSeen(conversationId)

        // Wait for sync
        await sleep('1s')

        // Assert that client2 doesn't have unread messages
        const unreadMessages2 = client2.doesConversationHaveUnreadMessages(conversationId)
        expect(unreadMessages2).to.be.false
    })

    // Bug fix
    it(`When there is a live cursor, messages are only received one`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Prepare spies
        const spy = sinon.spy()

        // Set listeners
        client2.onMessage(spy)

        // Create a conversation
        const conversation = await client1.createDirectConversation(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Create the cursor
        await client2.getCursorOnLastMessage(conversation.id)

        // Send message
        await client1.sendMessageTo(conversation.id, 'Hi there!')

        // Wait for sync
        await sleep('1s')

        // Assert that the message sent by client 1 was received once
        assertMessageWasReceivedByEvent(spy, client1, conversation, 'Hi there!')
    })

    // Bug: Infinite loop in searchChannel func
    it('When a user wants to browse through channels with a search term, we search with the requested limit, the token to paginate from and the search term.', async () => {
      const client = await testEnv.getRandomClient()

      // We search with the requested limit (5), token to paginate from (undefined) and search term (marthas)
      // The loop breaks, as expected, when nextBatch is undefined
      const response = await client.searchChannel(5, 'marthas', undefined)
      expect(response.channels.length).to.be.equal(2)
      expect(response.nextBatch).to.be.undefined
    })

    // Bug: The search uses an empty string to search for
    it('When a user wants to browse through existing channels, we search with the requested limit and token to paginate from.', async () => {
      const client = await testEnv.getRandomClient()

      // We search with the requested limit (2) and token to paginate from (undefined)
      const pagination1 = await client.searchChannel(2, undefined, undefined)
      expect(pagination1.channels.length).to.be.equal(2)
      expect(pagination1.nextBatch).to.not.be.undefined

      // We search with the requested limit (2) and token to paginate from (the value of the variable `nextBatch` we got from the last query)
      const pagination2 = await client.searchChannel(2, undefined, pagination1.nextBatch)
      expect(pagination2.channels.length).to.be.equal(2)
      expect(pagination2.nextBatch).to.be.undefined
    })

    /** Assert that the message was received, and return the message id */
    function assertMessageWasReceivedByEvent(
        spy,
        sender: SocialClient,
        conversation: Conversation,
        message: string
    ): MessageId {
        // Make sure that the spy was called
        expect(spy).to.have.been.calledOnce

        // Assert that the message received was the one sent
        const listenedConversation = spy.firstCall.args[0]
        const { text, timestamp, sender: senderId, status, id } = spy.firstCall.args[1]

        expect(listenedConversation).to.deep.equal(conversation)
        expect(text).to.equal(message)
        expect(timestamp).to.be.closeTo(Date.now(), ms('3s'))
        expect(senderId).to.equal(sender.getUserId())
        expect(status).to.equal(MessageStatus.UNREAD)
        expect(id).not.to.be.undefined

        return id
    }
})
