import chai from 'chai'
import { SocialClient } from '../../src/SocialClient'
import { TextMessage, MessageStatus, CursorDirection, ConversationId } from '../../src/types'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'
import { sleep } from '../utils/Utils'
import 'isomorphic-fetch'
globalThis.global = globalThis as any

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
        const cursor = (await receiver.getCursorOnMessage(conversationId, messageId, { initialSize: 3 }))!

        expect(cursor).to.be.not.empty

        // Read the messages
        const messages = cursor.getMessages()

        // Assert that the messages are the expected ones
        assertMessagesAre(messages, 9, 11)

        // Make sure that extension possibilities are correct
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.true
        expect(cursor.canExtendInDirection(CursorDirection.BACKWARDS)).to.be.true
    })

    it(`When using a cursor on an undefined message, the reported messages are the expected`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Create a conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 10)
        await sendMessages(sender, conversationId, 11, 9)

        // Wait for sync
        await sleep('1s')

        // Get cursor on specific message
        const cursor = (await receiver.getCursorOnMessage(conversationId, undefined, { initialSize: 3 }))!

        expect(cursor).to.be.not.empty

        // Read the messages
        const messages = cursor.getMessages()

        // Assert that the messages are the expected ones (the last ones)
        assertMessagesAre(messages, 17, 19)

        // Make sure that extension possibilities are correct
        expect(cursor.canExtendInDirection(CursorDirection.FORWARDS)).to.be.false
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
        const cursor = (await receiver.getCursorOnLastRead(conversationId, { initialSize: 3 }))!

        expect(cursor).to.be.not.empty

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
        const cursor = (await receiver.getCursorOnLastMessage(conversationId, { initialSize: 10 }))!

        expect(cursor).to.be.not.empty

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
        const cursor = (await receiver.getCursorOnLastMessage(conversationId, { initialSize: 5, limit: 5 }))!

        expect(cursor).to.be.not.empty

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
        const senderCursor = (await sender.getCursorOnMessage(conversationId, messageId, { initialSize: 20 }))!
        const receiverCursor = (await receiver.getCursorOnMessage(conversationId, messageId, { initialSize: 20 }))!

        if (!senderCursor || !receiverCursor) return

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
        const cursor = (await receiver.getCursorOnLastMessage(conversationId, { initialSize: 20 }))!

        expect(cursor).to.be.not.empty

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

    it.only(`When the cursor is used, the reported messages are as expected, including the message sent in the request event`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Ask for friendship
        const message = 'hey Pizark, I would love to get in touch with you.'
        await sender.addAsFriend(receiver.getUserId(), message)

        // Approve friendship
        receiver.approveFriendshipRequestFrom(sender.getUserId())

        // Get conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages
        await sendMessages(sender, conversationId, 0, 4)

        // Wait for sync
        await sleep('1s')

        // Get cursor on last message
        const cursorReceiver = (await receiver.getCursorOnLastMessage(conversationId))!
        const cursorSender = (await sender.getCursorOnLastMessage(conversationId))!

        expect(cursorReceiver).to.be.not.empty
        expect(cursorSender).to.be.not.empty

        // Read the messages
        const messagesReceiver = cursorReceiver.getMessages()
        const messagesSender = cursorSender.getMessages()

        const requestMesssageReceiver = messagesReceiver.filter(msg => msg.text.includes(message))
        const requestMesssageSender = messagesSender.filter(msg => msg.text.includes(message))

        // Make sure we read all the expected messages
        expect(messagesReceiver.length).to.be.equal(5)
        expect(messagesSender.length).to.be.equal(5)
        expect(requestMesssageReceiver.length).to.be.equal(1)
        expect(requestMesssageSender.length).to.be.equal(1)
    })

    it.only(`When the cursor is moved, the reported messages are also moved along with the message sent in the request event`, async () => {
        const sender = await testEnv.getRandomClient()
        const receiver = await testEnv.getRandomClient()

        // Ask for friendship
        const message = 'hey Martha, I would love to get in touch with you.'
        await sender.addAsFriend(receiver.getUserId(), message)

        // Approve friendship
        receiver.approveFriendshipRequestFrom(sender.getUserId())

        // Get conversation
        const { id: conversationId } = await sender.createDirectConversation(receiver.getUserId())

        // Send messages (from Message #0 to Message #3)
        await sendMessages(sender, conversationId, 0, 4)

        // Wait for sync
        await sleep('1s')

        // Get cursor on last message
        const cursor = (await receiver.getCursorOnLastMessage(conversationId, { initialSize: 3, limit: 3 }))!

        expect(cursor).to.be.not.empty

        // Read the messages
        const firstPage = cursor.getMessages()
        const requestMesssageNo = firstPage.filter(msg => msg.text.includes(message))

        // Make sure we read the expected messages
        expect(firstPage.length).to.be.equal(3)
        expect(requestMesssageNo.length).to.be.equal(0)

        // Move the cursor backwards
        await cursor.moveInDirection(CursorDirection.BACKWARDS, 10)
        const secondPage = cursor.getMessages()
        const requestMesssageYes = secondPage.filter(msg => msg.text.includes(message))

        // Make sure we read all the expected messages
        expect(secondPage.length).to.be.equal(3)
        expect(requestMesssageYes.length).to.be.equal(1)
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

    async function sendMessages(
        sender: SocialClient,
        conversationId: ConversationId,
        from: number,
        amount: number
    ): Promise<void> {
        for (let i = 0; i < amount; i++) {
            await sender.sendMessageTo(conversationId, getMessageTextForIndex(from + i))
        }
    }
})
