import {
    type Message,
    type ConnectMessage,
    type MessageHandler,
    type ThreadPrivate,
    ThreadIdMap,
    privateKey,
    messageTypeEnum,
    Thread,
    type MessageResponse,
    ThreadPrivateStaticData,
    abortListener,
    type DisconnectMessage,
    type SetupMessage,
    destructThreadPrivateData,
    type TerminateMessage,
    type CloseMessage,
    type CreateMessage,
    ThreadMap
} from './Thread.ts'

/** Handle the initial message from the main thread to this thread. */
let setupHandler: (message: SetupMessage) => void
/** Returns a function that sends a CloseMessage to the main thread before calling gloabalThis.close or process.exit. */
let closeFactory: (threadId: Thread['id'], exit: (exitCode?: number) => never) => (exitCode?: number) => never

if (!Thread.isMainThread) {
    const createMessage: CreateMessage = {
        type: messageTypeEnum.create,
        responseId: -1,
        workerData: undefined
    }

    const terminateMessage: TerminateMessage = {
        type: messageTypeEnum.terminate,
        responseId: -1,
        threadId: -1,
    }

    const closeMessage: CloseMessage = {
        type: messageTypeEnum.close,
        exitCode: NaN
    }

    setupHandler = (message) => {
        for (let i = 0; i < message.currentThreadIds.length; i++) {
            const thread = new (Thread as any)(privateKey, message.currentThreadIds[i], message.currentMessagePorts[i])

            if (message.currentThreadIds[i] === 0) Thread.mainThread = thread
        }
    }

    closeFactory = (threadId, exit) => (exitCode) => {
        closeMessage.exitCode = Number(exitCode)

        ThreadIdMap.get(0).messagePort.postMessage(closeMessage)

        return exit(exitCode)
    }

    const connectHandler: MessageHandler<ConnectMessage> = (threadData: ThreadPrivate, message) => {
        new (Thread as any)(privateKey, message.threadId, message.messagePort)
    }

    const disconnectHandler: MessageHandler<DisconnectMessage> = (threadData, message) => {
        const disconnectThreadData = ThreadIdMap.get(message.threadId)

        if (disconnectThreadData) destructThreadPrivateData(disconnectThreadData, message.exitCode)
    }

    ThreadPrivateStaticData[messageTypeEnum.connect] = connectHandler as MessageHandler<Message>
    ThreadPrivateStaticData[messageTypeEnum.disconnect] = disconnectHandler as MessageHandler<Message>

    // send a CreateMessage to the main thread and await the response
    Thread.create = (workerData?: CreateMessage['workerData']) => {
        return new Promise((resolve, reject) => {
            const threadData = ThreadIdMap.get(0)

            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
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
        const threadData = ThreadMap.get(this)
        if (!threadData)
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        if (threadData.exitCode === threadData.exitCode) return Promise.resolve(threadData.exitCode)

        return new Promise((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
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

export { setupHandler, closeFactory }