import {
    type CloseMessage,
    type ConnectMessage,
    type CreateMessage,
    type DisconnectMessage,
    type Message,
    type MessageHandler,
    type MessageResponse,
    type SetupMessage,
    type TerminateMessage,
    type ThreadPrivate,
    abortListener,
    disconnectThread,
    MessageType,
    Thread,
    ThreadIdMap,
    ThreadMap,
    ThreadPrivateStatic
} from './Thread.ts'

/** Handle the initial message from the main thread to this thread. */
let setupHandler: (message: SetupMessage) => void

if (!Thread.isMainThread) {
    const createMessage: CreateMessage = {
        type: MessageType.Create,
        responseId: -1,
        workerData: undefined
    }

    const terminateMessage: TerminateMessage = {
        type: MessageType.Terminate,
        responseId: -1,
        threadId: -1,
    }

    const closeMessage: CloseMessage = {
        type: MessageType.Close,
        exitCode: NaN
    }

    setupHandler = (message) => {
        for (let i = 0; i < message.currentThreadIds.length; i++) {
            ThreadPrivateStatic.privateKey = true
            const thread = new Thread(message.currentThreadIds[i], message.currentMessagePorts[i])

            if (message.currentThreadIds[i] === 0) Thread.mainThread = thread
        }
    }

    const connectHandler: MessageHandler<ConnectMessage> = (_, message) => {
        ThreadPrivateStatic.privateKey = true
        new Thread(message.threadId, message.messagePort)
    }

    const disconnectHandler: MessageHandler<DisconnectMessage> = (_, message) => {
        const disconnectThreadData = ThreadIdMap.get(message.threadId)

        if (disconnectThreadData) disconnectThread(disconnectThreadData, message.exitCode)
    }

    ThreadPrivateStatic[MessageType.Connect] = connectHandler as MessageHandler<Message>
    ThreadPrivateStatic[MessageType.Disconnect] = disconnectHandler as MessageHandler<Message>

    if (process?.exit && typeof process.exit === 'function') {
        const ogExit = process.exit

        process.exit = exitCode => {
            closeMessage.exitCode = Number(exitCode)

            ThreadIdMap.get(0).messagePort.postMessage(closeMessage)

            return ogExit(exitCode)
        }

        Thread.close = exitCode => {
            closeMessage.exitCode = Number(exitCode)

            ThreadIdMap.get(0).messagePort.postMessage(closeMessage)

            return ogExit(exitCode)
        }
    }

    if (globalThis.close && typeof globalThis.close === 'function') {
        const ogClose = globalThis.close

        globalThis.close = () => {
            closeMessage.exitCode = 0

            ThreadIdMap.get(0).messagePort.postMessage(closeMessage)

            return ogClose()
        }

        if (!process.exit) Thread.close = (() => {
            closeMessage.exitCode = 0

            ThreadIdMap.get(0).messagePort.postMessage(closeMessage)

            return close()
        }) as (exitCode?) => never
    }

    // send a CreateMessage to the main thread and await the response
    Thread.create = (workerData?: CreateMessage['workerData']) => {
        return new Promise((resolve, reject) => {
            const threadData = ThreadIdMap.get(0)

            const messageResponse: MessageResponse = {
                id: ThreadPrivateStatic.nextResponseId++,
                threadData: threadData,
                signal: null as any,
                resolve: (threadId: number) => {
                    resolve((ThreadIdMap.get(threadId) as ThreadPrivate).thread)
                },
                reject,
                handleEvent: abortListener
            }
            threadData.messageResponseMap.set(messageResponse.id, messageResponse)

            createMessage.responseId = messageResponse.id
            createMessage.workerData = workerData
            threadData.messagePort.postMessage(createMessage)
            createMessage.workerData = undefined
        })
    }

    Thread.prototype.terminate = function () {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance.`)

        const threadData = ThreadMap.get(this)

        if (threadData.exitCode === threadData.exitCode) return Promise.resolve(threadData.exitCode)

        return new Promise((_, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStatic.nextResponseId++,
                threadData: threadData,
                signal: null as any,
                resolve: () => threadData.exitCode,
                reject,
                handleEvent: abortListener
            }

            terminateMessage.responseId = messageResponse.id
            terminateMessage.threadId = this.id

            ThreadIdMap.get(0).messagePort.postMessage(terminateMessage)
        })
    }
}

export { setupHandler }