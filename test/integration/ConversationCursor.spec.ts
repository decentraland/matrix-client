
import chai from 'chai'
import { SocialClient } from 'SocialClient'
import { TextMessage, MessageStatus, CursorDirection, ConversationId } from 'types'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'
import { sleep } from '../utils/Utils'

const expect = chai.expect

describe('Integration - Conversation cursor', () => {

    const testEnv: TestEnvironment = loadTestEnvironment()

    it(`When using a cursor on a specific message, the reported messages are the expected`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 10)
        const messageId = await sender.sendMessageTo(conversationId, getMessageTextForIndex(10))
        await sendMessages(sender, conversationId, 11, 9)

        // Wait for sync
        await sleep('1s')

        // Get cursor on specific message
        const cursor = await receiver.getCursorOnMessage(conversationId, messageId, { initialSize: 3 })

        // Read the messages
        const messages = cursor.getMessages()

        // Assert that the messages are the expected ones
        assertMessagesAre(messages, 9, 11)

        // Make sure that extension possibilities are correct
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.true
        expect(cursor.canExtendInDirection(CursorDirection.BACKWARDS)).to.be.true
    })

    it(`When using a cursor on the last read message, the reported messages are the expected`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 10)
        const messageId = await sender.sendMessageTo(conversationId, getMessageTextForIndex(10))
        await sendMessages(sender, conversationId, 11, 9)

        // Wait for sync
        await sleep('1s')

        // Mark message as read
        await receiver.markAsRead(conversationId, messageId)

        // Get cursor on specific message
        const cursor = await receiver.getCursorOnLastRead(conversationId, { initialSize: 3 })

        // Read the messages
        const messages = cursor.getMessages()

        // Assert that the messages are the expected ones
        assertMessagesAre(messages, 9, 11)

        // Make sure that extension possibilities are correct
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.true
        expect(cursor.canExtendInDirection(CursorDirection.BACKWARDS)).to.be.true
    })

    it(`When using a cursor on the last message, the reported messages are the expected`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 20)

        // Wait for sync
        await sleep('1s')

        // Get cursor on last message
        const cursor = await receiver.getCursorOnLastMessage(conversationId, { initialSize: 10 })

        // Read the messages
        const messages = cursor.getMessages()

        // Assert that the messages are the last 10
        assertMessagesAre(messages, 10, 19)

        // Make sure that extension possibilities are correct
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.false
        expect(cursor.canExtendInDirection(CursorDirection.BACKWARDS)).to.be.true

        // Send a new message
        await sendMessages(sender, conversationId, 20, 1)

        // Wait for sync
        await sleep('1s')

        // Make sure that now I can extend forward
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.true
    })

    it(`When moving the cursor around, reported messages are also moved`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 20)

        // Wait for sync
        await sleep('1s')

        // Get cursor on last message
        const cursor = await receiver.getCursorOnLastMessage(conversationId, { initialSize: 5, limit: 5 })

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 15, 19)

        // Move 12 messages back
        await cursor.moveInDirection(CursorDirection.BACKWARDS, 12)

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 3, 7)

        // Move 7 messages forward
        await cursor.moveInDirection(CursorDirection.FORWARDS, 7)

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 10, 14)
    })

    it(`When getting messages, the read status is calculated correctly`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 10)
        const messageId = await sender.sendMessageTo(conversationId, getMessageTextForIndex(10))
        await sendMessages(sender, conversationId, 11, 9)

        // Wait for sync
        await sleep('1s')

        // Get cursors that reads all the messages
        const senderCursor = await sender.getCursorOnMessage(conversationId, messageId, { initialSize: 20 })
        const receiverCursor = await receiver.getCursorOnMessage(conversationId, messageId, { initialSize: 20 })

        // Mark message as read
        await receiver.markAsRead(conversationId, messageId)

        // Read the messages
        const senderMessages = senderCursor.getMessages()
        const receiverMessages = receiverCursor.getMessages()

        // Assert that the messages are the expected ones
        assertMessagesAre(senderMessages, 0, 19)
        assertMessagesAre(receiverMessages, 0, 19)

        // Assert status is correct
        assertMessagesStatusIs(senderMessages, 0, 19, MessageStatus.READ)
        assertMessagesStatusIs(receiverMessages, 0, 10, MessageStatus.READ)
        assertMessagesStatusIs(receiverMessages, 11, 19, MessageStatus.UNREAD)
    })

    it(`When messages are removed from the cursor, then they are not reported anymore`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 20)

        // Wait for sync
        await sleep('1s')

        // Get cursor on last message
        const cursor = await receiver.getCursorOnLastMessage(conversationId, { initialSize: 20 })

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 0, 19)

        // Remove the 5 oldest messages
        cursor.removeFromCursor(5, true)

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 5, 19)

        // Remove the 5 newest messages
        cursor.removeFromCursor(5, false)

        // Assert that the available messages are the expected ones
        assertMessagesAre(cursor.getMessages(), 5, 14)
    })

    function assertMessagesStatusIs(messages: TextMessage[], from: number, to: number, expectedStatus: MessageStatus) {
        for (let i = from; i <= to; i++) {
            expect(messages[i].status).to.equal(expectedStatus)
        }
    }

    function assertMessagesAre(messages: TextMessage[], from: number, to: number) {
        expect(messages.length).to.equal(to - from + 1)
        for (let i = 0; i < messages.length; i++) {
            expect(messages[i].text).to.equal(getMessageTextForIndex(from + i))
        }
    }

    function getMessageTextForIndex(index: number) {
        return `Message #${index}`
    }

    async function sendMessages(sender: SocialClient, conversationId: ConversationId, from: number, amount: number): Promise<void> {
        for (let i = 0; i < amount; i++) {
            await sender.sendMessageTo(conversationId, getMessageTextForIndex(from + i))
        }
    }

})