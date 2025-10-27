import { isMainThread } from '@dandre3000/is-main-thread'
import {
    type Message,
    type ConnectMessage,
    type MessageHandler,
    type ThreadPrivateInstanceData,
    threadPrivateDataMap,
    privateKey,
    messageTypeEnum,
    Thread,
    type MessageResponse,
    ThreadPrivateStaticData,
    abortListener,
    type DisconnectMessage,
    type SetupMessage,
    destructThreadPrivateData,
    getPrivateData,
    messageListener,
    type TerminateMessage,
    type CloseMessage,
    type CreateMessage
} from './Thread.ts'

/** Handle the initial message from the main thread to this thread. */
let setupHandler: (message: SetupMessage) => void
/** Returns a function that sends a CloseMessage to the main thread before calling gloabalThis.close or process.exit. */
let closeFactory: (threadId: Thread['id'], exit: (exitCode?: number) => never) => (exitCode?: number) => never

if (!isMainThread) {
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
        ;(Thread.mainThread as Thread)[getPrivateData]().messagePort.postMessage(closeMessage)

        return exit(exitCode)
    }

    const connectHandler: MessageHandler<ConnectMessage> = (threadData: ThreadPrivateInstanceData, message) => {
        new (Thread as any)(privateKey, message.threadId, message.messagePort)
    }

    const disconnectHandler: MessageHandler<DisconnectMessage> = (threadData, message) => {
        const disconnectThreadData = threadPrivateDataMap.get(message.threadId)

        if (disconnectThreadData) destructThreadPrivateData(disconnectThreadData, message.exitCode)
    }

    ThreadPrivateStaticData[messageTypeEnum.connect] = connectHandler as MessageHandler<Message>
    ThreadPrivateStaticData[messageTypeEnum.disconnect] = disconnectHandler as MessageHandler<Message>

    // send a CreateMessage to the main thread and await the response
    Thread.create = (workerData?: CreateMessage['workerData']) => {
        return new Promise((resolve, reject) => {
            ThreadPrivateStaticData.enablePrivateAccess = true
            const threadData = (Thread.mainThread as Thread)[getPrivateData]()

            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
                threadData: threadData,
                signal: null as any,
                resolve: (threadId: number) => {
                    resolve((threadPrivateDataMap.get(threadId) as ThreadPrivateInstanceData).thread)
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

    Thread.isMainThread = isMainThread

    Thread.prototype.terminate = function () {
        ThreadPrivateStaticData.enablePrivateAccess = true
        const threadData = this[getPrivateData]()

        if (threadData?.handleEvent !== messageListener)
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

            ThreadPrivateStaticData.enablePrivateAccess = true
            ;(Thread.mainThread as Thread)[getPrivateData]().messagePort.postMessage(terminateMessage)
        })
    }
}
console.log(isMainThread)
export { setupHandler, closeFactory }