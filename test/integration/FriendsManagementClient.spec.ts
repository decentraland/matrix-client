
import chai from 'chai'
import sinonChai from 'sinon-chai'
import sinon from 'sinon'
import { SocialClient } from 'SocialClient'
import { sleep } from './Utils'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'

chai.use(sinonChai)
const expect = chai.expect

describe('Integration - Friends Management Client', () => {

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
        await assertNoPendingRequests(client1, client2)
        await assertNoFriends(client1, client2)

        // Ask for friendship
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the request event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they both see the request, but that they are not friends yet
        await assertPendingRequest(client1, client2)
        await assertNoFriends(client1, client2)
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
        await assertPendingRequest(client1, client2)

        // Cancel the request
        await client1.cancelFriendshipRequestTo(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 2 received the cancellation event
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client1)

        // Check that they have no pending requests
        await assertNoPendingRequests(client1, client2)
        await assertNoFriends(client1, client2)
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
        await assertPendingRequest(client1, client2)

        // Reject the request
        await client2.rejectFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the rejection event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        await assertNoPendingRequests(client1, client2)
        await assertNoFriends(client1, client2)
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
        await assertPendingRequest(client1, client2)

        // Approve the request
        await client2.approveFriendshipRequestFrom(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the approval event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        await assertNoPendingRequests(client1, client2)
        await assertUsersAreFriends(client1, client2)
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
        await assertPendingRequest(client1, client2)

        // Ask for friendship
        await client2.addAsFriend(client1.getUserId())

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the approval event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client2)

        // Check that they have no pending requests
        await assertNoPendingRequests(client1, client2)
        await assertUsersAreFriends(client1, client2)
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
        await assertNoPendingRequests(client1, client2)
        await assertNoFriends(client1, client2)
    })

    async function assertPendingRequest(from: SocialClient, to: SocialClient) {
        const fromPendingRequests = await from.getPendingRequests()
        const toPendingRequests = await to.getPendingRequests()

        expect(fromPendingRequests.length).to.equal(1)
        expect(toPendingRequests.length).to.equal(1)

        const [ fromPendingRequest ] = fromPendingRequests
        const [ toPendingRequest ] = toPendingRequests

        expect(fromPendingRequest).to.deep.equal(toPendingRequest)
        expect(fromPendingRequest.from).to.equal(from.getUserId())
        expect(fromPendingRequest.to).to.equal(to.getUserId())
    }

    async function assertNoPendingRequests(...clients: SocialClient[]): Promise<void> {
        for (const client of clients) {
            const pendingRequests = await client.getPendingRequests()
            expect(pendingRequests).to.be.empty
        }
    }

    async function assertNoFriends(...clients: SocialClient[]): Promise<void> {
        for (const client of clients) {
            const myFriends = await client.getAllFriends()
            expect(myFriends).to.be.empty
        }
    }

    async function assertUsersAreFriends(client1: SocialClient, client2: SocialClient): Promise<void> {
        const client1Friends = await client1.getAllFriends()
        const client2Friends = await client2.getAllFriends()

        expect(client1Friends).to.contain(client2.getUserId())
        expect(client2Friends).to.contain(client1.getUserId())
    }

    function assertEventWasReceived(spy, expectedSender: SocialClient): void {
        // Make sure that the spy was called
        expect(spy).to.have.been.calledOnce

        // Assert that the event received was sent by the actual sender
        const sender = spy.firstCall.args[0]

        expect(sender).to.equal(expectedSender.getUserId())
    }

})