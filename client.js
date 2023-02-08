const { WebSocket } = require('ws');
const {generatePrivateKey, getPublicKey, getEventHash, signEvent} = require('nostr-tools')

const sk = generatePrivateKey();
const pk = getPublicKey(sk);


let event = {
    pubkey:     pk,
    created_at: Date.now(),
    kind:       1,
    tags:       [['e', 'asdfasdf'], ['p', '71fb1767e455a7cf17ba203fafcd95c765e359bb6b140c3bd6f262055440509b']],
    content:    'This is  a nostr message',
}
event.id = getEventHash(event);
event.sig = signEvent(event, sk);

let req = {
    ids:     [],
    authors: ['51dc2e5e6c214bbd5b3'],
    kinds:   [],
    '#e':    [],
    '#p':    ['71fb1767e455a7cf17ba203fafcd95c765e359bb6b140c3bd6f262055440509b'],
    since:   1675831906825,
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
