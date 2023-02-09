require('websocket-polyfill')

const {
    relayInit,
    generatePrivateKey,
    getPublicKey,
    getEventHash,
    signEvent
} = require('nostr-tools');
const relay = relayInit('ws://localhost:8000')
relay.on('connect', () => {
    console.log(`connected to ${relay.url}`)
})
relay.on('error', () => {
    console.log(`failed to connect to ${relay.url}`)
})

relay.connect()
.then(() => {
    let sk = generatePrivateKey()
    let pk = getPublicKey(sk)

    console.log("creating sub")
    let sub = relay.sub([
        {
            kinds: [1],
            authors: [pk]
        }
    ])

    sub.on('event', event => {
        console.log('got event:', event)
    })

    let event = {
        kind: 1,
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: 'hello world'
    }
    event.id = getEventHash(event)
    event.sig = signEvent(event, sk)

    console.log("Publishing event")
    let pub = relay.publish(event)
    pub.on('ok', () => {
        console.log(`${relay.url} has accepted our event`)
    })
    pub.on('seen', () => {
        console.log(`we saw the event on ${relay.url}`)
    })
    pub.on('failed', reason => {
        console.log(`failed to publish to ${relay.url}: ${reason}`)
    })
});

