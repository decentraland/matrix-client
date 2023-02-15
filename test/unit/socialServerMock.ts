const jsonServer = require('json-server')

export function mockSocialServer(userId: string, validToken: string, anotherUserId: string, PORT: number) {
    const server = jsonServer.create()

    // No friends userId
    server.get(`/v1/friendships/${userId}`, (req, res) => {
        if (isValidToken(req)) {
            res.jsonp({
                friendships: []
            })
        } else {
            res.sendStatus(401)
        }
    })

    // Two friends anotherUserId
    server.get(`/v1/friendships/${anotherUserId}`, (req, res) => {
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
