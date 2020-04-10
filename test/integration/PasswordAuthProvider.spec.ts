
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import EthCrypto from 'eth-crypto'
import ms from 'ms'
import { Authenticator, AuthChain } from 'dcl-crypto'
import { Client } from 'Client'
import { SynapseContainerBuilder } from './containers/synapse/SynapseContainerBuilder'
import { DockerEnvironment, DockerEnvironmentBuilder } from './containers/commons/DockerEnvironment'
import { ServiceContainer } from './containers/commons/ServiceContainer'
import { CatalystContainerBuilder } from './containers/catalyst/CatalystContainerBuilder'

chai.use(chaiAsPromised)
const expect = chai.expect

describe('Integration - Client login/logout & password auth provider', () => {

    let dockerEnv: DockerEnvironment
    let synapseContainer: ServiceContainer
    let catalystContainer: ServiceContainer
    let client: Client

    beforeEach(async () => {
        dockerEnv = await new DockerEnvironmentBuilder()
            .withNetwork('some-network')
            // .withLogStreaming() Uncomment to see logs
            .build()
    })

    afterEach(async () => {
        const stop = [synapseContainer, catalystContainer]
            .filter(container => !!container)
            .map(container => container.stop())
        await Promise.all(stop)
        if (dockerEnv) {
            await dockerEnv.destroy()
        }
    })

    it.only(`When auth provider is disabled, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse(['password_providers.0.config.enabled', false])

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = client.login(ethAddress, timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When trusted servers doesn't exist, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse(['password_providers.0.config.trusted_servers', ['http://google.com']])

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = client.login(ethAddress, timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When timestamp is too old, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse()

        // Attempt to login
        const now = Date.now()
        const { ethAddress, authChain } = getLoginData(now)
        const loginResult = client.login(ethAddress, now - ms('20s'), authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When timestamp is too far into the future, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse()

        // Attempt to login
        const now = Date.now()
        const { ethAddress, authChain } = getLoginData(now)
        const loginResult = client.login(ethAddress, now + ms('40s'), authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When auth chain is invalid, then login isn't successful`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = client.login(ethAddress, timestamp, authChain.slice(1))

        await expect(loginResult).to.be.rejected
    })

    it(`When ethAddress doesn't math the auth chain signer, then login isn't successful`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Attempt to login
        const { timestamp, authChain } = getLoginData()
        const loginResult = client.login('someEthAddress', timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When a user doesn't exist, it can still login`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const result = await client.login(ethAddress, timestamp, authChain)

        assertLoginResultIsValid(ethAddress, result)
    })

    it(`When a user already existed exist, it can login many times`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Build identity
        const identity = EthCrypto.createIdentity()

        // Login
        const { timestamp, authChain } = getLoginData(Date.now(), identity)
        const result = await client.login(identity.address, timestamp, authChain)

        // Assert login was successful
        assertLoginResultIsValid(identity.address, result)

        // Logout
        await client.logout()

        // Login again
        const { timestamp: timestamp2, authChain: authChain2 } = getLoginData(Date.now(), identity)
        const result2 = await client.login(identity.address, timestamp2, authChain2)

        // Assert login was successful
        assertLoginResultIsValid(identity.address, result2)

        // Make sure the logins were treated as different
        expect(result.access_token).to.not.equal(result2.access_token)
    })

    function assertLoginResultIsValid(ethAddress: string, { user_id, access_token, home_server }) {
        expect(user_id).to.equal(`@${ethAddress.toLowerCase()}:localhost`)
        expect(home_server).to.equal('localhost')
        expect(access_token).to.not.be.undefined
    }

    async function buildSynapse(config?: [string, any]) {
        const builder = new SynapseContainerBuilder()
            .withDockerEnvironment(dockerEnv)

        if (config) {
            builder.withConfig(config[0], config[1])
        }

        synapseContainer = await builder.start()
        client = new Client(synapseContainer.getAddress())
    }

    async function buildSynapseAndCatalyst() {
        catalystContainer = await new CatalystContainerBuilder()
            .withDockerEnvironment(dockerEnv)
            .withVersion('a7bc7a8eef9e42c0f3a2cc1dcf0101d71d780f55') // We can remove this line when this commit is included in 'latest'
            .start()

        await buildSynapse(['password_providers.0.config.trusted_servers', [catalystContainer.getInternalAddress()]])
    }

    function getLoginData(timestamp: number = Date.now(), identity = EthCrypto.createIdentity()): { ethAddress: string, timestamp: number, authChain: AuthChain } {
        const messageToSign = `${timestamp}`
        const signature = Authenticator.createSignature(identity, messageToSign)
        const authChain = Authenticator.createSimpleAuthChain(messageToSign, identity.address, signature)
        return { ethAddress: identity.address, timestamp: timestamp, authChain }
    }

})