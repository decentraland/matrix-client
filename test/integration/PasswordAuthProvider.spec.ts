
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import EthCrypto from 'eth-crypto'
import ms from 'ms'
import { Authenticator, AuthChain } from 'dcl-crypto'
import { SocialClient } from 'SocialClient'
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

    it(`When auth provider is disabled, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse(['password_providers.0.config.enabled', false])

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When trusted servers doesn't exist, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse(['password_providers.0.config.trusted_servers', ['http://google.com']])

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When timestamp is too old, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse()

        // Attempt to login
        const now = Date.now()
        const { ethAddress, authChain } = getLoginData(now)
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, now - ms('20s'), authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When timestamp is too far into the future, then login isn't successful`, async () => {
        // Set up and start the synapse server
        await buildSynapse()

        // Attempt to login
        const now = Date.now()
        const { ethAddress, authChain } = getLoginData(now)
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, now + ms('40s'), authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When auth chain is invalid, then login isn't successful`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Attempt to login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, timestamp, authChain.slice(1))

        await expect(loginResult).to.be.rejected
    })

    it(`When ethAddress doesn't match the auth chain signer, then login isn't successful`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Attempt to login
        const { timestamp, authChain } = getLoginData()
        const loginResult = SocialClient.loginToServer(synapseContainer.getAddress(), 'someEthAddress', timestamp, authChain)

        await expect(loginResult).to.be.rejected
    })

    it(`When a user doesn't exist, it can still login`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Login
        const { ethAddress, timestamp, authChain } = getLoginData()
        const client = await SocialClient.loginToServer(synapseContainer.getAddress(), ethAddress, timestamp, authChain)

        assertLoginWasSuccessful(ethAddress, client)

        // Logout
        await client.logout()
    })

    it(`When a user already exists, it can login many times`, async () => {
        // Set up and start the servers
        await buildSynapseAndCatalyst()

        // Build identity
        const identity = EthCrypto.createIdentity()

        // Login
        const { timestamp, authChain } = getLoginData(Date.now(), identity)
        const client = await SocialClient.loginToServer(synapseContainer.getAddress(), identity.address, timestamp, authChain)

        // Assert login was successful
        assertLoginWasSuccessful(identity.address, client)

        // Logout
        await client.logout()

        // Login again
        const { timestamp: timestamp2, authChain: authChain2 } = getLoginData(Date.now(), identity)
        const client2 = await SocialClient.loginToServer(synapseContainer.getAddress(), identity.address, timestamp2, authChain2)

        // Assert login was successful
        assertLoginWasSuccessful(identity.address, client2)

        // Logout
        await client2.logout()
    })

    function assertLoginWasSuccessful(ethAddress: string, client: SocialClient) {
        expect(client.getUserId()).to.equal(`@${ethAddress.toLowerCase()}:localhost`)
        expect(client.getDomain()).to.equal('localhost')
    }

    async function buildSynapse(config?: [string, any]) {
        const builder = new SynapseContainerBuilder()
            .withDockerEnvironment(dockerEnv)

        if (config) {
            builder.withConfig(config[0], config[1])
        }

        synapseContainer = await builder.start()
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
