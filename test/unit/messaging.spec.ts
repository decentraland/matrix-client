import { expect } from 'chai'
import jsonServer from 'json-server'
import { getFriendRequestMessages } from '../../src/MessagingClient'
import { MessageStatus, TextMessage } from '../../src/types'

describe.only('friendships from social server', () => {
    const PORT = 3130
    const baseUrl = `http://localhost:${PORT}`
    const friendshipId = '0xabcdefg'
    const anotherfriendshipId = '0xhijklmn'
    const validToken = 'someToken'
    mockSocialServer(friendshipId, validToken, anotherfriendshipId, PORT)

    describe('when valid token', () => {
        describe('when no friendships', () => {
            it('should return an empty array', async () => {
                const messages = await getFriendRequestMessages(baseUrl, validToken, friendshipId)

                expect(messages).to.be.empty
            })
        })

        describe('when there are friendships', () => {
            it('should return the array of friendships', async () => {
                const messages = await getFriendRequestMessages(baseUrl, validToken, anotherfriendshipId)
                const excpectedMessagesRequestEvents: TextMessage[] = [
                    {
                        text: 'Hi',
                        timestamp: 1675189670,
                        sender: 'a_user_id',
                        status: MessageStatus.READ,
                        id: anotherfriendshipId
                    },
                    {
                        text: 'Wanna be friends?',
                        timestamp: 1675189670,
                        sender: 'a_user_id',
                        status: MessageStatus.READ,
                        id: anotherfriendshipId
                    }
                ]
                expect(messages).to.deep.equal(excpectedMessagesRequestEvents)
                expect(excpectedMessagesRequestEvents).to.deep.equal(messages)
            })
        })
    })
})

function mockSocialServer(friendshipId: string, validToken: string, anotherfriendshipId: string, PORT: number) {
    const server = jsonServer.create()

    // No messasges for friendshipId
    server.get(`/v1/friendships/${friendshipId}/request-events/messages`, (req, res) => {
        if (isValidToken(req)) {
            res.jsonp({
                messagesRequestEvents: []
            })
        } else {
            res.sendStatus(401)
        }
    })

    // Two messages for anotherfriendshipId
    server.get(`/v1/friendships/${anotherfriendshipId}/request-events/messages`, (req, res) => {
        if (isValidToken(req)) {
            res.jsonp({
                messagesRequestEvents: [
                    {
                        friendshipId: anotherfriendshipId,
                        actingUser: 'a_user_id',
                        timestamp: 1675189670,
                        body: 'Hi'
                    },
                    {
                        friendshipId: anotherfriendshipId,
                        actingUser: 'a_user_id',
                        timestamp: 1675189670,
                        body: 'Wanna be friends?'
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
