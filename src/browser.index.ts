import { type SetupMessage, Thread, ThreadPrivateStaticData } from './Thread.ts'
import { setupWorker } from './main.Thread.ts'
import { closeFactory, setupHandler } from './worker.Thread.ts'

interface BrowserSetupMessage extends SetupMessage { threadId: Thread['id'], workerData: any }

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
    Thread.close = close as any

    ThreadPrivateStaticData.createWorker = workerData => {
        setupWorkerMessage.threadId = nextThreadId++
        setupWorkerMessage.workerData = workerData
        const thread = setupWorker(setupWorkerMessage.threadId, new Worker(import.meta.url, { type: 'module' }), setupWorkerMessage)
        setupWorkerMessage.workerData = undefined

        return thread
    }
} else {
    Thread.close = globalThis.close = closeFactory(Thread.id, globalThis.close as () => never)

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