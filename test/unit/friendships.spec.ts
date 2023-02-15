import { expect } from 'chai'
import { getFriendsFromSocialService } from '../../src/FriendsManagementClient'
import { mockSocialServer } from './socialServerMock'

describe('friendships from social server', () => {
    const PORT = 3131
    const baseUrl = `http://localhost:${PORT}`
    const userId = '0xabcdefg'
    const anotherUserId = '0xhijklmn'
    const validToken = 'someToken'
    const invalidToken = 'invalidToken'
    mockSocialServer(userId, validToken, anotherUserId, PORT)

    describe('when valid token', () => {
        context('when no friendships', () => {
            it('should return an empty array', async () => {
                const friends = await getFriendsFromSocialService(baseUrl, userId, validToken)

                expect(friends).to.be.empty
            })
        })

        context('when there are friendships', () => {
            it('should return the array of friendships', async () => {
                const friends = await getFriendsFromSocialService(baseUrl, anotherUserId, validToken)
                const expectedFriends = [
                    '0xc0ffee254729296a45a3885639AC7E10F9d54979',
                    '0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC'
                ]

                expect(friends).to.have.members(expectedFriends)
                expect(expectedFriends).to.have.members(friends)
            })
        })
    })

    describe('when invalid token', () => {
        it('should return an empty array', async () => {
            const friends = await getFriendsFromSocialService(baseUrl, userId, invalidToken)

            expect(friends).to.be.empty
        })
    })
})
