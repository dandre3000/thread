// testing async worker code is egregious work
const _ = undefined
const testMap = new Map
const threadIdSet = new Set
const onlineEventMap = new Map
const exitEventMap = new Map
const fn = async () => testMap.set('foo', 9)

const createThread = async (Thread, workerData, module) => {
    process.on('uncaughtException', reason => {
        console.error(reason)
        Thread.close()
    })
    process.on('unhandledRejection', reason => {
        console.error(reason)
        Thread.close()
    })

    const thread = await Thread.create(workerData)
    const event = onlineEventMap.get(thread)

    testMap.set(`Thread ${thread.id}: online event is dispatched to Thread.eventTarget when a Thread is created`, (
        event instanceof Event && event.thread === thread
    ))

    testMap.set(`Thread ${thread.id}: no Thread instance has the same id`, threadIdSet.has(thread.id) === false)

    threadIdSet.add(thread.id)

    testMap.set(`Thread ${thread.id}: this.isOnline() returns true until the Thread is closed`, await thread.isOnline())
    testMap.set(`Thread ${thread.id}: Thread.getThread(this.id) returns the corresponding Thread`,
        Thread.getThread(thread.id) === thread
    )
    testMap.set(`Thread ${thread.id}: Thread.getAllThreads() includes the new Thread`,
        Thread.getAllThreads().includes(thread) === true
    )

    await thread.import(module)

    testMap.set(`Thread ${thread.id}: Thread.isMainThread on worker thread === false`,
        await thread.invoke('getIsMainThread') === false
    )

    testMap.set(`Thread ${thread.id}: Thread.mainThread on worker thread === main Thread instance`,
        await thread.invoke('getMainThread') === true
    )

    testMap.set(`Thread ${thread.id}: Thread.workerData on worker thread == workerData argument used for Thread.create`,
        await thread.invoke('getWorkerData') === workerData
    )

    return thread
}

const terminateThread = async (Thread, thread) => {
    const exitCode = await thread.terminate()
    const event = exitEventMap.get(thread)

    testMap.set(`Thread ${thread.id}: exit event is dispatched to Thread.eventTarget when a Thread is terminated`, (
        event instanceof Event &&
        event.thread === thread &&
        event.exitCode === exitCode
    ))

    testMap.set(`Thread ${thread.id}: Thread.getThread(this.id) returns null`,
        Thread.getThread(thread.id) === null
    )

    testMap.set(`Thread ${thread.id}: Thread.getAllThreads() does not include the Thread`,
        Thread.getAllThreads().includes(thread) === false
    )

    testMap.set(`Thread ${thread.id}: this.isOnline returns true until the Thread is closed`,
        thread.isOnline() === false
    )
}

// eval test conditions upfront, add them to a map then iterate it
export const runTests = async (Thread, module, test, expect) => {
    Thread.expose('test', () => {})

    testMap.set('Thread.unexpose() removes the function associated with id',
        Thread.unexpose('test') === true
    )

    testMap.set('Main Thread: Thread.isMainThread === true',
        Thread.isMainThread === true
    )

    testMap.set('Main Thread: Thread.id === 0',
        Thread.id === 0
    )

    testMap.set('Main Thread: Thread.mainThread === null',
        Thread.mainThread === null
    )

    let value
    try { value = await Thread.create(Symbol()) } catch (error) { value = error }

    testMap.set('Thread.create throws DOMException if workerData is not serializable',
        value instanceof DOMException
    )

    Thread.eventTarget.addEventListener('online', event => {
        onlineEventMap.set(event.thread, event)
    })

    Thread.eventTarget.addEventListener('exit', async event => {
        exitEventMap.set(event.thread, event)
    })

    await createThread(Thread, Math.random(), module)
    await createThread(Thread, Math.random(), module)
    await createThread(Thread, Math.random(), module)

    const threads = Thread.getAllThreads()
    const randomThread = threads[Math.floor(Math.random() * threads.length)]

    try { value = await randomThread.invoke('') } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() rejects Error if no function is associated with the id`,
        value instanceof Error
    )

    try { value = await randomThread.invoke('ping', 0) } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() throws TypeError if args is defined but not an array`,
        value instanceof TypeError
    )

    try { value = await randomThread.invoke('ping', [Symbol()]) } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() rejects Error if any element within args is not serializable`,
        value instanceof Error
    )

    try { value = await randomThread.invoke('ping', _, 0) } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() throws TypeError if transfer is defined but not an array`,
        value instanceof TypeError
    )

    try { value = await randomThread.invoke('ping', _, [0]) } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() throws Error if any element within transfer is not transferable`,
        value instanceof Error
    )

    try { value = await randomThread.invoke('ping', _, _, {}) } catch (error) { value = error }

    testMap.set(`Thread ${randomThread.id}: this.invoke() throws TypeError if signal is defined but not an AbortSignal`,
        value instanceof TypeError
    )

    const { port1, port2 } = new MessageChannel

    value = new Promise(resolve => {
        port1.addEventListener('message', () => resolve(true))
        port1.start()

        value = randomThread.invoke('transfer', [port2], [port2]).catch(() => resolve(false))
    })

    testMap.set(`Thread ${randomThread.id}: this.invoke() transfers the transfer argument`, await value)

    const controller = new AbortController()
    const signal = controller.signal

    randomThread.invoke('neverResolve', _, _, signal).catch(reason => value = reason)

    controller.abort(true)

    testMap.set(`Thread ${randomThread.id}: this.invoke() can be cancelled with an AbortSignal`, await value)

    const pings = []

    Thread.expose('pong', () => {})

    for (const thread of threads) {
        pings.push(thread.invoke('ping'))
    }

    try { value = !!await Promise.all(pings) } catch (error) { value = false }

    testMap.set('All Threads are interconnected', value)

    for (const thread of Thread.getAllThreads()) {
        await terminateThread(Thread, thread)
    }

    for (const [name, result] of testMap) {
        test(name, () => expect(result).toBe(true))
    }
}