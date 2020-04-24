import { SessionManagementAPI } from './SessionManagementAPI';
import { FriendsManagementAPI } from './FriendsManagementAPI';
import { MessagingAPI } from './MessagingAPI';

export interface SocialClientAPI extends FriendsManagementAPI, MessagingAPI, SessionManagementAPI { }
