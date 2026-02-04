if (typeof setImmediate !== 'function' && typeof setTimeout !== 'function')
    throw new ReferenceError('setTimeout is required to use @dandre3000/thread')

try {
    class Foo {}
} catch (error) {
    throw new SyntaxError('ES6 class syntax is required to use @dandre3000/thread')
}

if (typeof Promise !== 'function' || typeof Promise.prototype !== 'object')
    throw new ReferenceError('Promise is required to use @dandre3000/thread')

if (typeof WeakMap !== 'function' || typeof WeakMap.prototype !== 'object')
    throw new ReferenceError('WeakMap is required to use @dandre3000/thread')

if (typeof MessageChannel !== 'function' || typeof MessageChannel.prototype !== 'object')
    throw new ReferenceError('MessageChannel is required to use @dandre3000/thread')

if (typeof Symbol !== 'function' || typeof Symbol.prototype !== 'object')
    throw new ReferenceError('Symbol is required to use @dandre3000/thread')

if (typeof Symbol.hasInstance !== 'symbol')
    throw new ReferenceError('Symbol.hasInstance is required to use @dandre3000/thread')

;(async () => {
    try { await (async () => {})() } catch (error) {
        throw new SyntaxError('async and await operators are required to use @dandre3000/thread')
    }
})()

if (typeof AbortController !== 'function' || typeof AbortController.prototype !== 'object')
    throw new ReferenceError('AbortController is required to use @dandre3000/thread')

try {
    if (typeof import.meta !== 'object') throw new ReferenceError('import.meta is required to use @dandre3000/thread')
} catch (error) {
    throw new ReferenceError('import.meta is required to use @dandre3000/thread')
}

if (typeof URL !== 'function' || typeof URL.prototype !== 'object')
    throw new ReferenceError('URL is required to use @dandre3000/thread')

try {
    const module = import(URL.createObjectURL(new Blob([''], { type: "text/javascript" })))
    if (!(module instanceof Promise)) throw new ReferenceError('dynamic import is required to use @dandre3000/thread')
} catch (error) {
    throw new ReferenceError('dynamic import is required to use @dandre3000/thread')
}

export {}