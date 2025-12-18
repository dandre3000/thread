import { runTests } from './test.js'
import { Thread } from '../build/browser.index.js'
import { expect } from 'expect'

await runTests(Thread, new URL('./web_worker.js', import.meta.url), Deno.test, expect)