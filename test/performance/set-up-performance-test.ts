
import EthCrypto from 'eth-crypto';
import * as cliProgress from 'cli-progress';
import asyncPool from "tiny-async-pool"
import fs from 'fs-extra'
import { SocialId } from 'types'
import { createUser, loginWithIdentity } from '../utils/Utils';


async function run(serverUrl: string, amountOfUsers: number) {
    // Uncomment this to use the already existing entities
    // const identities = JSON.parse(fs.readFileSync(`${__dirname}/resources/identities.json`).toString())

    // Create random identities
    const identities = Array.apply(null, Array(amountOfUsers)).map(() => EthCrypto.createIdentity())

    // Store the identities so the tests can use them
    const content = JSON.stringify(identities)
    fs.writeFileSync(`${__dirname}/resources/identities.json`, content)

    // Create the users
    const userIds: SocialId[] = await executeWithProgressBar('Creating users', identities, async identity => {
        const userId = await createUser(serverUrl, identity)
        return userId
    }, 5)

    let indices = new Array(identities.length).fill(0)
    indices.forEach((_, idx, arr) => arr[idx] = idx)

    await executeWithProgressBar('Running for clients', indices, async (index: number) => {
        // Login
        const identity = identities[index]
        const client = await loginWithIdentity(serverUrl, identity)

        // Add friends
        for (let i = 0; i < userIds.length; i++) {
            console.log(`Adding ${i} as friend`)
            if (i !== index) {
                const userId = userIds[i]
                await client.addAsFriend(userId)
            }
        }

        // Send messages
        for (let i = 0; i < userIds.length; i++) {
            if (i !== index) {
                console.log(`Sending messages to ${i}`)
                const userId = userIds[i]
                const { id: conversationId } = await client.createDirectConversation(userId)
                const amountOfMessages = randomBetween(5, 10)
                for (let j = 0; j < amountOfMessages; j++) {
                    await client.sendMessageTo(conversationId, `Message from ${index} #${j}`)
                }
            }
        }

        // Log out
        await client.logout()
    }, 1)

}

function randomBetween(lower: number, upper: number): number {
    return Math.round(lower + Math.random() * (upper - lower))
}

async function executeWithProgressBar<T, K>(detail: string, array: Array<T>, iterator: (T) => Promise<K>, concurrency: number = 15): Promise<K[]> {
    const bar = new cliProgress.SingleBar({format: `${detail.padEnd(22, ' ')}: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}`});
    bar.start(array.length, 0);

    const result = await asyncPool(concurrency, array, async (value) => {
        const result: K = await iterator(value)
        bar.increment(1)
        return result
    });

    bar.stop()

    return result
}

const argv = process.argv.splice(2)

if (argv.length !== 2) {
    console.log('Please use the command like this:\nCATALYST_URL AMOUNT_OF_USERS')
    process.exit(1)
}

run(argv[0], parseInt(argv[1])).then(() => console.log(`Done!`))