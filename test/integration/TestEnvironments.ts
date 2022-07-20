import EthCrypto from 'eth-crypto'
import { SocialClient } from 'SocialClient'
import {
    DockerEnvironment,
    DockerEnvironmentBuilder
} from './containers/commons/DockerEnvironment'
import { ServiceContainer } from './containers/commons/ServiceContainer'
import { CatalystContainerBuilder } from './containers/catalyst/CatalystContainerBuilder'
import { SynapseContainerBuilder } from './containers/synapse/SynapseContainerBuilder'
import { loginWithIdentity, createUser } from '../utils/Utils'
import { SocialId } from 'types'
import { LocalStorage } from 'node-localstorage'

/**
 * Almost every test on this project will need to set up a synapse server, a catalyst server,
 * and create clients. Then, when the test is over, the servers and clients will need to be stopped.
 * In order to avoid repeating the code over and over again, we will group everything here.
 */
export class TestEnvironment {
    private dockerEnv: DockerEnvironment
    private synapseContainer: ServiceContainer
    private catalystContainer: ServiceContainer
    private clients: SocialClient[]

    async start(): Promise<void> {
        this.dockerEnv = await new DockerEnvironmentBuilder()
            .withNetwork('some-network')
            .build()
        this.catalystContainer = await new CatalystContainerBuilder()
            .withDockerEnvironment(this.dockerEnv)
            .start()
        this.synapseContainer = await new SynapseContainerBuilder()
            .withDockerEnvironment(this.dockerEnv)
            .withConfig('password_providers.0.config.trusted_servers', [
                this.catalystContainer.getInternalAddress()
            ])
            .start()
        this.clients = []
    }

    async stop(): Promise<void> {
        const stop = [this.synapseContainer, this.catalystContainer]
            .filter(container => !!container)
            .map(container => container.stop())
        await Promise.all(stop)
        await this.dockerEnv.destroy()
    }

    async clearClientList() {
        await Promise.all(
            this.clients
                .filter(client => client.isLoggedIn())
                .map(client => client.logout())
        )
        this.clients = []
    }

    async getRandomClient(): Promise<SocialClient> {
        return this.getClientWithIdentity(EthCrypto.createIdentity())
    }

    async getClientWithIdentity(identity): Promise<SocialClient> {
        const client = await loginWithIdentity(
            this.synapseContainer.getAddress(),
            identity
        )
        this.clients.push(client)
        return client
    }

    createUserOnServer(identity): Promise<SocialId> {
        return createUser(this.synapseContainer.getAddress(), identity)
    }
}

/**
 * This is an easy way to load a test environment into a test suite
 */
export function loadTestEnvironment(): TestEnvironment {
    ;(global as any).localStorage = new LocalStorage('.storage')

    const testEnv = new TestEnvironment()

    before(async () => {
        await testEnv.start()
    })

    after(async () => {
        await testEnv.stop()
    })

    afterEach(async () => {
        await testEnv.clearClientList()
    })

    return testEnv
}
