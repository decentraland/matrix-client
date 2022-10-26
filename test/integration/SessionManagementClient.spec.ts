
import chai from 'chai'
import sinonChai from 'sinon-chai'
import sinon from 'sinon'
import EthCrypto from 'eth-crypto'
import { SocialClient } from '../../src/SocialClient'
import { PresenceType, UpdateUserStatus, CurrentUserStatus, SocialId } from '../../src/types'
import { TestEnvironment, loadTestEnvironment } from './TestEnvironments'
import { sleep } from '../utils/Utils'

chai.use(sinonChai)
const expect = chai.expect

describe('Integration - Session Management Client', () => {

    const testEnv: TestEnvironment = loadTestEnvironment()

    it(`When a user logs out, then the client says they they logged out`, async () => {
        const client = await testEnv.getRandomClient()

        expect(client.isLoggedIn()).to.be.true

        client.logout()

        expect(client.isLoggedIn()).to.be.false
    })

    it.skip(`When a user sets a status, only friends get the event`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()
        const client3 = await testEnv.getRandomClient()

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        client1.onStatusChange(spy1)
        client2.onStatusChange(spy2)

        // Create a chat between client2 and 3
        await client2.createDirectConversation(client3.getUserId())

        // Make client1 and client3 become friends
        await becomeFriends(client1, client3)

        // Wait for sync
        await sleep('1s')

        // Set a status
        const updateStatus: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await client3.setStatus(updateStatus)

        // Wait for sync
        await sleep('1s')

        // Assert that only client 1 received the status event
        expect(spy2).to.not.have.been.called
        assertEventWasReceived(spy1, client3, updateStatus)
    })

    it.skip(`When a user sets a status, recent and old friends get the event`, async () => {
        const identity1 = EthCrypto.createIdentity()
        const identity2 = EthCrypto.createIdentity()
        let client = await testEnv.getClientWithIdentity(identity1)
        let oldFriend = await testEnv.getClientWithIdentity(identity2)

        // Make client and oldFriend become friends
        await becomeFriends(client, oldFriend)

        // Wait for sync
        await sleep('1s')

        // Logout both users, and wait for logout
        await client.logout()
        await oldFriend.logout()
        await sleep('1s')

        // Log in again, and the new friend also
        client = await testEnv.getClientWithIdentity(identity1)
        oldFriend = await testEnv.getClientWithIdentity(identity2)
        const newFriend = await testEnv.getRandomClient()

        // Make client and newFriend become friends
        await becomeFriends(client, newFriend)

        // Set listeners
        const spy1 = sinon.spy()
        const spy2 = sinon.spy()
        const spy3 = sinon.spy()
        client.onStatusChange(spy1)
        oldFriend.onStatusChange(spy2)
        newFriend.onStatusChange(spy3)

        // Set a status
        const updateStatus: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await client.setStatus(updateStatus)

        // Wait for sync
        await sleep('1s')

        // Assert that both friends got the update
        expect(spy1).to.not.have.been.called
        assertEventWasReceived(spy2, client, updateStatus)
        assertEventWasReceived(spy3, client, updateStatus)
    })

    it(`When a user sets a status, then only friends can see it`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()
        const client3 = await testEnv.getRandomClient()

        // Set a status
        const updateStatus: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await client2.setStatus(updateStatus)

        // Assert that the status is not reported
        const status = client1.getUserStatuses(client2.getUserId())
        expect(status).to.be.empty

        // Make client1 and client2 become friends
        await becomeFriends(client1, client2)

        // Wait for sync
        await sleep('1s')

        // Assert that the status is now reported
        const client2Status = getCurrentStatus(client1, client2)
        assertCurrentStatusIsTheExpected(client2Status, updateStatus)

        // Assert that client3 can't see the status
        const statuses = client3.getUserStatuses(client2.getUserId())
        expect(statuses).to.be.empty

    })

    it(`When no status is actively set, then status is considered online`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Make client1 and client2 become friends
        await becomeFriends(client1, client2)

        // Wait for sync
        await sleep('1s')

        // Assert that the status is set as online
        const client2Status = getCurrentStatus(client1, client2)
        expect(client2Status.presence).to.equal(PresenceType.ONLINE)
    })

    it(`When status is changed, then change is also detected`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set a status
        const updateStatus1: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await client2.setStatus(updateStatus1)

        // Make client1 and client2 become friends
        await becomeFriends(client1, client2)

        // Wait for sync
        await sleep('1s')

        // Assert that the status is correctly reported
        const client2Status = getCurrentStatus(client1, client2)
        assertCurrentStatusIsTheExpected(client2Status, updateStatus1)

        // Set new status
        const updateStatus2: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'hades', layer: 'blue' }, position: { x: 3, y: 4 } }
        await client2.setStatus(updateStatus2)

        // Wait for sync
        await sleep('1s')

        // Assert that the status has changed
        const newClient2Status = getCurrentStatus(client1, client2)
        assertCurrentStatusIsTheExpected(newClient2Status, updateStatus2)
    })

    // Skipping because it takes too long
    it.skip(`When a user logs out, then the status is changed to offline`, async () => {
        const client1 = await testEnv.getRandomClient()
        const client2 = await testEnv.getRandomClient()

        // Set a status
        const updateStatus: UpdateUserStatus = { presence: PresenceType.ONLINE, realm: { serverName: 'zeus', layer: 'red' }, position: { x: 1, y: 2 } }
        await client2.setStatus(updateStatus)

        // Make client1 and client2 become friends
        await becomeFriends(client1, client2)

        // Wait for sync
        await sleep('1s')

        // Assert that the status is correctly reported
        const client2Status = getCurrentStatus(client1, client2)
        assertCurrentStatusIsTheExpected(client2Status, updateStatus)

        // Log out
        await client2.logout()

        // Matrix server waits for 30s to determine that a user has went offline, so we need to wait more to avoid flakiness
        await sleep('1m')

        // Assert that the status is set as offline
        const newClient2Status = getCurrentStatus(client1, client2)
        expect(newClient2Status.presence).to.equal(PresenceType.OFFLINE)
        expect(newClient2Status.position).to.be.undefined
        expect(newClient2Status.realm).to.be.undefined
        expect(newClient2Status.lastActiveAgo).to.be.greaterThan(client2Status.lastActiveAgo!!)
    })

    function assertEventWasReceived(spy, expectedSender: SocialClient, expectedStatus: UpdateUserStatus): void {
        // Make sure that the spy was called
        expect(spy).to.have.been.calledOnce

        // Assert that the event received was sent by the actual sender
        const sender: SocialId = spy.firstCall.args[0]
        const status: CurrentUserStatus = spy.firstCall.args[1]

        expect(sender).to.equal(expectedSender.getUserId())
        assertCurrentStatusIsTheExpected(status, expectedStatus)
    }

    function assertCurrentStatusIsTheExpected(currentStatus: CurrentUserStatus, expectedStatus: UpdateUserStatus): void {
        expect(currentStatus.presence).to.equal(expectedStatus.presence)
        expect(currentStatus.position).to.deep.equal(expectedStatus.position)
        expect(currentStatus.realm).to.deep.equal(expectedStatus.realm)
        expect(currentStatus.lastActiveAgo).to.be.greaterThan(0)
    }


    async function becomeFriends(client1: SocialClient, client2: SocialClient) {
        // Client1 asks client2 to be friends
        await client1.addAsFriend(client2.getUserId())

        // Wait for sync
        await sleep('1s')

        // Client2 is now friends with client1
        await client2.approveFriendshipRequestFrom(client1.getUserId())
    }

    /** Get client2's current status, from client1 point of view */
    function getCurrentStatus(client1: SocialClient, client2: SocialClient): CurrentUserStatus {
        const statuses = client1.getUserStatuses(client2.getUserId())
        expect(statuses.size).to.equal(1)
        return statuses.get(client2.getUserId())!!
    }

})

