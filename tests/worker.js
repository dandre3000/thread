export const main = Thread => {
    process.on('uncaughtException', reason => {
        console.error(reason)
        Thread.close()
    })
    process.on('unhandledRejection', reason => {
        console.error(reason)
        Thread.close()
    })

    Thread.expose('getIsMainThread', () => Thread.isMainThread)
    Thread.expose('getMainThread', () => Thread.mainThread instanceof Thread)
    Thread.expose('getWorkerData', () => Thread.workerData)
    Thread.expose('neverResolve', () => new Promise((resolve, reject) => {}))
    Thread.expose('ping', async () => {
        const pongs = []

        for (const thread of Thread.getAllThreads()) {
            pongs.push(thread.invoke('pong'))
        }

        await Promise.all(pongs)// .catch(reason => console.error(reason))
    })
    Thread.expose('pong', () => {})
    Thread.expose('transfer', port => {
        port.start()
        port.postMessage(true)
    })
    Thread.expose('getPort', () => {
        const { port1, port2 } = new MessageChannel

        setTimeout(() => port1.postMessage(true))

        Thread.transfer.push(port2)
        return port2
    })
}