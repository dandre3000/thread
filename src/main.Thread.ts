import { type Worker as NodeJSWorker } from 'node:worker_threads'
import { isMainThread } from '@dandre3000/is-main-thread'
import {
    type MessageHandler,
    type ConnectMessage,
    messageTypeEnum,
    resolveMessage,
    type Message,
    type TerminateMessage,
    threadPrivateDataMap,
    Thread,
    privateKey,
    ThreadPrivateStaticData,
    type SetupMessage,
    type CreateMessage,
    type DisconnectMessage,
    getPrivateData,
    messageListener,
    destructThreadPrivateData,
    type ThreadPrivateInstanceData,
    type CloseMessage
} from './Thread.ts'

/** Broadcast connect message and send setup message to the Worker when creating a Thread. */
let setupWorker: (threadId: Thread['id'], worker: Worker | NodeJSWorker, setupWorkerMessage: SetupMessage) => Thread

if (isMainThread) {
    const workerMap = new Map<Thread['id'], Worker | NodeJSWorker>

    const connectMessage: ConnectMessage = {
        type: messageTypeEnum.connect,
        threadId: -1,
        messagePort: (null as unknown) as MessagePort
    }

    const disconnectMessage: DisconnectMessage = {
        type: messageTypeEnum.disconnect,
        threadId: -1,
        exitCode: -1
    }

    /** Broadcast disconnect message when closing a thread. */
    const closeThread = (threadData: ThreadPrivateInstanceData, exitCode?: number) => {
        destructThreadPrivateData(threadData)

        const { thread, messagePort } = threadData

        disconnectMessage.threadId = thread.id
        disconnectMessage.exitCode = exitCode || 0

        for (const [id, threadData] of threadPrivateDataMap) {
            threadData.messagePort.postMessage(disconnectMessage)
        }

        ;(workerMap.get(thread.id) as Worker | NodeJSWorker).terminate()
        workerMap.delete(thread.id)
    }

    setupWorker = (threadId, worker, setupWorkerMessage) => {
        const { port1, port2 } = new MessageChannel

        connectMessage.threadId = threadId
        setupWorkerMessage.currentThreadIds.push(0)
        setupWorkerMessage.currentMessagePorts.push(port2)

        for (const [id, threadData] of threadPrivateDataMap) {
            const { port1, port2 } = new MessageChannel

            connectMessage.messagePort = port1
            threadData.messagePort.postMessage(connectMessage, [port1])

            setupWorkerMessage.currentThreadIds.push(id)
            setupWorkerMessage.currentMessagePorts.push(port2)
        }

        workerMap.set(threadId, worker)
        worker.postMessage(setupWorkerMessage, setupWorkerMessage.currentMessagePorts as any)

        setupWorkerMessage.currentThreadIds.length = 0
        setupWorkerMessage.currentMessagePorts.length = 0

        const thread = new (Thread as any)(privateKey, threadId, port1)

        return thread
    }

    const createHandler: MessageHandler<CreateMessage> = (threadData, message) => {
        resolveMessage.value = ThreadPrivateStaticData.createWorker(message.workerData).id
        resolveMessage.responseId = message.responseId
        threadData.messagePort.postMessage(resolveMessage)
        resolveMessage.value = undefined
    }

    const terminateHandler: MessageHandler<TerminateMessage> = (_threadData, message) => {
        if (message.threadId === 0) Thread.close()

        const threadData = threadPrivateDataMap.get(message.threadId)

        if (threadData) {
            closeThread(threadData)
        }

        resolveMessage.responseId = message.responseId
        _threadData.messagePort.postMessage(resolveMessage)
    }

    const closeHandler: MessageHandler<CloseMessage> = (threadData, message) => {
        if (threadData.exitCode !== threadData.exitCode) {
            closeThread(threadData, message.exitCode)
        }
    }

    ThreadPrivateStaticData[messageTypeEnum.create] = createHandler as MessageHandler<Message>
    ThreadPrivateStaticData[messageTypeEnum.terminate] = terminateHandler as MessageHandler<Message>
    ThreadPrivateStaticData[messageTypeEnum.close] = closeHandler as MessageHandler<Message>

    Thread.create = workerData => new Promise(resolve => {
        resolve(ThreadPrivateStaticData.createWorker(workerData))
    })

    Thread.prototype.terminate = function () {
        ThreadPrivateStaticData.enablePrivateAccess = true
        const threadData = this[getPrivateData]()

        if (threadData?.handleEvent !== messageListener)
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        closeThread(threadData)

        return Promise.resolve(threadData.exitCode)
    }
}

export { setupWorker }