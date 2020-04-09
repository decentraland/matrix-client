import Matrix from 'matrix-js-sdk';
import { AuthChain } from 'dcl-crypto'

export class Client {

    private readonly client: Matrix.MatrixClient;

    constructor(synapseUrl: string) {
        this.client = Matrix.createClient({ baseUrl: synapseUrl })
    }

    async login(ethAddress: string, timestamp: number, authChain: AuthChain): Promise<any> {
        const data = await this.client.login('m.login.decentraland', {
            identifier: {
                type: 'm.id.user',
                user: ethAddress.toLowerCase(),
            },
            timestamp: timestamp.toString(),
            auth_chain: authChain
        });

        // TODO: Update user displayName to the avatar's name.

        return data
    }

    async logout(): Promise<void> {
        return await this.client.logout();
    }

}