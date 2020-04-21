import ms from 'ms'
import EthCrypto from 'eth-crypto'
import { Authenticator, AuthChain } from 'dcl-crypto'
import { TestEnvironment } from './TestEnvironments';

export function sleep(time: string): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms(time)));
}

export function getDataToLogin(timestamp: number = Date.now(), identity = EthCrypto.createIdentity()): { ethAddress: string, timestamp: number, authChain: AuthChain } {
    const messageToSign = `${timestamp}`
    const signature = Authenticator.createSignature(identity, messageToSign)
    const authChain = Authenticator.createSimpleAuthChain(messageToSign, identity.address, signature)
    return { ethAddress: identity.address, timestamp: timestamp, authChain }
}

/** In order to create a user, we need to login */
export async function createUserInServer(testEnv: TestEnvironment, identity) {
    const receiver = testEnv.getClient()
    await receiver.loginWithIdentity(identity)
    const userId = receiver.getUserId()
    await receiver.logout()
    return userId

}