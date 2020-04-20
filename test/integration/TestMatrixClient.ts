import { MatrixClient } from "MatrixClient";
import EthCrypto from 'eth-crypto'
import { getDataToLogin } from "./Utils";

/** An extension to the MatrixClient, to make testing easier */
export class TestMatrixClient extends MatrixClient {

    private loggedIn = false

    async loginWithIdentity(identity): Promise<TestMatrixClient> {
        const { ethAddress, timestamp, authChain } = getDataToLogin(Date.now(), identity)
        await this.loginWithEthAddress(ethAddress, timestamp, authChain)
        this.loggedIn = true
        return this
    }

    async loginWithRandomIdentity(): Promise<TestMatrixClient> {
        this.loggedIn = true
        return this.loginWithIdentity(EthCrypto.createIdentity())
    }

    logout(): Promise<void> {
        if (this.loggedIn) {
            this.loggedIn = false
            return super.logout()
        }
        return Promise.resolve()
    }
}