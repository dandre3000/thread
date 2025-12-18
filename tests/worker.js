export const main = Thread => {
    process.on('uncaughtException', reason => {
        console.error(reason)
        Thread.close()
    })
    process.on('unhandledRejection', reason => {
        console.error(reason)
        Thread.close()
    })

    Thread.setFunction('getIsMainThread', () => Thread.isMainThread)
    Thread.setFunction('getMainThread', () => Thread.mainThread instanceof Thread)
    Thread.setFunction('getWorkerData', () => Thread.workerData)
    Thread.setFunction('neverResolve', () => new Promise((resolve, reject) => {}))
    Thread.setFunction('ping', async () => {
        const pongs = []

        for (const thread of Thread.getAllThreads()) {
            pongs.push(thread.invoke('pong'))
        }

        await Promise.all(pongs)// .catch(reason => console.error(reason))
    })
    Thread.setFunction('pong', () => {})
    Thread.setFunction('transfer', port => {
        port.start()
        port.postMessage(true)
    })
}