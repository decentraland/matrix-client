import { expect } from "chai"
import { getFriendsFromSocialService } from "../../src/FriendsManagementClient"
import jsonServer from 'json-server'

describe('friendships from social server', () => {
  const PORT = 3131
  const baseUrl = `http://localhost:${PORT}`
  const userId = '0xabcdefg'
  const anotherUserId = '0xhijklmn'
  const validToken = 'someToken'
  const invalidToken = 'invalidToken'
  mockSocialServer(userId, validToken, anotherUserId, PORT)

  describe('when valid token', () => { 
    describe('when no friendships', () => {
      it('should return an empty array', async () => {
        const friends = await getFriendsFromSocialService(baseUrl, userId, validToken)
        
        expect(friends).to.be.empty
      })
    })
  
    describe('when there are friendships', () => {
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
      const friends =  await getFriendsFromSocialService(baseUrl, userId, invalidToken)
      
      expect(friends).to.be.empty
    })
  })

})

function mockSocialServer(userId: string, validToken: string, anotherUserId: string, PORT: number) {
  const server = jsonServer.create()

  // No friends userId
  server.get(`/v1/friendships/${userId}`, (req, res) => {
    if (isValidToken(req)) {
      res.jsonp({
        "friendships": []
      })
    } else {
      res.sendStatus(401)
    }
  })

  // Two friends anotherUserId
  server.get(`/v1/friendships/${anotherUserId}`, (req, res) => {
    if (isValidToken(req)) {
      res.jsonp({
        "friendships": [
          {
            "address": "0xc0ffee254729296a45a3885639AC7E10F9d54979"
          },
          {
            "address": "0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC"
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

