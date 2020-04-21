import { AuthChain, EthAddress } from 'dcl-crypto'
import { Timestamp, LoginData, MatrixId } from './types';

export interface SessionManagementAPI {

    loginWithEthAddress(ethAddress: EthAddress, timestamp: Timestamp, authChain: AuthChain): Promise<LoginData>;
    logout(): Promise<void>;
    getUserId(): MatrixId;

}
