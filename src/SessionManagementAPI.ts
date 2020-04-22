import { MatrixId } from './types';

export interface SessionManagementAPI {

    isLoggedIn(): boolean
    logout(): Promise<void>;
    getUserId(): MatrixId;
    getDomain(): string;

}
