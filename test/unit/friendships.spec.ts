import { expect } from "chai"
import { getFriendsFromSocialService } from "../../src/FriendsManagementClient"


describe('friendships from social server', () => {
  const baseUrl = 'http://localhost:8080'
  const userId = '0xabcdefg'
  const validToken = 'Bearer someToken'
  const invalidToken = 'Bearer invalidToken'

  describe('when valid token', () => { 
    describe('when no friendships', () => {
    
      mockResponseOf(`${baseUrl}/v1/friendships/${userId}`, { 'Authorization': `Bearer ${validToken}` }, [])
      it('should return an empty array', async () => {
        const friends = await getFriendsFromSocialService(baseUrl, userId, validToken)
        
        expect(friends).to.be.empty
      })
    })
  
    describe('when there are friendships', () => {
      mockResponseOf(`${baseUrl}/v1/friendships/${userId}`, { 'Authorization': `Bearer ${validToken}` }, [{ 'address': 'someFriends' }])
      it('should return the array of friendships', async () => {
        const friends = await getFriendsFromSocialService(baseUrl, userId, validToken)
        
        expect(friends).to.equal(['someFriends'])})
    })
  }) 

  describe('when invalid token', () => {

    mockErrorResponseOf(`${baseUrl}/v1/friendships/${userId}`, { 'Authorization': `Bearer ${invalidToken}` }, 401)
    it('should return an error', async () => {
      try {
        await getFriendsFromSocialService(baseUrl, userId, invalidToken)
        throw new Error("calling 'getFriendsFromSocialService' with invalid token should fail")
      } catch { }
    })
  })

})

function mockResponseOf(url: string, headers: HeadersInit, response: any) {
  throw new Error("Function not implemented.")
}

function mockErrorResponseOf(url: string, headers: HeadersInit, errorCode: number) {
  throw new Error("Function not implemented.")
}

