import { Thread } from './Thread.ts'

export const defineExportProperties = () => {
    Object.defineProperties(Thread, {
        isMainThread: {
            configurable: false,
            writable: false,
            enumerable: true,
            value: Thread.isMainThread
        },
        id: {
            configurable: false,
            writable: false,
            enumerable: true,
            value: Thread.id
        },
        transfer: {
            configurable: false,
            writable: false,
            enumerable: true,
            value: Thread.transfer
        },
        eventTarget: {
            configurable: false,
            writable: false,
            enumerable: true,
            value: Thread.eventTarget
        },
        mainThread: {
            configurable: false,
            writable: false,
            enumerable: true,
            value: Thread.mainThread
        },
        prototype: {
            configurable: false,
            writable: false,
            enumerable: false,
            value: Thread.prototype
        },
        [Symbol.hasInstance]: {
            configurable: false,
            writable: false,
            enumerable: false,
            value: Thread[Symbol.hasInstance]
        }
    })
}