import { parentPort, threadId, Worker, workerData } from 'node:worker_threads'
import './compatibility.ts'
import { type SetupMessage, ExitEvent, OnlineEvent, Thread, ThreadPrivateStatic } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { setupHandler } from './worker.Thread.ts'
import { defineExportProperties } from './defineExportProperties.ts'

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

    defineExportProperties()
} else {
    Thread.id = threadId
    Thread.workerData = workerData

    ;(parentPort as any).once('message', (message: SetupMessage) => {
        setupHandler(message)
        defineExportProperties()
    })

    const errorListener = typeof setImmediate === 'function' ? error => {
        console.error(error)
        setImmediate(() => Thread.close(1))
    } : error => {
        console.error(error)
        setTimeout(() => Thread.close(1))
    }

    process.on('uncaughtException', errorListener)
    process.on('unhandledRejection', errorListener)
}

export { Thread, OnlineEvent, ExitEvent }