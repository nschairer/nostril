const { WebSocket } = require('ws');
const {generatePrivateKey, getPublicKey, getEventHash, signEvent} = require('nostr-tools')

const sk = generatePrivateKey();
const pk = getPublicKey(sk);


let event = {
    pubkey:     pk,
    created_at: Date.now(),
    kind:       1,
    tags:       [['e', 'asdfasdf']],
    content:    'This is  a nostr message',
}
event.id = getEventHash(event);
event.sig = signEvent(event, sk);

let req = {
    ids:     [],
    authors: [],
    kinds:   [],
    '#e':    ['asdfasdf'],
    '#p':    [],
    since:   null,
    until:   null, 
    limit:   10
}

const ws = new WebSocket('ws://localhost:8000');

ws.on('error', console.error);

ws.on('open', async function open() {
    ws.send(JSON.stringify([
        'REQ',
        'fake_sub_id',
        req
    ]));
    await new Promise(r => setTimeout(r, 1000))
    ws.send(JSON.stringify([
        'EVENT',
        event
    ]));
});

ws.on('message', (data) => {
    console.log(JSON.parse(data.toString('utf8')));
})
