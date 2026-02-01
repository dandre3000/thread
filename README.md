# thread

`Thread` is a class that features a consistent API for using Workers on a web browser, node, bun or deno. All Threads are interconnected and can import modules to and call functions from each other.

## Installation

```bash
npm install @dandre3000/thread
```

## Usage

```js
import { Thread } from '@dandre3000/thread'

// When a Thread is created
Thread.eventTarget.addEventListener('online', event => console.log('online event', event.thread.id, Thread.id))

// When a Thread has closed
Thread.eventTarget.addEventListener('exit', event => console.log('exit event', event.threadId, Thread.id))

// This function is exposed to other Threads
Thread.expose('test', (...args) => {
    return `Thread ${Thread.id} says: YO`
})

if (Thread.isMainThread) {
    console.log(Thread.id) // 0
    console.log(Thread.workerData) // null
    console.log(Thread.mainThread) // null

    Thread.create(999).then(async thread => {
        await thread.import(new URL(import.meta.url))

        console.log(await thread.invoke('test')) // Thread 1 says: YO
    })
} else {
    console.log(Thread.id) // 1
    console.log(Thread.workerData) // 999
    console.log(Thread.mainThread) // Thread instance for main thread
}
```

## Exports
### Class: Thread
### Static properties
#### isMainThread: boolean
True if the current thread is the main thread.
#### id: number
Identifier for the current thread.
#### workerdata: any
Data sent to a thread upon creation.
#### transfer: Transferable[]
Array of objects that will be transfered and emptied whenever another thread uses Thread.prototype.invoke to call a function on this thread made available using Thread.expose.
```js
// transfer a MessagePort from a worker to the main thread
import { Thread } from '@dandre3000/thread'

if (Thread.isMainThread) {
    const thread = await Thread.create()
    await thread.import(new URL(import.meta.url))

    ;(await thread.invoke('getPort')).postMessage('Transfer successful')
} else {
    Thread.expose('getPort', () => {
        const { port1, port2 } = new MessageChannel
        port1.addEventListener('message', ({ data }) => console.log(data))
        port1.start()
        Thread.transfer.push(port2)
        return port2
    })
}
```
#### eventTarget: EventTarget
The target for events broadcasted from other threads.
```js
import { Thread } from '@dandre3000/thread'

Thread.eventTarget.addEventListener('online', event => console.log(event))
Thread.eventTarget.addEventListener('exit', event => console.log(event))
```
#### mainThread: Thread
The Thread instance connected to the main thread if the current thread is a worker otherwise null.
#### create(workerData: any): Promise<Thread>
Return a Promise that resolves to a new Thread. This method is the only way to create a new Thread.
#### getThread(threadId: any): Thread
Return the Thread corresponding to the given threadId or return null if no online Thread exists where Thread.id === threadId.
#### getAllThreads(): Thread[]
Return an array of all online Threads.
#### expose(id: any, fn: Function): void
Make a function available to other threads when using Thread.prototype.invoke.
#### unexpose(id: any): void
Remove a function from those available to other threads when using Thread.prototype.invoke.
#### close(exitCode?: number): never
Alias for globalThis.close or process.exit.
### Instance properties
#### id: number
Identifier for this Thread instance.
#### isOnline(): boolean
Returns true until the thread is closed.
#### import(moduleId: any, signal?: AbortSignal): Promise<undefined>
Dynamically import an ES module to the thread and return a Promise that resolves when the module is loaded.
#### invoke(id: any, args?: any[], transfer?: (Transferable)[], signal?: AbortSignal): Promise<unknown>
Call a function on the thread added using Thread.expose and return a Promise that resolves to the value returned by that function.
#### terminate(): Promise<number>
Close this Thread instance.

## License

[MIT](https://github.com/dandre3000/thread/blob/main/LICENSE)
