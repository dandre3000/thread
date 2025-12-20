import './compatibility.ts'
import { errorReference, type SetupMessage, Thread, ThreadPrivateStatic } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { setupHandler } from './worker.Thread.ts'

let workerThreads

try { workerThreads = await import('node:worker_threads') } catch (error) {
    throw errorReference.apiDoesNotExist('node:worker_threads')
}

if (typeof setImmediate !== 'function' && typeof setTimeout !== 'function')
    throw errorReference.apiDoesNotExist('setImmediate or setTimeout')

const { parentPort, threadId, Worker, workerData } = workerThreads

if (Thread.isMainThread) {
    Thread.id = threadId
    Thread.workerData = workerData

    const setupWorkerMessage: SetupMessage = {
        currentThreadIds: [],
        currentMessagePorts: []
    }

    ThreadPrivateStatic.createWorker = workerData => {
        const worker = new Worker(new URL(import.meta.url), { workerData })
        const thread = setupWorker(worker.threadId, worker, setupWorkerMessage)

        return thread
    }
} else {
    Thread.id = threadId
    Thread.workerData = workerData

    ;(parentPort as any).once('message', (message: SetupMessage) => {
        setupHandler(message)
    })

    const errorListener = typeof setImmediate === 'function' ? () => {
        setImmediate(() => Thread.close(1))
    } : () => {
        setTimeout(() => Thread.close(1))
    }

    process.on('uncaughtException', errorListener)
    process.on('unhandledRejection', errorListener)
}

export { Thread }