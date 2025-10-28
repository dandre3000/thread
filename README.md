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
Thread.setFunction('test', (...args) => {
    return `Thread ${Thread.id} says: YO`
})

if (Thread.isMainThread) {
    console.log(Thread.id) // 0
    console.log(Thread.workerData) // null
    console.log(Thread.mainThread) // null

    Thread.create(999).then(async thread => {
        await thread.import(new URL(import.meta.url))

        console.log(await thread.call('test')) // Thread 1 says: YO
    })
} else {
    console.log(Thread.id) // 1
    console.log(Thread.workerData) // 999
    console.log(Thread.mainThread) // Thread instance for main thread
}
```

## License

[MIT](https://github.com/dandre3000/thread/blob/main/LICENSE)
