import { parentPort, threadId, Worker, workerData } from 'node:worker_threads'
import { type SetupMessage, Thread, ThreadPrivateStaticData } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { closeFactory, setupHandler } from './worker.Thread.ts'

if (Thread.isMainThread) {
    Thread.id = threadId
    Thread.workerData = workerData
    Thread.close = process.exit

    const setupWorkerMessage: SetupMessage = {
        currentThreadIds: [],
        currentMessagePorts: []
    }

    ThreadPrivateStaticData.createWorker = workerData => {
        const worker = new Worker(new URL(import.meta.url), { workerData })
        const thread = setupWorker(worker.threadId, worker, setupWorkerMessage)

        return thread
    }
} else {
    Thread.id = threadId
    Thread.workerData = workerData
    Thread.close = process.exit = closeFactory(threadId, process.exit)
    
    ;(parentPort as any).once('message', (message: SetupMessage) => {
        setupHandler(message)
    })

    const errorListener = () => {
        setImmediate(() => Thread.close(1))
    }

    process.on('uncaughtException', errorListener)
    process.on('unhandledRejection', errorListener)
}

export { Thread }