import Matrix from 'matrix-js-sdk';
import { MatrixId } from './types';
import { SessionManagementAPI } from 'SessionManagementAPI';

export class SessionManagementClient implements SessionManagementAPI{

    private loggedIn: boolean = true

    constructor(private readonly matrixClient: Matrix.MatrixClient) { }

    isLoggedIn(): boolean {
        return this.loggedIn
    }

    async logout(): Promise<void> {
        this.loggedIn = false
        await this.matrixClient.stopClient()
        await this.matrixClient.logout();
    }

    getUserId(): MatrixId {
        return this.matrixClient.getUserId()
    }

    getDomain(): string {
        return this.matrixClient.getDomain()
    }

}
