import fs from 'fs-extra';
import yaml from 'js-yaml';
import nestedProperty from 'nested-property'
import { Wait, GenericContainer } from 'testcontainers'
import { ServiceContainerBuilder } from '../commons/ServiceContainer';

const DEFAULT_PORT = 8008

/** Container builder for Synapse Matrix servers */
export class SynapseContainerBuilder extends ServiceContainerBuilder<SynapseContainerBuilder> {

    private static MOUNT_DIR: string = process.env.SYNAPSE_MOUNT_DIR ?? __dirname + '/mount'
    private static RESOURCES_DIR: string = __dirname + '/resources'
    private config: any = yaml.safeLoad(fs.readFileSync(SynapseContainerBuilder.RESOURCES_DIR + '/default-homeserver.yaml', 'utf8'))

    constructor() {
        super('matrixdotorg/synapse')
    }

    withConfig(path: string, value: any): SynapseContainerBuilder {
        nestedProperty.set(this.config, path, value)
        return this
    }

    async specificConfiguration(container: GenericContainer) {
        // Create mount dir, or empty it if it already exists
        if (!fs.existsSync(SynapseContainerBuilder.MOUNT_DIR)) {
            fs.mkdirSync(SynapseContainerBuilder.MOUNT_DIR)
        }

        // Copy auth provider into mount dir
        fs.copyFileSync(this.providerPath(), SynapseContainerBuilder.MOUNT_DIR + '/decentraland_password_auth_provider.py')

        // Write down config file into mount dir
        const yamlFileContent = yaml.safeDump(this.config)
        fs.writeFileSync(SynapseContainerBuilder.MOUNT_DIR + '/homeserver.yaml', yamlFileContent)

        // Copy all other files from the resources folder
        fs.readdirSync(SynapseContainerBuilder.RESOURCES_DIR)
            .filter(file => !file.includes('homeserver.yaml')) // We already copied the config file
            .forEach(file => fs.copyFileSync(SynapseContainerBuilder.RESOURCES_DIR + '/' + file, SynapseContainerBuilder.MOUNT_DIR + '/' + file.replace('default-', '')))

        // Configure the container
        container
            .withExposedPorts(DEFAULT_PORT)
            .withBindMount(SynapseContainerBuilder.MOUNT_DIR, "/data", "rw")
            .withWaitStrategy(Wait.forLogMessage('SynapseSite starting'))
            .withName('synapse');
    }

    protected getExposedPort(): number | undefined {
        return DEFAULT_PORT
    }

    protected childBuilder(): SynapseContainerBuilder {
        return this
    }

    private providerPath() {
        return process.cwd() + '/providers/decentraland_password_auth_provider.py'
    }

}