import { expect } from 'chai'
import jsonServer from 'json-server'
import { getFriendsFromSocialService } from '../../src/FriendsManagementClient'
import { handleEmptySocialResponse, handleOkSocialResponse } from './socialServerMock'

describe('friendships from social server', () => {
    const PORT = 3131
    const PORT2 = 3132
    const baseUrl = `http://localhost:${PORT}`
    const baseUrl2 = `http://localhost:${PORT2}`
    const validToken = 'someToken'
    const invalidToken = 'invalidToken'

    const server = jsonServer.create()
    const server2 = jsonServer.create()

    before(() => {
        server.listen(PORT, () => console.log(`JSON Server is running on port ${PORT}`))
        server2.listen(PORT2, () => console.log(`JSON Server is running on port ${PORT2}`))
    })

    describe('when valid token', () => {
        context('when no friendships', () => {
            server.get(`/v1/friendships/me`, (req, res) => {
                handleEmptySocialResponse(req, res, validToken)
            })

            it('should return an empty array', async () => {
                const friends = await getFriendsFromSocialService(baseUrl, validToken)
                expect(friends).to.be.empty
            })
        })

        context('when there are friendships', () => {
            server2.get(`/v1/friendships/me`, (req, res) => {
                handleOkSocialResponse(req, res, validToken)
            })

            it('should return the array of friendships', async () => {
                const friends = await getFriendsFromSocialService(baseUrl2, validToken)
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
        server.get(`/v1/friendships/me`, (req, res) => {
            handleEmptySocialResponse(req, res, invalidToken)
        })

        it('should return an empty array', async () => {
            const friends = await getFriendsFromSocialService(baseUrl, invalidToken)
            expect(friends).to.be.empty
        })
    })
})
