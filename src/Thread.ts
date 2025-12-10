import { type Transferable as NodeJSTransferable } from 'node:worker_threads'
import { isMainThread } from '@dandre3000/is-main-thread'

export type MessageId = number

export interface MessageResponse extends EventListenerObject {
    id: MessageId
    threadData: ThreadPrivateInstanceData
    signal: AbortSignal
    resolve (value: any): void
    reject (reason: any): void
}

export interface SetupMessage {
    currentThreadIds: Thread['id'][]
    currentMessagePorts: MessagePort[]
}
export type MessageType = number
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

export type MessageHandler<T extends Message> = (threadData: ThreadPrivateInstanceData, message: T) => void

export interface ThreadPrivateInstanceData extends EventListenerObject {
    thread: Thread
    exitCode: number
    messagePort: MessagePort
    messageResponseMap: Map<MessageId, MessageResponse>
    handleEvent (this: ThreadPrivateInstanceData, event: MessageEvent<Message>): void
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
    threadId: number
    exitCode: number

    constructor ()
    constructor (key?: typeof privateKey, threadId?: Thread['id'], exitCode?: number, ) {
        if (key !== privateKey)
            throw new Error(`illegal invocation`)

        super('exit')
        this.threadId = threadId as Thread['id']
        this.exitCode = exitCode as number
    }
}

/** Return the private data of a Thread. */
export const getPrivateData = Symbol()
export const privateKey = Symbol()

export const messageTypeEnum = {
    /** Thread.prototype.create from worker thread to main thread */
    create: 0,
    /** Thread.prototype.create from main thread */
    connect: 1,
    /** Thread.prototype.import */
    import: 2,
    /** Thread.prototype.call */
    call: 3,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.call, Thread.prototype.terminate */
    resolve: 4,
    /** Thread.prototype.create, Thread.prototype.import, Thread.prototype.call, Thread.prototype.terminate */
    reject: 5,
    /** globalThis.close, process.exit, Thread.close */
    close: 6,
    /** Thread.prototype.terminate */
    terminate: 7,
    /** globalThis.close, process.exit, Thread.close, Thread.prototype.terminate */
    disconnect: 8
}

const importMessage: ImportMessage = {
    type: messageTypeEnum.import,
    responseId: -1,
    moduleId: ''
}

const callMessage: CallMessage = {
    type: messageTypeEnum.call,
    responseId: -1,
    functionId: '',
    args: []
}

export const resolveMessage: ResolveMessage = {
    type: messageTypeEnum.resolve,
    responseId: -1,
    value: undefined
}

const rejectMessage: RejectMessage = {
    type: messageTypeEnum.reject,
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

export const transferables: (Transferable | NodeJSTransferable)[] = []

const callHandler: MessageHandler<CallMessage> = (threadData, message) => {
    const { responseId, functionId, args } = message
    const fn = functionMap.get(functionId)

    try {
        const result = (fn as any)(...args)

        resolveMessage.responseId = responseId
        resolveMessage.value = result

        threadData.messagePort.postMessage(resolveMessage, Thread.transfer)
    } catch (error) {
        rejectMessage.responseId = responseId
        rejectMessage.reason = error

        try {
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
    createWorker: null as unknown as (workerData: any) => Thread,
    [messageTypeEnum.create]: null as any,
    [messageTypeEnum.connect]: null as any,
    [messageTypeEnum.import]: importHandler,
    [messageTypeEnum.call]: callHandler,
    [messageTypeEnum.resolve]: resolveHandler,
    [messageTypeEnum.reject]: rejectHandler,
    [messageTypeEnum.close]: null as any,
    [messageTypeEnum.terminate]: null as any,
    [messageTypeEnum.disconnect]: null as any
}

/** The message listener for each thread's MessagePort.  */
export const messageListener: ThreadPrivateInstanceData['handleEvent'] = function (event) {
    // call the corresponding MessageHandler for the message type using the message as the argument
    ThreadPrivateStaticData[event.data.type](this, event.data)
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
     * If no function is associated with functionId or the function throws an error then the returned Promise will be rejected.
     * @param functionId An identifier that maps to a function.
     * @param args An array of arguments that will be passed to the function. If an argument is not compatible with the HTML structured clone algorithm the returned Promise will be rejected.
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {TypeError} if the Thread is closed.
     * @throws {TypeError} if functionId can not be converted to a string.
     */
    call (functionId: any, args?: any[]): Promise<any>

    /**
     * Call a function on the thread added using Thread.setFunction and return a Promise that resolves to the value returned by that function.
     * If no function is associated with functionId or the function throws an error then the Promise will be rejected.
     * @param functionId An identifier that maps to a function.
     * @param options An object containing the following properties:
     *
     * args: An array of arguments that will be passed to the function. If an argument is not compatible with the HTML structured clone algorithm the Promise will be rejected.
     *
     * transfer: An array of objects to transfer to the thread. If an object is not transferable the Promise will be rejected.
     *
     * signal: An abortSignal that may be used to reject the Promise.
     *
     * @throws {TypeError} if this is not a Thread instance.
     * @throws {TypeError} if the Thread is closed.
     * @throws {TypeError} if functionId can not be converted to a string.
     * @throws {TypeError} if options is not an object.
     * @throws {TypeError} if options.args is not an array.
     * @throws {TypeError} if options.transfer is not an array.
     * @throws {TypeError} if options.signal is not an AbortSignal.
     */
    call (functionId: any, options?: CallOptions): Promise<any>
    call (functionId: any, argsOrOptions?: (any[] | CallOptions)) {
        if (!ThreadMap.has(this))
            throw new TypeError(`this (${Object.prototype.toString.call(this)}) is not a Thread instance`)

        const threadData = ThreadIdMap.get(this.id)
        if (!threadData) throw new Error(`thread ${this.id} is closed`)

        functionId = String(functionId)

        let transfer: (Transferable | NodeJSTransferable)[]
        let signal: AbortSignal

        if (argsOrOptions !== undefined) {
            if (typeof argsOrOptions !== 'object')
                throw new TypeError(`argsOrOptions (${typeof argsOrOptions}) is not an object`)

            if (argsOrOptions instanceof Array) {
                callMessage.args = argsOrOptions
            } else {
                if (argsOrOptions.args && !(argsOrOptions.args instanceof Array))
                    throw new TypeError(`options.args (${Object.prototype.toString.call(argsOrOptions.args)}) is not an Array`)

                transfer = argsOrOptions.transfer as (Transferable | NodeJSTransferable)[]

                if (transfer && !(transfer instanceof Array))
                    throw new TypeError(`options.transfer (${Object.prototype.toString.call(transfer)}) is not an Array`)


                signal = argsOrOptions.signal as AbortSignal

                if (signal && !(signal instanceof AbortSignal))
                    throw new TypeError(`options.signal (${Object.prototype.toString.call(signal)}) is not an AbortSignal`)

                callMessage.args = argsOrOptions.args || []
            }
        }

        return new Promise((resolve, reject) => {
            const messageResponse: MessageResponse = {
                id: ThreadPrivateStaticData.nextResponseId++,
                threadData: threadData,
                signal,
                resolve,
                reject,
                handleEvent: abortListener
            }

            threadData.messageResponseMap.set(messageResponse.id, messageResponse)
            signal?.addEventListener('abort', messageResponse)

            callMessage.responseId = messageResponse.id
            callMessage.functionId = functionId

            try {
                threadData.messagePort.postMessage(callMessage, transfer)
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
export const destructThreadPrivateData = (threadData: ThreadPrivate, exitCode?: number) => {
    if (threadData.messagePort) {
        for (const [id, response] of threadData.messageResponseMap) {
            response.reject(new Error(`thread ${threadData.thread.id} closed`))
            response.signal?.removeEventListener('abort', response)
            threadData.messageResponseMap.delete(id)
        }

        threadData.exitCode = Number(exitCode)
        threadData.messagePort = undefined as any
        threadData.messageResponseMap = undefined as any

        ThreadIdMap.delete(threadData.thread.id)
        Thread.eventTarget.dispatchEvent(new (ExitEvent as any)(privateKey, threadData.thread.id, exitCode))
    }
}