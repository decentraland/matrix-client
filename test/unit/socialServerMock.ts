const jsonServer = require('json-server')

export function mockSocialServer(userId: string, validToken: string, anotherUserId: string, PORT: number) {
    const server = jsonServer.create()

    // No friends userId
    server.get(`/v1/friendships/${userId}`, (req, res) => {
        handleEmptySocialResponse(req, res)
    })

    // Two friends anotherUserId
    server.get(`/v1/friendships/${anotherUserId}`, (req, res) => {
        handleOkSocialResponse(req, res)
    })

    // No mutuals userId
    server.get(`/v1/friendships/${userId}/mutuals`, (req, res) => {
        handleEmptySocialResponse(req, res)
    })

    // Two friends anotherUserId
    server.get(`/v1/friendships/${anotherUserId}/mutuals`, (req, res) => {
        handleOkSocialResponse(req, res)
    })

    server.listen(PORT, () => console.log(`JSON Server is running on port ${PORT}`))

    function isValidToken(req) {
        return req.headers && req.headers['authorization'] === `Bearer ${validToken}`
    }

    /**
     * Handles the social service response by sending the friendships data as a JSONP response if the request token is valid,
     * or by sending a 401 Unauthorized status code if the token is invalid.
     * @param friendships - an array of friendship objects, each containing an `address` property, if not empty.
     */
    function handleSocialResponse(req, res, friendships) {
        if (isValidToken(req)) {
            res.jsonp({
                friendships: friendships
            })
        } else {
            res.sendStatus(401)
        }
    }

    /**
     * Handles an empty social service response by calling `handleSocialResponse` with an empty array of friendships.
     */
    function handleEmptySocialResponse(req, res) {
        handleSocialResponse(req, res, [])
    }

    /**
     * Handles a successful social service response by calling `handleSocialResponse` with a pre-defined array of friendship objects.
     */
    function handleOkSocialResponse(req, res) {
        const friendships = [
            { address: '0xc0ffee254729296a45a3885639AC7E10F9d54979' },
            { address: '0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC' }
        ]
        handleSocialResponse(req, res, friendships)
    }
}
