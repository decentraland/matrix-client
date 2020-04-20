import Matrix from "matrix-js-sdk";
import { findEventInRoom, buildTextMessage, getOnlyMessagesTimelineSetFromRoom } from "./Utils";
import { TextMessage, Timestamp, MessageStatus, CursorOptions, CursorDirection } from "./types";

/**
 * This class can be used to navigate a conversation's history. You can load more messages
 * my moving forwards or backwards in time.
 */
export class ConversationCursor {

    private static DEFAULT_LIMIT = 30
    private static DEFAULT_INITIAL_SIZE = 20

    private constructor(
        private readonly client: Matrix.MatrixClient,
        private readonly roomId: string,
        private readonly window: Matrix.TimelineWindow) { }

    async getMessages(): Promise<TextMessage[]> {
        const latestReadTimestamp: Timestamp | undefined = await this.getLatestReadTimestamp()

        return this.window.getEvents()
            .map(event => buildTextMessage(event, this.wasMessageRead(event, latestReadTimestamp) ? MessageStatus.READ : MessageStatus.UNREAD))
    }

    canExtendInDirection(direction: CursorDirection): boolean {
        const newDirection = direction === CursorDirection.BACKWARDS ? Matrix.EventTimeline.BACKWARDS : Matrix.EventTimeline.FORWARDS;
        return this.window.canPaginate(newDirection)
    }

    /**
     * Tries to extend the cursor in the provided direction, by adding 'size' events.
     * If doing so would break the cursor limit, then will remove the extra messages at the other side of the cursor.
     * Returns true if more messages were actually added to the cursor.
     */
    moveInDirection(direction: CursorDirection, size: number): Promise<boolean> {
        const newDirection = direction === CursorDirection.BACKWARDS ? Matrix.EventTimeline.BACKWARDS : Matrix.EventTimeline.FORWARDS;
        return this.window.paginate(newDirection, size)
    }

    /**
     * Remove 'numberOfEvents' events from the cursor. If oldestMessages is true, then we will remove the
     * oldest messages. If it is false, we will remove the newest messages.
     */
    removeFromCursor(numberOfEvents: number, oldestMessages: boolean): void {
        this.window.unpaginate(numberOfEvents, oldestMessages)
    }

    private wasMessageRead(event: Matrix.MatrixEvent, latestReadTimestamp: Timestamp | undefined) {
        return event.getSender() === this.client.getUserId() || // If I sent the message, then I read it
            (latestReadTimestamp && event.getTs() <= latestReadTimestamp)
    }

    private async getLatestReadTimestamp(): Promise<Timestamp | undefined> {
        const room = this.client.getRoom(this.roomId)
        const latestReadEventId: string | null = room.getEventReadUpTo(this.client.getUserId(), false)
        const latestReadEvent: Matrix.Event | undefined = latestReadEventId ? await findEventInRoom(this.client, this.roomId, latestReadEventId) : undefined
        return latestReadEvent?.getTs()
    }

    static async build(client: Matrix.MatrixClient,
        roomId: string,
        initialEventId: string | undefined | null, // If no eventId is set, then we will start at the last message
        options?: CursorOptions) {
            const limit = ConversationCursor.calculateLimit(options)
            const initialSize = options?.initialSize ?? this.DEFAULT_INITIAL_SIZE
            const room = client.getRoom(roomId)
            const timelineSet = getOnlyMessagesTimelineSetFromRoom(client, room)
            const window = new Matrix.TimelineWindow(client, timelineSet, { windowLimit: limit })
            await window.load(initialEventId, initialSize)

            // It could happen that the initial size of the window isn't respected. That's why we will try to fix it
            let windowSize = window.getEvents().length
            if (windowSize < initialSize) {
                await window.paginate(Matrix.EventTimeline.BACKWARDS, initialSize - windowSize)
            }

            windowSize = window.getEvents().length
            if (windowSize < initialSize) {
                await window.paginate(Matrix.EventTimeline.FORWARDS, initialSize - windowSize)
            }

            return new ConversationCursor(client, roomId, window)
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