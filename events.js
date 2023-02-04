
const subscriptions = {};
const events        = [];

function send_notice(conn, error) {
    conn.send(JSON.stringify([
        'NOTICE',
        error.toString()
    ]))
}

function save_event(event) {
    events.push(event);
}

function publish_event(event) {
    for (let sub in subscriptions) {
        subscriptions[sub].send(event)
    }
}

function parse_event(event) {
    if (typeof event.id !== 'string')          throw 'id must be a string';
    if (typeof event.sig !== 'string')         throw 'sig must be a string';
    if (typeof event.content !== 'string')     throw 'content must be a string';
    if (typeof event.created_at !== 'number')  throw 'created_at must be a number';
    if (typeof event.pubkey !== 'string')      throw 'pubkey mmust be a string';
    if (!event.pubkey.match(/^[a-f0-9]{64}$/)) throw 'Invalid pubkey format';
    if (!Array.isArray(event.tags))            throw 'tags must be an array';
    for (let tag of event.tags) {
        if (typeof tag !== 'string') throw 'tags can only have strings';
    }
    return {
        id:         event.id,
        pubkey:     event.pubkey,
        created_at: event.created_at,
        kind:       event.kind,
        tags:       event.tags,
        content:    event.content,
        sig:        event.sig
    }
}

function parse_filter(filter) {
    // XXX Prefixes, check strings as well
    if (filter.ids     && !Array.isArray(filter.ids))        throw 'ids must be an array'
    if (filter.authors && !Array.isArray(filter.authors))    throw 'authors must be an array'
    if (filter.kinds   && !Array.isArray(filter.kinds))      throw 'kinds must be an array'
    if (filter['#e']   && !Array.isArray(filter['#e']))      throw '#e must be an array'
    if (filter['#p']   && !Array.isArray(filter['#p']))      throw '#p must be an array'
    if (filter.since   && typeof filter.since !== 'number')  throw 'since must be a number'
    if (filter.until   && typeof filter.until !== 'number')  throw 'until must be a number'
    if (filter.limit   && typeof filter.limit !== 'number')  throw 'limit must be a number'

    return {
        ids:     filter.ids,
        authors: filter.authors,
        kinds:   filter.kinds,
        '#e':    filter['#e'],
        '#p':    filter['#p'],
        since:   filter.since,
        until:   filter.until,
        limit:   filter.limit || 200,
        test: function(e) {
            // Handle prefix matching for ids and authors
            // Conditions within filter treated as &&
            if (this.ids && this.ids.length) {
                let found_id = false;
                for (let id of this.ids) {
                    if (e.id.startsWith(id)) found_id = true;
                }
                if (!found_id) return false;
            }
            if (this.authors && this.authors.length) {
                let found_author = false;
                for (let author of this.authors) {
                    if (e.pk.startsWith(author)) found_author = true;
                }
                if (!found_author) return false;
            }
            if (this.kinds && this.kinds.length) {
                if (!this.kinds.includes(e.kind)) return false;
            }
            if (this['#e'] && this['#e'].length) {
                if (e.tags.length) {
                    const emap = new Set(this['#e']);
                    if (!e.tags.some(t => t[0] == 'e' && emap.has(t[1]))) return false;
                } else {
                    return false;
                }
            }
            if (this['#p'] && this['#p'].lpngth) {
                if (e.tags.length) {
                    const pmap = new Set(this['#p']);
                    if (!e.tags.some(t => t[0] == 'p' && pmap[t[1]])) return false;
                } else {
                    return false;
                }
            }
            if (this.since) {
                if (e.created_at < this.since) return false;
            }
            if (this.until) {
                if (e.created_at > this.since) return false;
            }
            return true;
        }
    };
}


function send_events_and_subscribe({
    subscription_id, 
    filters,
    connection
}) {

    // Store subscription
    const subscription  = (subscriptions[subscription_id] = 
        subscriptions[subscription_id] || {}
    );
    subscription.subscription_id = subscription_id;
    subscription.connection      = connection;
    subscription.filters         = filters;
    subscription.send = e => {
        let match = false;
        for (let filter of subscription.filters) {
            if (filter.test(e)) match = true;
        }
        if (match) {
            subscription.connection.send(JSON.stringify([
                'EVENT',
                subscription.subscription_id,
                e
            ]));
        }
    };

    for (let e of events) subscription.send(e);
}

function remove_subscription(subscription_id) {
    delete subscriptions[subscription_id];
}


function handle(data) {
    let message;
    try {
        message = JSON.parse(data.toString('utf8'));
    } catch (e) {
        throw 'Invalid event format: (NIPS-01) JSON UTF-8 required'
    }
    console.log('MESSAGE', message)
    try {
        if (Array.isArray(message)) {
            switch (message[0]) {
                case 'EVENT':
                    const event = parse_event(message[1]);
                    save_event(event);
                    publish_event(event);
                    break;
                case 'REQ':
                    const filters = message.slice(2).map(f => parse_filter(f));
                    send_events_and_subscribe({
                        subscription_id: message[1], 
                        filters,
                        connection: this
                    });
                    break;
                case 'CLOSE':
                    remove_subscription(message[1])
                    break;
                default:
                    throw `Event type ${event[0]} not supported`;
            }
        } else {
            throw 'Invalid event format: (NIPS-01) JSON array required'
        }
    } catch (e) {
        send_notice(this, e);
    }
}

module.exports = {
    handle
}
