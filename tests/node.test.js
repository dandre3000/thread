import { runTests } from './test.js'
import { Thread } from '../build/node.index.js'
import test from 'node:test'
import { expect } from 'expect'

await runTests(Thread, new URL('./worker_thread.js', import.meta.url), test, expect)