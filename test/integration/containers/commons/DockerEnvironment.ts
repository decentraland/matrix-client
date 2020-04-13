import Dockerode from 'dockerode';
import { TestContainer, StartedTestContainer } from 'testcontainers';
import { pipeline } from "stream";

/** Environment to set configuration that affects multiple containers */
export class DockerEnvironment {

    private readonly logStreaming: boolean
    private readonly network?: string

    constructor(private readonly client: Dockerode, builder: DockerEnvironmentBuilder) {
        this.network = builder.network
        this.logStreaming = builder.logStreaming
    }

    // Embed everything that's part of the environment, into the container
    incorporateContainer(container: TestContainer): void {
        // Connect to network
        if (this.network) {
            container.withNetworkMode(this.network)
        }
    }

    // Add any configuration necessary to the running container
    configureRunningContainer(startedContainer: StartedTestContainer): void {
        if (this.logStreaming) {
            this.streamLogs(startedContainer.getId())
        }
    }

    async destroy(): Promise<void> {
        if (this.network) {
            await this.client.pruneNetworks({ label: [ this.network ] })
        }
    }

    private async streamLogs(containerId: string) {
        const container = this.client.getContainer(containerId)
        const stream = await container.logs({ stdout: true, stderr: true, follow: true })
        pipeline(stream, process.stdout);
    }
}

export class DockerEnvironmentBuilder {

    logStreaming: boolean = false
    network?: string

    withNetwork(networkName: string): DockerEnvironmentBuilder {
        this.network = networkName
        return this
    }

    withLogStreaming(): DockerEnvironmentBuilder {
        this.logStreaming = true
        return this
    }

    async build(): Promise<DockerEnvironment> {
        const client = new Dockerode()

        if (this.network) {
            const existingNetworks = await client.listNetworks({ filters: { name: [this.network] } })
            if (existingNetworks.length === 0) {
                await client.createNetwork({ Name: this.network, CheckDuplicate: true})
            }
        }

        return new DockerEnvironment(client, this)
    }

}
