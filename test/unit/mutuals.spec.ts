import { expect } from 'chai'
import { getFriendsFromSocialService, getMutualFriendsFromSocialService } from '../../src/FriendsManagementClient'
import { mockSocialServer } from './socialServerMock'

describe.only('mutual friends from social server', () => {
    const PORT = 3130
    const baseUrl = `http://localhost:${PORT}`
    const userId = '0xabcdefg'
    const anotherUserId = '0xhijklmn'
    const validToken = 'someToken'
    const invalidToken = 'invalidToken'
    mockSocialServer(userId, validToken, anotherUserId, PORT)

    describe('when valid token', () => {
        context('when there are no mutuals', () => {
            it('should return an empty array', async () => {
                const mutuals = await getMutualFriendsFromSocialService(baseUrl, userId, validToken)

                expect(mutuals).to.be.empty
            })
        })

        context('when there are mutuals', () => {
            it('should return the array of addresses', async () => {
                const mutuals = await getMutualFriendsFromSocialService(baseUrl, anotherUserId, validToken)
                const expectedMutuals = [
                    '0xc0ffee254729296a45a3885639AC7E10F9d54979',
                    '0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC'
                ]

                expect(mutuals).to.have.members(expectedMutuals)
                expect(expectedMutuals).to.have.members(mutuals)
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
