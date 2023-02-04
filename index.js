const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 8000 });
const Events = require('./events');

wss.on('connection', (ws, request, client) => {
    ws.on('error', console.error);
    ws.on('message', Events.handle);
});
