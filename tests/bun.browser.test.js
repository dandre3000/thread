import { runTests } from './test.js'
import { Thread } from '../build/browser.index.js'
import { test, expect } from 'bun:test'

await runTests(Thread, new URL('./web_worker.js', import.meta.url), test, expect)