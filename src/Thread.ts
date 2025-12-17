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
    /** Thread.prototype.call */
    Call,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.call, Thread.prototype.terminate */
    Resolve,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.call, Thread.prototype.terminate */
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
interface CallMessage extends AsyncMessage { functionId: string, args: any[] }
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

/** Thread.prototype.call */
export interface CallOptions {
    args?: any[]
    transfer?: (Transferable | NodeJSTransferable)[]
    signal?: AbortSignal
}

/** Dispatched when a Thread is created. */
export class OnlineEvent extends Event {
    thread: Thread

    constructor ()
    constructor (key?: typeof privateKey, thread?: Thread) {
        if (key !== privateKey)
            throw new Error(`illegal invocation`)

        super('online')
        this.thread = thread as Thread
    }
}

/** Dispatched when a Thread is closed. */
export class ExitEvent extends Event {
    thread: Thread
    exitCode: number

    constructor ()
    constructor (key?: typeof privateKey, thread?: Thread, exitCode?: number ) {
        if (key !== privateKey)
            throw new Error(`illegal invocation`)

        super('exit')
        this.thread = thread as Thread
        this.exitCode = exitCode as number
    }
}

/** Default array */
export const emptyArray: never[] = []
/** Required to use methods that are locked to the user. */
export const privateKey = Symbol()

const importMessage: ImportMessage = {
    type: MessageType.Import,
    responseId: -1,
    moduleId: ''
}

const callMessage: CallMessage = {
    type: MessageType.Call,
    responseId: -1,
    functionId: '',
    args: []
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

const importHandler: MessageHandler<ImportMessage> = (threadData, message) => {
    const promise = import(message.moduleId)

    promise.then(() => {
        resolveMessage.responseId = message.responseId
        threadData.messagePort.postMessage(resolveMessage)
    })

    promise.catch(error => {
        rejectMessage.responseId = message.responseId
        rejectMessage.reason = error
        threadData.messagePort.postMessage(rejectMessage)
        rejectMessage.reason = undefined
    })
}

/** Call the function, fulfill the promise with its return value and transfer Thread.transfer for Thread.prototype.call. */
const callHandler: MessageHandler<CallMessage> = async (threadData, message) => {
    const { responseId, functionId, args } = message
    const fn = functionMap.get(functionId)

    if (typeof fn !== 'function') throw new TypeError(`Function ${functionId} does not exist`)

    try {
        let result = await fn(...(args || emptyArray))
        if (result instanceof Promise) result.then(value => result = value, reason => result = reason)

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

export const ThreadPrivateStaticData = {
    /** The id of the next async message that is incremented upon assignment. */
    nextResponseId: 0,
    /** Closure for the web or node.js Worker constructor that creates a Worker and return the corresponding thread instance. Implemented by the main thread. */
    createWorker: null as (workerData: any) => Thread,
    [MessageType.Create]: null as MessageHandler<CreateMessage>,
    [MessageType.Connect]: null as MessageHandler<ConnectMessage>,
    [MessageType.Import]: importHandler,
    [MessageType.Call]: callHandler,
    [MessageType.Resolve]: resolveHandler,
    [MessageType.Reject]: rejectHandler,
    [MessageType.Close]: null as MessageHandler<CloseMessage>,
    [MessageType.Terminate]: null as MessageHandler<TerminateMessage>,
    [MessageType.Disconnect]: null as MessageHandler<DisconnectMessage>
}

/** The message listener for each thread's MessagePort.  */
export const messageListener: ThreadPrivate['handleEvent'] = function (event) {
    // call the corresponding MessageHandler for the message type using the message as the argument
    (ThreadPrivateStaticData[event.data.type] as MessageHandler<Message>)(this, event.data)
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
     * Array of objects that will be transfered and emptied whenever another thread uses Thread.prototype.call
     * to call a function on this thread made available using Thread.setFunction.
     * If an object is not transferable the Promise returned by Thread.prototype.call will be rejected.
     */
    static transfer: (Transferable | NodeJSTransferable)[] = []
    /** The target for events broadcasted from other threads. */
    static eventTarget = new EventTarget
    /** The Thread instance connected to the main thread if the current thread is a worker otherwise null. */
    static mainThread: Thread | null = null

    /**
     * Return a Promise that resolves to a new Thread.
     * @param workerData Arbitrary value that is copied to the thread as Thread.workerData. If workerData is not compatible with the HTML structured clone algorithm the returned Promise will be rejected.
     */
    static create = (workerData: CreateMessage['workerData']) => {
        if (1) throw new Error('Thread.create is not implemented')

        return new Promise<Thread>(() => {})
    }

    /**
     * Return the Thread corresponding to the given threadId or return null if no online Thread exists where Thread.id === threadId.
     * @throws {TypeError} if threadId can not be converted to a number.
     */
    static getThread = (threadId: Thread['id']) => ThreadIdMap.get(threadId)?.thread || null

    /** Return an array of all online Threads. */
    static getAllThreads = () => [...ThreadIdMap.values()].map(threadData => threadData.thread)

    /**
     * Add a function to those available to other threads using Thread.prototype.call.
     * @param functionId Identifier to associate with the function.
     * @param fn The function.
     */
    static setFunction = (functionId: any, fn: (...args: any[]) => any) => {
        if (typeof fn !== 'function') throw new TypeError(`fn (${typeof fn}) is not a function`)

        functionMap.set(String(functionId), fn)
    }

    /**
     * Remove a function from those available to other threads using Thread.prototype.call.
     * @param functionId Identifier associated with the function.
     */
    static deleteFunction = (functionId: any) => functionMap.delete(String(functionId))

    /**
     * Alias for globalThis.close or process.exit.
     * @param exitCode 
     */
    static close = (exitCode?: CloseMessage['exitCode']) => {
        throw new Error('Thread.prototype.close is not implemented')
    }

    static [Symbol.hasInstance] = (thread: Thread) => ThreadMap.has(thread)

    /** Identifier for this thread. */
    id = -1

    /** Do not use. */
    constructor ()
    constructor (key?: typeof privateKey, threadId?: Thread['id'], messagePort?: MessagePort) {
        if (key !== privateKey) throw new Error('Illegal invocation')

        const threadData: ThreadPrivate = ({
            thread: this,
            exitCode: NaN,
            messagePort: messagePort as MessagePort,
            messageResponseMap: new Map,
            handleEvent: messageListener
        })

        this.id = threadId as Thread['id']

        (messagePort as MessagePort).addEventListener('message', threadData)
        ;(messagePort as MessagePort).start()

        ThreadMap.set(this, threadData)
        ThreadIdMap.set(threadId as Thread['id'], threadData)
        Thread.eventTarget.dispatchEvent(new (OnlineEvent as any)(privateKey, this))
    }

    /**
     * Returns true until the thread is closed.
     * @throws {TypeError} if this is not a Thread instance.
     * */
    isOnline () {
        if (!ThreadMap.has(this))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        return ThreadIdMap.has(this.id)
    }

    /**
     * Dynamically import an ES module to the thread and return a Promise that resolves when the module is loaded.
     * @param moduleId Determines what module to import.
     * @param signal An AbortSignal that may be used to reject the returned Promise.
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {TypeError} if the Thread is closed.
     * @throws {TypeError} if moduleId can not be converted to a number.
     */
    import (moduleId: any, signal?: AbortSignal) {
        if (!ThreadMap.has(this))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        const threadData = ThreadIdMap.get(this.id)
        if (!threadData) throw new Error(`thread ${this.id} is closed`)

        moduleId = String(moduleId)

        if (signal !== undefined && !(signal instanceof AbortSignal))
            throw new TypeError(`signal (${Object.prototype.toString.call(signal)}) is not an AbortSignal instance`)

        return new Promise((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
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
     * Call a function on the thread added using Thread.setFunction and return a Promise that resolves to the value returned by that function.
     * If no function is associated with functionId or the function throws an error then the Promise will be rejected.
     * @param functionId An identifier that maps to a function.
     * @param args: An array of arguments that will be passed to the function. If an argument is not compatible with the HTML structured clone algorithm the Promise will be rejected.
     * @param transfer: An array of objects to transfer to the thread. If an object is not transferable the Promise will be rejected.
     * @param signal: An abortSignal that may be used to reject the Promise.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {Error} if the Thread is closed.
     * @throws {TypeError} if functionId can not be converted to a string.
     * @throws {TypeError} if args is defined but not an array.
     * @throws {TypeError} if transfer is defined but not an array.
     * @throws {TypeError} if signal is defined but not an AbortSignal.
     */
    call (functionId: any, args?: any[], transfer?: (Transferable | NodeJSTransferable)[], signal?: AbortSignal) {
        if (!(this instanceof Thread))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        const threadData = ThreadIdMap.get(this.id)
        if (!threadData) throw new Error(`thread ${this.id} is closed`)

        functionId = String(functionId)

        if (args !== undefined && !(args instanceof Array))
            throw new TypeError(`args (${Object.prototype.toString.call(args)}) is not an Array`)

        if (transfer !== undefined && !(transfer instanceof Array))
            throw new TypeError(`transfer (${Object.prototype.toString.call(transfer)}) is not an Array`)

        if (signal !== undefined && !(signal instanceof AbortSignal))
            throw new TypeError(`signal (${Object.prototype.toString.call(signal)}) is not an AbortSignal`)

        return new Promise((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
                threadData: threadData,
                signal: signal || null,
                resolve,
                reject,
                handleEvent: abortListener
            }

            threadData.messageResponseMap.set(messageResponse.id, messageResponse)
            signal?.addEventListener('abort', messageResponse)

            callMessage.responseId = messageResponse.id
            callMessage.functionId = functionId
            callMessage.args = args || null

            try {
                threadData.messagePort.postMessage(callMessage, transfer || emptyArray)
            } catch (error) {
                reject(error)
                signal?.removeEventListener('abort', messageResponse)
                threadData.messageResponseMap.delete(messageResponse.id)
            }

            callMessage.functionId = ''
            callMessage.args = null as any
        })
    }

    /**
     * Close this thread.
     * @throws {TypeError} if this is not a Thread instance.
     * */
    terminate () {
        if (1) throw new Error('Thread.prototype.terminate is not implemented')

        return Promise.resolve(NaN)
    }
}

/** Thread cleanup */
export const disconnectThread = (threadData: ThreadPrivate, exitCode?: number) => {
    if (threadData.messagePort) {
        for (const [id, response] of threadData.messageResponseMap) {
            response.reject(new Error(`thread ${threadData.thread.id} closed`))
            response.signal?.removeEventListener('abort', response)
            threadData.messageResponseMap.delete(id)
        }

        threadData.exitCode = Number(exitCode)
        threadData.messagePort.close()
        threadData.messagePort = undefined as any
        threadData.messageResponseMap = undefined as any

        ThreadIdMap.delete(threadData.thread.id)
        Thread.eventTarget.dispatchEvent(new (ExitEvent as any)(privateKey, threadData.thread, threadData.exitCode))
    }
}