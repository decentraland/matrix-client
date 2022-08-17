import { SessionManagementAPI } from './SessionManagementAPI'
import { FriendsManagementAPI } from './FriendsManagementAPI'
import { MessagingAPI } from './MessagingAPI'

export interface SocialAPI extends FriendsManagementAPI, MessagingAPI, SessionManagementAPI {}
