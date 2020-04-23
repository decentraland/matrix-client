import { MatrixId, CurrentUserStatus, UpdateUserStatus } from './types';

export interface SessionManagementAPI {

    isLoggedIn(): boolean
    logout(): Promise<void>;
    getUserId(): MatrixId;
    getDomain(): string;

    setStatus(status: UpdateUserStatus): Promise<void>;
    getUserStatuses(...users: MatrixId[]): Promise<Map<MatrixId, CurrentUserStatus>>;
    onStatusChange(listener: (userId: MatrixId, status: CurrentUserStatus) => void): void;

}
