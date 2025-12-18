import { runTests } from './test.js'
import { Thread } from '../build/node.index.js'
import { test, expect } from 'bun:test'

await runTests(Thread, new URL('./worker_thread.js', import.meta.url), test, expect)