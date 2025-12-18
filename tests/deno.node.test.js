import { runTests } from './test.js'
import { Thread } from '../build/node.index.js'
import { expect } from 'expect'

await runTests(Thread, new URL('./worker_thread.js', import.meta.url), Deno.test, expect)