function isValidToken(req, validToken) {
    return req.headers && req.headers['authorization'] === `Bearer ${validToken}`
}

/**
 * Handles the social service response by sending the friendships data as a JSONP response if the request token is valid,
 * or by sending a 401 Unauthorized status code if the token is invalid.
 * @param friendships - an array of friendship objects, each containing an `address` property, if not empty.
 */
function handleSocialResponse(req, res, friendships, validToken) {
    if (isValidToken(req, validToken)) {
        res.jsonp({ friendships })
    } else {
        res.sendStatus(401)
    }
}

/**
 * Handles an empty social service response by calling `handleSocialResponse` with an empty array of friendships.
 */
export function handleEmptySocialResponse(req, res, validToken) {
    handleSocialResponse(req, res, [], validToken)
}

/**
 * Handles a successful social service response by calling `handleSocialResponse` with a pre-defined array of friendship objects.
 */
export function handleOkSocialResponse(req, res, validToken) {
    const friendships = [
        { address: '0xc0ffee254729296a45a3885639AC7E10F9d54979' },
        { address: '0x86F842D7Ea37EbEC6248eF1652E7DB971C631CCC' }
    ]
    handleSocialResponse(req, res, friendships, validToken)
}
