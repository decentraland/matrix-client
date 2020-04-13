import { Wait, GenericContainer } from 'testcontainers'
import { ServiceContainerBuilder } from '../commons/ServiceContainer'

const DEFAULT_PORT = 7070

/** Container builder for Catalyst servers */
export class CatalystContainerBuilder extends ServiceContainerBuilder<CatalystContainerBuilder> {

    constructor() {
        super('decentraland/katalyst')
    }

    protected specificConfiguration(container: GenericContainer): void {
        this.withEnvVariable('SERVER_PORT', DEFAULT_PORT.toString())
            .withEnvVariable('CONTENT_SERVER_ADDRESS', 'http://content') // This isn't being used for now

        // Configure the container
        container
            .withExposedPorts(DEFAULT_PORT)
            .withWaitStrategy(Wait.forLogMessage('Lambdas Server listening'))
            .withName('catalyst')
            .withCmd(['lambdas']) // We only want to use lambdas for now
    }

    protected getExposedPort(): number | undefined {
        return DEFAULT_PORT
    }

    protected childBuilder(): CatalystContainerBuilder {
        return this
    }

}