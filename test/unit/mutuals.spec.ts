import { expect } from 'chai'
import jsonServer from 'json-server'
import { getFriendsFromSocialService, getMutualFriendsFromSocialService } from '../../src/FriendsManagementClient'

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

export function mockSocialServer(userId: string, validToken: string, anotherUserId: string, PORT: number) {
    const server = jsonServer.create()

    // No mutuals userId
    server.get(`/v1/friendships/${userId}/mutuals`, (req, res) => {
        if (isValidToken(req)) {
            res.jsonp({
                friendships: []
            })
        } else {
            res.sendStatus(401)
        }
    })

    // Two friends anotherUserId
    server.get(`/v1/friendships/${anotherUserId}/mutuals`, (req, res) => {
        if (isValidToken(req)) {
            res.jsonp({
                friendships: [
                    {
                        address: '0xc0ffee254729296a45a3885639AC7E10F9d54979'
                    },
                    {
                        address: '0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC'
                    }
                ]
            })
        } else {
            res.sendStatus(401)
        }
    })

    server.listen(PORT, () => console.log(`JSON Server is running on port ${PORT}`))

    function isValidToken(req) {
        return req.headers && req.headers['authorization'] === `Bearer ${validToken}`
    }
}
