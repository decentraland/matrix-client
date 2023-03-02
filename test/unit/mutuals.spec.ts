import { expect } from 'chai'
import { getMutualFriendsFromSocialService } from '../../src/FriendsManagementClient'
import { handleEmptySocialResponse, handleOkSocialResponse } from './socialServerMock'
import jsonServer from 'json-server'

describe('mutual friends from social server', () => {
    const PORT = 3130
    const baseUrl = `http://localhost:${PORT}`
    const userId = '0xabcdefg'
    const anotherUserId = '0xhijklmn'
    const validToken = 'someToken'
    const invalidToken = 'invalidToken'

    const server = jsonServer.create()

    before(() => {
        server.listen(PORT, () => console.log(`JSON Server is running on port ${PORT}`))
    })

    describe('when valid token', () => {
        context('when there are no mutuals', () => {
            server.get(`/v1/friendships/${userId}/mutuals`, (req, res) => {
                handleEmptySocialResponse(req, res, validToken)
            })
            it('should return an empty array', async () => {
                const mutuals = await getMutualFriendsFromSocialService(baseUrl, userId, validToken)
                expect(mutuals).to.be.empty
            })
        })

        context('when there are mutuals', () => {
            server.get(`/v1/friendships/${anotherUserId}/mutuals`, (req, res) => {
                handleOkSocialResponse(req, res, validToken)
            })
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
        server.get(`/v1/friendships/${userId}/mutuals`, (req, res) => {
            handleEmptySocialResponse(req, res, invalidToken)
        })
        it('should return an empty array', async () => {
            const mutuals = await getMutualFriendsFromSocialService(baseUrl, userId, invalidToken)
            expect(mutuals).to.be.empty
        })
    })
})
