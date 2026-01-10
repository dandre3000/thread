import './compatibility.ts'
import { type SetupMessage, Thread, ThreadPrivateStatic } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { setupHandler } from './worker.Thread.ts'

let workerThreads

try { workerThreads = await import('node:worker_threads') } catch (error) {
    throw new ReferenceError('node:worker_threads is required to use @dandre3000/thread')
}

if (typeof setImmediate !== 'function' && typeof setTimeout !== 'function')
    throw new ReferenceError('setTimeout is required to use @dandre3000/thread')

const { parentPort, threadId, Worker, workerData } = workerThreads

if (Thread.isMainThread) {
    Thread.id = threadId
    Thread.workerData = workerData

    const setupWorkerMessage: SetupMessage = {
        currentThreadIds: [],
        currentMessagePorts: []
    }

    ThreadPrivateStatic.createWorker = workerData => {
        const worker = new Worker(import.meta.url, { workerData })
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