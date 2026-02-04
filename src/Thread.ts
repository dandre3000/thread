import { type Transferable as NodeJSTransferable } from 'node:worker_threads'
import { isMainThread } from '@dandre3000/is-main-thread'

export type MessageId = number

export enum MessageType {
    /** Thread.prototype.create from worker thread to main thread */
    Create,
    /** Thread.prototype.create from main thread */
    Connect,
    /** Thread.prototype.import */
    Import,
    /** Thread.prototype.invoke */
    Invoke,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.invoke, Thread.prototype.terminate */
    Resolve,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.invoke, Thread.prototype.terminate */
    Reject,
    /** globalThis.close, process.exit, Thread.close */
    Close,
    /** Thread.prototype.terminate */
    Terminate,
    /** globalThis.close, process.exit, Thread.close, Thread.prototype.terminate */
    Disconnect
}

export interface Message { type: MessageType }
export interface AsyncMessage extends Message { responseId: MessageId }
export interface CreateMessage extends AsyncMessage { workerData: any }
export interface ConnectMessage extends Message { threadId: Thread['id'], messagePort: MessagePort }
interface ImportMessage extends AsyncMessage { moduleId: string }
interface InvokeMessage extends AsyncMessage { functionId: string, args: any[] }
interface ResolveMessage extends AsyncMessage { value: any }
interface RejectMessage extends AsyncMessage { reason: any }
export interface CloseMessage extends Message { exitCode: number }
export interface TerminateMessage extends AsyncMessage { threadId: Thread['id'] }
export interface DisconnectMessage extends CloseMessage { threadId: Thread['id'] }

export type MessageHandler<T extends Message> = (threadData: ThreadPrivate, message: T) => void

export interface SetupMessage {
    currentThreadIds: Thread['id'][]
    currentMessagePorts: MessagePort[]
}

export interface MessageResponse extends EventListenerObject {
    id: MessageId
    threadData: ThreadPrivate
    signal: AbortSignal
    resolve (value: any): void
    reject (reason: any): void
}

export interface ThreadPrivate extends EventListenerObject {
    thread: Thread
    exitCode: number
    messagePort: MessagePort
    messageResponseMap: Map<MessageId, MessageResponse>
    handleEvent (this: ThreadPrivate, event: MessageEvent<Message>): void
}

/** Default array */
export const emptyArray: never[] = []

/** Dispatched when a Thread is created. */
class OnlineEvent extends Event {
    thread: Thread

    constructor (thread?: Thread) {
        if (!ThreadPrivateStatic.privateKey) throw new Error('Illegal constructor.')
        ThreadPrivateStatic.privateKey = false

        super('online')

        Object.defineProperty(this, 'thread', {
            configurable: false,
            writable: false,
            enumerable: true,
            value: thread
        })
    }
}

/** Dispatched when a Thread is closed. */
class ExitEvent extends Event {
    thread: Thread
    exitCode: number

    constructor (thread?: Thread, exitCode?: number ) {
        if (!ThreadPrivateStatic.privateKey) throw new Error('Illegal constructor.')
        ThreadPrivateStatic.privateKey = false

        super('exit')

        Object.defineProperty(this, 'thread', {
            configurable: false,
            writable: false,
            enumerable: true,
            value: thread
        })

        Object.defineProperty(this, 'exitCode', {
            configurable: false,
            writable: false,
            enumerable: true,
            value: exitCode
        })
    }
}

const importMessage: ImportMessage = {
    type: MessageType.Import,
    responseId: -1,
    moduleId: ''
}

const invokeMessage: InvokeMessage = {
    type: MessageType.Invoke,
    responseId: -1,
    functionId: '',
    args: null
}

export const resolveMessage: ResolveMessage = {
    type: MessageType.Resolve,
    responseId: -1,
    value: undefined
}

const rejectMessage: RejectMessage = {
    type: MessageType.Reject,
    responseId: -1,
    reason: undefined
}

/** Import the module and fulfill the promise for Thread.prototype.import. */
const importHandler: MessageHandler<ImportMessage> = (threadData, message) => {
    const promise = import(message.moduleId)

    promise.then(() => {
        resolveMessage.responseId = message.responseId
        threadData.messagePort.postMessage(resolveMessage)
    })

    promise.catch(error => {
        rejectMessage.responseId = message.responseId

        try {
            rejectMessage.reason = error
            threadData.messagePort.postMessage(rejectMessage)
        } catch (error) {
            rejectMessage.reason = error
            threadData.messagePort.postMessage(rejectMessage)
        }

        rejectMessage.reason = undefined
    })
}

/** Call the function, fulfill the promise with its return value and transfer Thread.transfer for Thread.prototype.invoke. */
const invokeHandler: MessageHandler<InvokeMessage> = async (threadData, message) => {
    const { responseId, functionId, args } = message
    const fn = functionMap.get(functionId)

    try {
        if (typeof fn !== 'function') { throw new Error(`Function ${functionId} does not exist`) }

        let result = await fn(...(args || emptyArray))
        if (result instanceof Promise) result = await result

        resolveMessage.responseId = responseId
        resolveMessage.value = result

        threadData.messagePort.postMessage(resolveMessage, Thread.transfer)
    } catch (error) {
        rejectMessage.responseId = responseId

        try {
            rejectMessage.reason = error
            threadData.messagePort.postMessage(rejectMessage)
        } catch (error) {
            rejectMessage.reason = error
            threadData.messagePort.postMessage(rejectMessage)
        }

        rejectMessage.reason = undefined
    }

    resolveMessage.value = undefined
    Thread.transfer.length = 0
}

const resolveHandler: MessageHandler<ResolveMessage> = (threadData, message) => {
    const messageResponse = threadData.messageResponseMap.get(message.responseId)

    if (messageResponse) {
        messageResponse.resolve(message.value)
        messageResponse.signal?.removeEventListener('abort', messageResponse)
        threadData.messageResponseMap.delete(message.responseId)
    }
}

const rejectHandler: MessageHandler<RejectMessage> = (threadData, message) => {
    const messageResponse = threadData.messageResponseMap.get(message.responseId)

    if (messageResponse) {
        messageResponse.reject(message.reason)
        messageResponse.signal?.removeEventListener('abort', messageResponse)
        threadData.messageResponseMap.delete(message.responseId)
    }
}

/** Variables that will be passed by reference. */
export const ThreadPrivateStatic = {
    /** Required to use methods that are locked to the user. */
    privateKey: false,
    /** The id of the next async message that is incremented upon assignment. */
    nextResponseId: 0,
    /** Closure for the web or node.js Worker constructor that creates a Worker and return the corresponding thread instance. Implemented by the main thread. */
    createWorker: null as (workerData: any) => Thread,
    [MessageType.Create]: null as MessageHandler<CreateMessage>,
    [MessageType.Connect]: null as MessageHandler<ConnectMessage>,
    [MessageType.Import]: importHandler,
    [MessageType.Invoke]: invokeHandler,
    [MessageType.Resolve]: resolveHandler,
    [MessageType.Reject]: rejectHandler,
    [MessageType.Close]: null as MessageHandler<CloseMessage>,
    [MessageType.Terminate]: null as MessageHandler<TerminateMessage>,
    [MessageType.Disconnect]: null as MessageHandler<DisconnectMessage>
}

/** The message listener for each thread's MessagePort.  */
export const messageListener: ThreadPrivate['handleEvent'] = function (event) {
    // invoke the corresponding MessageHandler for the message type using the message as the argument
    (ThreadPrivateStatic[event.data.type] as MessageHandler<Message>)(this, event.data)
}

/** The abort listener for AbortSignal arguments in Thread methods. */
export const abortListener = function (this: MessageResponse) {
    this.reject(this.signal.reason)
    this.signal.removeEventListener('abort', this)
    this.threadData.messageResponseMap.delete(this.id)
}

export const ThreadMap = new WeakMap<Thread, ThreadPrivate>
export const ThreadIdMap = new Map<Thread['id'], ThreadPrivate>
const functionMap = new Map<string, (...args: any[]) => any>

/** Class for managing web and node.js Workers. */
export class Thread {
    /** True if the current thread is the main thread. */
    static isMainThread = isMainThread
    /** Identifier for the current thread. */
    static id: Thread['id'] = NaN
    /** Data copied to the current thread from the corresponding Thread.create workerData argument. */
    static workerData: any
    /**
     * Array of objects that will be transfered and emptied whenever another thread uses Thread.prototype.invoke
     * to invoke a function on this thread made available using Thread.expose.
     * If an object is not transferable the Promise returned by Thread.prototype.invoke will be rejected.
     */
    static transfer: (Transferable | NodeJSTransferable)[] = [] // replace with method for transferable check
    /** The target for events broadcasted from other threads. */
    static eventTarget = new EventTarget
    /** The Thread instance connected to the main thread if the current thread is a worker otherwise null. */
    static mainThread: Thread | null = null

    /**
     * Return a Promise that resolves to a new Thread.
     *
     * @param workerData Arbitrary value that is copied to the thread as Thread.workerData.
     *
     * @throws {DOMException} if workerData is not compatible with the structuredClone function.
     */
    static create = (workerData: any) => {
        if (true) throw new Error('Thread.create is not implemented.')

        return new Promise<Thread>(() => {})
    }

    /**
     * Return the Thread corresponding to the given threadId or return null if no online Thread exists where Thread.id === threadId.
     *
     * @throws {TypeError} if threadId can not be converted to a number.
     */
    static getThread = (threadId: any) => ThreadIdMap.get(threadId)?.thread || null

    /** Return an array of all online Threads. */
    static getAllThreads = () => [...ThreadIdMap.values()].map(threadData => threadData.thread)

    /**
     * Add a function to those available to other threads when using Thread.prototype.invoke.
     *
     * @param functionId Identifier to associate with the function.
     * @param fn The function.
     *
     * @throws {TypeError} if fn is not a function.
     */
    static expose = (id: any, fn: (...args: any[]) => any) => {
        id = String(id)

        if (typeof fn !== 'function') throw new TypeError(`fn (${typeof fn}) is not a function.`)

        functionMap.set(id, fn)
    }

    /**
     * Remove a function from those available to other threads when using Thread.prototype.invoke.
     *
     * @param id Identifier associated with the function.
     */
    static unexpose = (id: any) => functionMap.delete(String(id))

    /**
     * Alias for globalThis.close or process.exit.
     * @param exitCode 
     */
    static close = (exitCode?: CloseMessage['exitCode']) => {
        throw new Error('Thread.close is not implemented.')
    }

    static [Symbol.hasInstance] = (thread: Thread) => ThreadMap.has(thread)

    /** Identifier for this thread. */
    id = -1

    /** Do not use. */
    constructor (threadId?: Thread['id'], messagePort?: MessagePort) {
        if (!ThreadPrivateStatic.privateKey) throw new Error('Illegal constructor.')
        ThreadPrivateStatic.privateKey = false

        const threadData: ThreadPrivate = ({
            thread: this,
            exitCode: NaN,
            messagePort: messagePort as MessagePort,
            messageResponseMap: new Map,
            handleEvent: messageListener
        })

        Object.defineProperty(this, 'id', {
            configurable: false,
            writable: false,
            enumerable: true,
            value: threadId
        })

        ;(messagePort as MessagePort).addEventListener('message', threadData)
        ;(messagePort as MessagePort).start()

        ThreadMap.set(this, threadData)
        ThreadIdMap.set(threadId as Thread['id'], threadData)

        ThreadPrivateStatic.privateKey = true
        Thread.eventTarget.dispatchEvent(new OnlineEvent(this))
    }

    /**
     * Returns true until the thread is closed.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * */
    isOnline () {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance.`)

        return ThreadIdMap.has(this.id)
    }

    /**
     * Dynamically import an ES module to the thread and return a Promise that resolves when the module is loaded.
     *
     * @param moduleId Determines what module to import.
     * @param signal An AbortSignal that may be used to reject the returned Promise.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {Error} if the Thread is closed.
     * @throws {TypeError} if moduleId can not be converted to a number.
     */
    import (moduleId: any, signal?: AbortSignal) {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance.`)

        const threadData = ThreadIdMap.get(this.id)
        if (!threadData) throw new Error(`Thread ${this.id} is closed`)

        moduleId = String(moduleId)

        if (signal !== undefined && !(signal instanceof AbortSignal))
            throw new TypeError(`signal (${Object.prototype.toString.call(signal)}) is not an AbortSignal instance.`)

        return new Promise<undefined>((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStatic.nextResponseId++,
                threadData: threadData,
                signal: signal as AbortSignal,
                resolve,
                reject,
                handleEvent: abortListener
            }

            threadData.messageResponseMap.set(messageResponse.id, messageResponse)
            signal?.addEventListener('abort', messageResponse)

            importMessage.responseId = messageResponse.id
            importMessage.moduleId = moduleId
            threadData.messagePort.postMessage(importMessage)
            importMessage.moduleId = ''
        })
    }

    /**
     * Call a function on the thread added using Thread.expose and return a Promise that resolves to the value returned by that function.
     * If no function is associated with id or the function throws an error then the Promise will be rejected.
     *
     * @param id An identifier that maps to a function.
     * @param args: An array of arguments that will be passed to the function. If an argument is not compatible with the HTML structured clone algorithm the Promise will be rejected.
     * @param transfer: An array of objects to transfer to the thread. If an object is not transferable the Promise will be rejected.
     * @param signal: An abortSignal that may be used to reject the Promise.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {Error} if the Thread is closed.
     * @throws {TypeError} if args is defined but not an array.
     * @throws {TypeError} if transfer is defined but not an array.
     * @throws {TypeError} if signal is defined but not an AbortSignal.
     */
    invoke (id: any, args?: any[], transfer?: (Transferable | NodeJSTransferable)[], signal?: AbortSignal) {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance.`)

        const threadData = ThreadIdMap.get(this.id)
        if (!threadData) throw new Error(`Thread ${this.id} is closed`)

        id = String(id)

        if (args !== undefined && !(args instanceof Array))
            throw new TypeError(`args (${Object.prototype.toString.call(args)}) is not an Array instance.`)

        if (transfer !== undefined && !(transfer instanceof Array))
            throw new TypeError(`transfer (${Object.prototype.toString.call(transfer)}) is not an Array instance.`)

        if (signal !== undefined && !(signal instanceof AbortSignal))
            throw new TypeError(`signal (${Object.prototype.toString.call(signal)}) is not an AbortSignal instance.`)

        return new Promise((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStatic.nextResponseId++,
                threadData: threadData,
                signal: signal || null,
                resolve,
                reject,
                handleEvent: abortListener
            }

            threadData.messageResponseMap.set(messageResponse.id, messageResponse)
            signal?.addEventListener('abort', messageResponse)

            invokeMessage.responseId = messageResponse.id
            invokeMessage.functionId = id
            invokeMessage.args = args || null

            try {
                threadData.messagePort.postMessage(invokeMessage, transfer || emptyArray)
            } catch (error) {
                reject(error)
                signal?.removeEventListener('abort', messageResponse)
                threadData.messageResponseMap.delete(messageResponse.id)
            }

            invokeMessage.functionId = ''
            invokeMessage.args = null as any
        })
    }

    /**
     * Close this thread.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * */
    terminate () {
        if (true) throw new Error('Thread.prototype.terminate is not implemented.')

        return Promise.resolve(NaN)
    }
}

/** Thread cleanup */
export const disconnectThread = (threadData: ThreadPrivate, exitCode?: number) => {
    if (threadData.messagePort) {
        // reject all promises associated with the thread
        for (const [id, response] of threadData.messageResponseMap) {
            response.reject(new Error(`Thread ${threadData.thread.id} is closed`))
            response.signal?.removeEventListener('abort', response)
            threadData.messageResponseMap.delete(id)
        }

        threadData.exitCode = Number(exitCode)
        threadData.messagePort.close()
        threadData.messagePort = undefined as any
        threadData.messageResponseMap = undefined as any

        ThreadIdMap.delete(threadData.thread.id)

        ThreadPrivateStatic.privateKey = true
        Thread.eventTarget.dispatchEvent(new ExitEvent(threadData.thread, threadData.exitCode))
    }
}