import './compatibility.ts'
import { type SetupMessage, Thread, ThreadPrivateStatic } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { setupHandler } from './worker.Thread.ts'

interface BrowserSetupMessage extends SetupMessage { threadId: Thread['id'], workerData: any }

if (typeof Worker !== 'function' || typeof Worker.prototype !== 'object')
    throw new ReferenceError('Worker is required to use @dandre3000/thread')

if (typeof setTimeout !== 'function')
    throw new ReferenceError('setTimeout is required to use @dandre3000/thread')

if (Thread.isMainThread) {
    let nextThreadId = 1

    const setupWorkerMessage: BrowserSetupMessage = {
        threadId: -1,
        workerData: undefined,
        currentThreadIds: [],
        currentMessagePorts: []
    }

    Thread.id = 0
    Thread.workerData = null
    Thread.close = globalThis.close as () => never

    ThreadPrivateStatic.createWorker = workerData => {
        setupWorkerMessage.threadId = nextThreadId++
        setupWorkerMessage.workerData = workerData

        const thread = setupWorker(setupWorkerMessage.threadId, new Worker(new URL(import.meta.url), { type: 'module' }), setupWorkerMessage)
        setupWorkerMessage.workerData = undefined

        return thread
    }
} else {
    addEventListener('message', (event: MessageEvent<BrowserSetupMessage>) => {
        Thread.id = event.data.threadId
        Thread.workerData = event.data.workerData
    
        setupHandler(event.data)
    }, { once: true })

    const errorListener = () => {
        setTimeout(() => Thread.close(1))
    }

    addEventListener('error', errorListener)
    addEventListener('unhandledrejection', errorListener)
}

export { Thread }