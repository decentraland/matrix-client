import requests
import logging
from twisted.internet import defer
from datetime import timedelta, datetime

LOGIN_TYPE = 'm.login.decentraland'
logger = logging.getLogger('synapse.decentraland_password_auth_provider')

class DecentralandPasswordAuthProvider:
    """
        This PasswordAuthProvider will receive an ethereum address as a username and some extra data (as a signature) to confirm that
        the user is who they say they are. This data will consist of a timestamp (that needs to be recent enough), and an auth
        chain that ends up signing the timestamp.
        The provider will then validate the signature, create the user if necessary, and return the qualified user id.
        It is important to mention that the username must be only the ethereum address (or localpart in Matrix terms). The domain
        shouldn't be passed.
    """

    def __init__(self, config, account_handler):
        self.enabled = config.get('enabled', True) # Enabled by default
        self.trusted_servers = DecentralandPasswordAuthProvider.sanitize_trusted_servers(config['trusted_servers'])
        logger.info('Will use the following trusted servers \'%s\'', ', '.join(self.trusted_servers))
        self.account_handler = account_handler


    def get_supported_login_types(self):
        if self.enabled:
            return { LOGIN_TYPE: ('timestamp', 'auth_chain') }
        else:
            return { }

    @defer.inlineCallbacks
    def check_auth(self, username, login_type, login_dict):
        # Use lowercase
        username = username.lower()

        # Make sure that provider is enabled
        if not self.enabled:
            logger.debug("Username '%s' could not log in, since the provider is disabled", username)
            return None

        # Make sure that the login type is correct
        if login_type != LOGIN_TYPE:
            logger.debug("Username '%s' could not log in, since login type was incorrect", username)
            return None

        # Make sure that the required fields were provided
        if 'timestamp' not in login_dict or 'auth_chain' not in login_dict:
            logger.debug("Username '%s' could not log in, since the required fields were not provided", username)
            return None

        # Validate that the timestamp is recent (max diff is 1 minute)
        utc_timestamp = datetime.utcfromtimestamp(float(login_dict['timestamp']) / 1000.)
        diff = datetime.utcnow() - utc_timestamp
        delta = timedelta(minutes = 1)
        if diff > delta:
            logger.debug("Username '%s' could not log in, since timestamp was too old", username)
            return None
        elif diff < -delta:
            logger.debug("Username '%s' could not log in, since timestamp was too far into the future", username)
            return None

        # Validate the auth chain
        ownerAddress = self.__validate_auth_chain(login_dict['timestamp'], login_dict['auth_chain'])

        # Verify owner address is actually the user name
        if ownerAddress is None:
            logger.debug("Username '%s' could not log in, auth chain was invalid", username)
            return None
        elif username != ownerAddress.lower():
            logger.debug("Username '%s' could not log in, since the provided user name did not math the owner address", username)
            return None

        # Check if user exists
        user_id = self.account_handler.get_qualified_user_id(username)
        user_id = yield self.account_handler.check_user_exists(user_id)

        # If it doesn't exist, then create it
        if user_id is None:
            logger.debug("Username '%s' is being registered", username)
            user_id = yield self.account_handler.register_user(username)
            logger.debug("Username '%s' was registered. New id is '%s'", username, user_id)

        return user_id


    def __validate_auth_chain(self, timestamp, auth_chain):
        """
            This method will check if the given auth chain is valid or not. We will go through each of the
            trusted servers, until one responds to the verification request.
            We will return the owner address if the auth chain is valid, or None if the auth chain is invalid.
        """
        for server in self.trusted_servers:
            try:
                url = '{}/crypto/validate-signature'.format(server)
                r = requests.post(url, json={'authChain': auth_chain, 'timestamp': timestamp}, timeout=5)
                r.raise_for_status()
                result = r.json()
                if 'valid' in result and 'ownerAddress' in result and result['valid']:
                    return result['ownerAddress']
            except Exception as e:
                logger.warn('Failed to connect to %s. Error was %s', server, e)
        return None

    @staticmethod
    def sanitize_trusted_servers(trusted_servers):
        return [server.rstrip('/') for server in trusted_servers]


    @staticmethod
    def parse_config(config):
        if 'trusted_servers' not in config:
            raise Exception('You can\'t use the Decentraland Auth Provider without setting the property \'trusted_servers\'.')

        trusted_servers = config['trusted_servers']

        if not isinstance(trusted_servers, list):
            raise Exception('Expected the property \'trusted_servers\' to be a list.')

        if len(trusted_servers) == 0:
            raise Exception('Expected the property \'trusted_servers\' to have at least one element.')

        return config

