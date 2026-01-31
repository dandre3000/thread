import { type Worker as NodeJSWorker } from 'node:worker_threads'
import {
    type CloseMessage,
    type ConnectMessage,
    type CreateMessage,
    type DisconnectMessage,
    type Message,
    type MessageHandler,
    type SetupMessage,
    type TerminateMessage,
    type ThreadPrivate,
    disconnectThread,
    MessageType,
    resolveMessage,
    Thread,
    ThreadIdMap,
    ThreadMap,
    ThreadPrivateStatic
} from './Thread.ts'

/** Broadcast connect message and send setup message to the Worker when creating a Thread. */
let setupWorker: (threadId: Thread['id'], worker: Worker | NodeJSWorker, setupWorkerMessage: SetupMessage) => Thread

if (Thread.isMainThread) {
    const workerMap = new Map<Thread['id'], Worker | NodeJSWorker>

    const connectMessage: ConnectMessage = {
        type: MessageType.Connect,
        threadId: -1,
        messagePort: (null as unknown) as MessagePort
    }

    const disconnectMessage: DisconnectMessage = {
        type: MessageType.Disconnect,
        threadId: -1,
        exitCode: -1
    }

    /** Broadcast disconnect message when closing a thread. */
    const closeThread = async (threadData: ThreadPrivate, exitCode?: number) => {
        const { thread, messagePort } = threadData

        disconnectMessage.threadId = thread.id
        disconnectMessage.exitCode = exitCode || 0

        for (const _ of ThreadIdMap) {
            messagePort.postMessage(disconnectMessage)
        }

        disconnectThread(threadData, exitCode)

        await (workerMap.get(thread.id) as Worker | NodeJSWorker).terminate()
        workerMap.delete(thread.id)
    }

    setupWorker = (threadId, worker, setupWorkerMessage) => {
        const { port1, port2 } = new MessageChannel

        connectMessage.threadId = threadId
        setupWorkerMessage.currentThreadIds.push(0)
        setupWorkerMessage.currentMessagePorts.push(port2)

        for (const [id, threadData] of ThreadIdMap) {
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

        ThreadPrivateStatic.privateKey = true
        const thread = new Thread(threadId, port1)

        return thread
    }

    const createHandler: MessageHandler<CreateMessage> = (threadData, message) => {
        resolveMessage.value = ThreadPrivateStatic.createWorker(message.workerData).id
        resolveMessage.responseId = message.responseId
        threadData.messagePort.postMessage(resolveMessage)
        resolveMessage.value = undefined
    }

    const terminateHandler: MessageHandler<TerminateMessage> = (_threadData, message) => {
        if (message.threadId === 0) Thread.close()

        const threadData = ThreadIdMap.get(message.threadId)

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

    ThreadPrivateStatic[MessageType.Create] = createHandler as MessageHandler<Message>
    ThreadPrivateStatic[MessageType.Terminate] = terminateHandler as MessageHandler<Message>
    ThreadPrivateStatic[MessageType.Close] = closeHandler as MessageHandler<Message>

    Thread.close = (globalThis.close || globalThis.process?.exit) as (exitCode?) => never

    Thread.create = async workerData => await ThreadPrivateStatic.createWorker(workerData)

    Thread.prototype.terminate = async function () {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance.`)

        const threadData = ThreadMap.get(this)

        if (ThreadIdMap.has(this.id)) await closeThread(threadData, 0)

        return threadData.exitCode
    }
}

export { setupWorker }