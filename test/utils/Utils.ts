/// <reference types="node" />

import ms from 'ms'
import EthCrypto from 'eth-crypto'
import { Authenticator, AuthChain } from '@dcl/crypto'
import { ClientLoginOptions, SocialClient } from '../../src/SocialClient'
import { login } from '../../src/Utils'
import { SocialId } from '../../src/types'
import { LocalStorage } from 'node-localstorage'

export function sleep(time: string): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms(time)))
}

export function getDataToLogin(
    timestamp: number = Date.now(),
    identity = EthCrypto.createIdentity()
): { ethAddress: string; timestamp: number; authChain: AuthChain } {
    const messageToSign = `${timestamp}`
    const signature = Authenticator.createSignature(identity, messageToSign)
    const authChain = Authenticator.createSimpleAuthChain(messageToSign, identity.address, signature)
    return { ethAddress: identity.address, timestamp: timestamp, authChain }
}

const getLocalStorage = () => new LocalStorage('.storage')

export async function loginWithIdentity(serverUrl: string, identity, options?: Partial<ClientLoginOptions>) {
    const { ethAddress, timestamp, authChain } = getDataToLogin(Date.now(), identity)
    const client = await SocialClient.loginToServer(serverUrl, ethAddress, timestamp, authChain, {
        ...options,
        getLocalStorage,
        createOpts: {
        }
    })
    return client
}

export async function createUser(serverUrl: string, identity): Promise<SocialId> {
    const { ethAddress, timestamp, authChain } = getDataToLogin(Date.now(), identity)
    const matrixClient = await login(serverUrl, ethAddress, timestamp, authChain, getLocalStorage, {
    })
    const userId = matrixClient.getUserId()
    await matrixClient.logout()
    return userId!
}
