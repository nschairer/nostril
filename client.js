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
    let sk = '3015d723ed1f1196c6805d5d5605ec85669fd02930c7fd2efc47728aded0f7e5'//generatePrivateKey()
    let pk = getPublicKey(sk)

    console.log("creating sub")
    let sub = relay.sub([
        {
            kinds: [1,3],
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
    event = {
        kind: 3,
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["p", "a8bb3d884d5d90b413d9891fe4c4e46d", "", "david"],
            ["p", "f57f54057d2a7af0efecc8b0b66f5708", "", "frank"],
            ["p", "21df6d143fb96c2ec9d63726bf9edc71", "", "noah"]
        ],
        content: ''
    }
    event.id = getEventHash(event)
    event.sig = signEvent(event, sk)
    let pub2 = relay.publish(event)
    pub2.on('ok', () => {
        console.log(`${relay.url} has accepted our event`)
    })
    pub2.on('seen', () => {
        console.log(`we saw the event on ${relay.url}`)
    })
    pub2.on('failed', reason => {
        console.log(`failed to publish to ${relay.url}: ${reason}`)
    })
});

