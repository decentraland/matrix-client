import { StartedTestContainer, GenericContainer } from "testcontainers"
import { DockerEnvironment } from "./DockerEnvironment"


export abstract class ServiceContainerBuilder<T extends ServiceContainerBuilder<T>> {

    private version: string = 'latest'
    private env: Map<string, string> = new Map()
    private dockerEnvironment?: DockerEnvironment

    constructor(private readonly image: string) { }

    withDockerEnvironment(dockerEnvironment: DockerEnvironment): T {
        this.dockerEnvironment = dockerEnvironment
        return this.childBuilder()
    }

    withVersion(version: string): T {
        this.version = version
        return this.childBuilder()
    }

    withEnvVariable(name: string, value: string): T {
        this.env.set(name, value)
        return this.childBuilder()
    }

    async start(): Promise<ServiceContainer> {
        const container: GenericContainer = new GenericContainer(this.image, this.version);

        // Perform the custom configuration, necessary for each container
        this.specificConfiguration(container)

        // Use the default log driver
        container.withDefaultLogDriver()

        // Assign environment vars
        this.env.forEach((value, name) => container.withEnv(name, value))

        // If present, add the container to the environment
        if (this.dockerEnvironment) {
            this.dockerEnvironment.incorporateContainer(container)
        }

        // Start the container
        const startedContainer = await container.start()

        // Some configuration needs to happen after the container is created. Testcontainers doesn't expose the
        // created non started container, so we will have to deal with the container once it is started
        if (this.dockerEnvironment) {
            this.dockerEnvironment.configureRunningContainer(startedContainer)
        }

        return new ServiceContainer(startedContainer, this.getExposedPort())
    }

    /**
     * This method is used by builders that extend this class, to configure the container with their needs.
     * This method will be called before all other configuring is done.
     */
    protected abstract specificConfiguration(container: GenericContainer): void
    protected abstract childBuilder(): T;
    /**
     * Return the number of the exposed port, if any was exposed
     */
    protected getExposedPort(): number | undefined { return undefined }
}

export class ServiceContainer {

    constructor(
        private readonly container: StartedTestContainer,
        private readonly port?: number) { }

    /** Address used by containers on the same network */
    getInternalAddress(): string {
        let address = `http://${this.container.getName().replace('/', '')}`
        if (this.port) {
            address += `:${this.port}`
        }
        return address
    }

    /** Address used by clients outside the docker network */
    getAddress(): string {
        let address = `http://${this.container.getContainerIpAddress()}`
        if (this.port) {
            address += `:${this.container.getMappedPort(this.port)}`
        }
        return address
    }

    /** Stop and remove the docker container */
    stop() {
        return this.container.stop()
    }

}