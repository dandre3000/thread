import { errorReference } from './Thread'

if (typeof Promise !== 'function' || typeof Promise.prototype !== 'object')
    throw errorReference.apiDoesNotExist('Promise')

if (typeof WeakMap !== 'function' || typeof WeakMap.prototype !== 'object')
    throw errorReference.apiDoesNotExist('WeakMap')

if (typeof MessageChannel !== 'function' || typeof MessageChannel.prototype !== 'object')
    throw errorReference.apiDoesNotExist('MessageChannel')

if (typeof Symbol !== 'function' || typeof Symbol.prototype !== 'object')
    throw errorReference.apiDoesNotExist('Symbol')

if (typeof Symbol.hasInstance !== 'symbol')
    throw errorReference.apiDoesNotExist('Symbol.hasInstance')

try { await (async () => {})() } catch (error) { throw errorReference.apiDoesNotExist('async functions') }

if (typeof AbortController !== 'function' || typeof AbortController.prototype !== 'object')
    throw errorReference.apiDoesNotExist('AbortController')

try { if (typeof import.meta !== 'object') throw errorReference.apiDoesNotExist('import.meta') } catch (error) {
    throw errorReference.apiDoesNotExist('import.meta')
}

try { import(import.meta.url) } catch (error) { throw errorReference.apiDoesNotExist('dynamic import') }