import chai from 'chai'
import sinonChai from 'sinon-chai'
import sinon from 'sinon'
import { SocialClient } from '../../src/SocialClient'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'
import { sleep } from '../utils/Utils'
import 'isomorphic-fetch'
globalThis.global = globalThis as any

chai.use(sinonChai)
const expect = chai.expect

// TODO: We should add a test for the concurrent update errors #97
describe.skip('Integration - Friends Management Client', () => {
    const testEnv: TestEnvironment = loadTestEnvironment()

    it(`When a friendship request is sent, then the other user listens to the event, and both see the pending request`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequest(spy1)
        client2.onFriendshipRequest(spy2)

        // Check that neither of the clients report having friendship requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the request event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they both see the request, but that they are not friends yet
        assertPendingRequest(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true
    })

    it(`When a friendship request is sent with a message, the other user listens to the event and both see the pending request with the message`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequest(spy1)
        client2.onFriendshipRequest(spy2)

        // Check that neither of the clients report having friendship requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Ask for friendship
        const message = 'hey Pizark, I would love to get in touch with you.'
        await client1.addAsFriend(client2.getUserId(), message)

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the request event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they both see the request, but that they are not friends yet
        assertPendingRequest(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Check message
        assertMessageFromPendingRequest(client1, client2, message)
    })

    it(`When a friendship request is sent with a message, the request is rejected and then sent again, but this time without a message.`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequest(spy1)
        client2.onFriendshipRequest(spy2)

        // Check that neither of the clients report having friendship requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Ask for friendship
        const message = 'hey Pizark, I would love to get in touch with you.'
        await client1.addAsFriend(client2.getUserId(), message)

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the request event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they both see the request, but that they are not friends yet
        assertPendingRequest(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Check message
        assertMessageFromPendingRequest(client1, client2, message)

        // Reject friendship
        client2.rejectFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Check that neither of the clients report having friendship requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Check message
        assertMessageFromPendingRequest(client1, client2, undefined)
    })

    it(`When a friendship request is canceled, then the other user listens to the cancellation event and both stop seeing the pending request`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequestCancellation(spy1)
        client2.onFriendshipRequestCancellation(spy2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that they both see the pending request
        assertPendingRequest(client1, client2)

        // Cancel the request
        await client1.cancelFriendshipRequestTo(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the cancellation event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they have no pending requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true
    })

    it(`When a friendship request is rejected, then the user who sent the request sees the event, and both stop seeing the pending request`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequestRejection(spy1)
        client2.onFriendshipRequestRejection(spy2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that they both see the pending request
        assertPendingRequest(client1, client2)

        // Reject the request
        await client2.rejectFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the rejection event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true
    })

    it(`When a friendship request is approved, then the user who sent the request sees the event, both stop seeping the pending request and both see each other as friends`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequestApproval(spy1)
        client2.onFriendshipRequestApproval(spy2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that they both see the pending request
        assertPendingRequest(client1, client2)

        // Approve the request
        await client2.approveFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the approval event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        assertNoPendingRequests(client1, client2)
        expect(await usersAreFriends(client1, client2)).to.be.true
    })

    it(`When a friendship request is made from B to A, after A had already requested B, then it is considered as an approval`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipRequestApproval(spy1)
        client2.onFriendshipRequestApproval(spy2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that they both see the pending request
        assertPendingRequest(client1, client2)

        // Ask for friendship
        await client2.addAsFriend(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the approval event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        assertNoPendingRequests(client1, client2)
        
        expect(await usersAreFriends(client1, client2)).to.be.true
    })

    it(`When a friendship is deleted, then the other user listens to the event, and both stop seeing each other as friends`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onFriendshipDeletion(spy1)
        client2.onFriendshipDeletion(spy2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Approve the request
        await client2.approveFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Delete the friendship
        await client2.deleteFriendshipWith(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the approval event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        assertNoPendingRequests(client1, client2)
        expect(await emptyFriendsList(client1, client2)).to.be.true
    })

    function assertPendingRequest(from: SocialClient, to: SocialClient) {
        const fromPendingRequests = from.getPendingRequests()
        const toPendingRequests = to.getPendingRequests()

        expect(fromPendingRequests.length).to.equal(1)
        expect(toPendingRequests.length).to.equal(1)

        const [fromPendingRequest] = fromPendingRequests
        const [toPendingRequest] = toPendingRequests

        expect(fromPendingRequest.from).to.equal(toPendingRequest.from)
        expect(fromPendingRequest.to).to.equal(toPendingRequest.to)
        expect(fromPendingRequest.to).to.equal(to.getUserId())
        expect(fromPendingRequest.createdAt).not.to.equal(null)
        expect(typeof fromPendingRequest.createdAt).to.equal(typeof 1)
        assertMessageFromPendingRequest(from, to, fromPendingRequest.message)
    }

    function assertNoPendingRequests(...clients: SocialClient[]): void {
        for (const client of clients) {
            const pendingRequests = client.getPendingRequests()
            expect(pendingRequests).to.be.empty
        }
    }

    async function emptyFriendsList(...clients: SocialClient[]): Promise<boolean> {
        for (const client of clients) {
            let friends = await client.getAllFriendsAddresses()
            if (friends.length > 0) return false
        }
        return true
    }

    async function usersAreFriends(client1: SocialClient, client2: SocialClient): Promise<boolean> {
        let client1Friends: string[] = await client1.getAllFriendsAddresses();
        let client2Friends: string[] = await client2.getAllFriendsAddresses();
        console.log(client1Friends, client2Friends)
        return client1Friends.includes(client2.getUserId()) && client2Friends.includes(client1.getUserId())
    }

    function assertEventWasReceived(spy, expectedSender: SocialClient): void {
        // Make sure that the spy was called
        expect(spy).to.have.been.calledOnce

        // Assert that the event received was sent by the actual sender
        const sender = spy.firstCall.args[0]

        expect(sender).to.equal(expectedSender.getUserId())
    }

    function assertMessageFromPendingRequest(from: SocialClient, to: SocialClient, message?: string) {
        const fromPendingRequests = from.getPendingRequests()
        const toPendingRequests = to.getPendingRequests()

        const [fromPendingRequest] = fromPendingRequests
        const [toPendingRequest] = toPendingRequests

        expect(fromPendingRequest.message).to.equal(toPendingRequest.message)
        expect(fromPendingRequest.message).to.equal(message)
    }
})
