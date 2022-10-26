import { MatrixClient } from 'matrix-js-sdk/lib/client'
import { TimelineWindow } from 'matrix-js-sdk/lib/timeline-window'
import { EventTimeline } from 'matrix-js-sdk/lib/models/event-timeline'
import { buildTextMessage, getOnlyMessagesTimelineSetFromRoom, waitForNextSync } from './Utils'
import {
    TextMessage,
    Timestamp,
    MessageStatus,
    CursorOptions,
    CursorDirection,
    BasicMessageInfo,
    SocialId
} from './types'

/**
 * This class can be used to navigate a conversation's history. You can load more messages
 * by moving forwards or backwards in time.
 */
export class ConversationCursor {
    private static DEFAULT_LIMIT = 30
    private static DEFAULT_INITIAL_SIZE = 20

    private constructor(
        private readonly roomId: string,
        private readonly window: TimelineWindow,
        private readonly lastReadMessageTimestampFetch: (roomId: string) => BasicMessageInfo | undefined
    ) {}

    getMessages(): TextMessage[] {
        const latestReadTimestamp: Timestamp | undefined = this.lastReadMessageTimestampFetch(this.roomId)?.timestamp

        const events = this.window.getEvents()
        return events.map(event =>
            buildTextMessage(
                event,
                latestReadTimestamp && event.getTs() <= latestReadTimestamp ? MessageStatus.READ : MessageStatus.UNREAD
            )
        )
    }

    canExtendInDirection(direction: CursorDirection): boolean {
        const newDirection = direction === CursorDirection.BACKWARDS ? EventTimeline.BACKWARDS : EventTimeline.FORWARDS
        return this.window.canPaginate(newDirection)
    }

    /**
     * Tries to extend the cursor in the provided direction, by adding 'size' events.
     * If doing so would break the cursor limit, then will remove the extra messages at the other side of the cursor.
     * Returns true if more messages were actually added to the cursor.
     */
    moveInDirection(direction: CursorDirection, size: number): Promise<boolean> {
        const newDirection = direction === CursorDirection.BACKWARDS ? EventTimeline.BACKWARDS : EventTimeline.FORWARDS
        return this.window.paginate(newDirection, size)
    }

    /**
     * Remove 'numberOfEvents' events from the cursor. If oldestMessages is true, then we will remove the
     * oldest messages. If it is false, we will remove the newest messages.
     */
    removeFromCursor(numberOfEvents: number, oldestMessages: boolean): void {
        this.window.unpaginate(numberOfEvents, oldestMessages)
    }

    // @internal
    static async build(
        client: MatrixClient,
        userId: SocialId,
        roomId: string,
        initialEventId: string | undefined, // If no eventId is set, then we will start at the last message
        lastReadMessageTimestampFetch: (roomId: string) => BasicMessageInfo | undefined,
        options?: CursorOptions
    ) {
        try {
            const limit = ConversationCursor.calculateLimit(options)
            const initialSize = options?.initialSize ?? this.DEFAULT_INITIAL_SIZE
            let room = client.getRoom(roomId)
            let retries = 0
            while (!room && retries < 3) {
                retries++
                await waitForNextSync(client)
                room = client.getRoom(roomId)
            }
            if (!room) return

            const timelineSet = getOnlyMessagesTimelineSetFromRoom(userId, room, limit)
            const window = new TimelineWindow(client, timelineSet, { windowLimit: limit })
            await window.load(initialEventId, initialSize)

            // It could happen that the initial size of the window isn't respected. That's why we will try to fix it
            let windowSize = window.getEvents().length
            let gotResults = true
            while (windowSize < initialSize && gotResults) {
                gotResults = await window.paginate(EventTimeline.BACKWARDS, initialSize - windowSize)
                windowSize = window.getEvents().length
            }

            gotResults = true
            while (windowSize < initialSize && gotResults) {
                gotResults = await window.paginate(EventTimeline.FORWARDS, initialSize - windowSize)
                windowSize = window.getEvents().length
            }

            return new ConversationCursor(roomId, window, lastReadMessageTimestampFetch)
        } catch (err) {
            return
        }
    }

    private static calculateLimit(options: CursorOptions | undefined): number {
        if (options?.limit) {
            return options.limit
        }

        if (options?.initialSize && options.initialSize > ConversationCursor.DEFAULT_LIMIT) {
            return options.initialSize
        }

        return ConversationCursor.DEFAULT_LIMIT
    }
}
