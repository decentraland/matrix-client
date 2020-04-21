import Matrix from 'matrix-js-sdk';
import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, LoginData, MatrixId } from './types';

export class SessionManagementClient {

    constructor(private readonly client: Matrix.MatrixClient) { }

    async loginWithEthAddress(ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<LoginData> {
        // Actual login
        const loginData: LoginData = await this.client.login('m.login.decentraland', {
            identifier: {
                type: 'm.id.user',
                user: ethAddress.toLowerCase(),
            },
            timestamp: timestamp.toString(),
            auth_chain: authChain
        });

        // Start the client
        await this.client.startClient({
            pendingEventOrdering: 'detached',
            initialSyncLimit: 0, // We don't want to consider past events as 'live'
        });

        return loginData
    }

    async logout(): Promise<void> {
        await this.client.stopClient()
        await this.client.logout();
    }

    getUserId(): MatrixId {
        return this.client.getUserId()
    }

}
