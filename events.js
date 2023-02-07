const knex = require('./db');
const subscriptions = {};
const events        = [];

function send_notice(conn, error) {
    conn.send(JSON.stringify([
        'NOTICE',
        error.toString()
    ]))
}

function remove_subscription(subscription_id) {
    delete subscriptions[subscription_id];
}

async function save_event(event) {
    await knex('events')
    .insert({...event, tags: JSON.stringify(event.tags)});
    if (event.tags && event.tags.length) {
        let cleantags = [];
        for (let tag of event.tags) {
            const [type, value] = tag;
            cleantags.push({
                id: event.id,
                type,
                value,
                other: tag[2]
            })
        }
        await knex('tags')
        .insert(cleantags);
    }
}

function publish_event(event) {
    for (let sub in subscriptions) {
        if (subscriptions[sub].test(event)) {
            subscriptions[sub].send_event(event)
        }
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
        if (!Array.isArray(tag)) throw 'tags must be subarrays of strings';
        for (let prop of tag) {
            if (typeof prop !== 'string') throw 'tags must be subarrays of strings';
        }
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


async function send_events_and_subscribe({
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
    subscription.test            = e => subscription.filters.some(f => f.test(e));
    subscription.send_event      = e => {
        subscription.connection.send(JSON.stringify([
            'EVENT',
            subscription.subscription_id,
            e
        ]));
    }
    subscription.buildQuery = () => {
        const q = knex('events');
        let limit = Infinity;
        let join  = false;
        for (let filter of subscription.filters) {
            if (filter.limit < limit) limit = filter.limit;
            let hasE = filter['#e'] && filter['#e'].length;
            let hasP = filter['#p'] && filter['#p'].length;
            join = join || hasE || hasP;
            q.orWhere((qb) => {
                if (filter.ids && filter.ids.length)         qb.whereIn('id', filter.ids);
                if (filter.authors && filter.authors.length) qb.andWhereIn('pubkey', filter.authors);
                if (filter.kinds && filter.kinds.length)     qb.andWhereIn('kind', filter.kinds);
                if (filter.since)                            qb.andWhere('created_at', '<', filter.since);
                if (filter.until)                            qb.andWhere('created_at', '>', filter.since);
                if (hasE || hasP) {
                    if (hasE) {
                        let i = 0;
                        let t = [];
                        for (let prefix of filter['#e']) {
                            t.push([`(tags.type = 'e' and tags.value like :e${i} || '%')`, i, prefix])
                            i++;
                        };
                        qb.andWhereRaw(`
                        (${t.map(e => e[0]).join(' OR ')})
                    `, t.reduce((a,b) => { a['e' + b[1]] = b[2]; return a }, {}))
                    }
                    if (hasP) {
                        let i = 0;
                        let t = [];
                        for (let prefix of filter['#p']) {
                            t.push([`(tags.type = 'p' and tags.value like :p${i} || '%')`, i, prefix]);
                            i++;
                        };
                        qb.andWhereRaw(`
                        (${t.map(p => p[0]).join(' OR ')})
                    `, t.reduce((a,b) => { a['p' + b[1]] = b[2]; return a }, {}))
                    }
                }
            })
        }
        if (join) {
            q.leftJoin('tags', 'tags.id', 'events.id')
            q.select(['events.*'])
            q.groupBy(['events.id'])
        }
        q.limit(limit);
        return q.stream();
    }

    for await (let event of subscription.buildQuery()) subscription.send_event({...event, tags: JSON.parse(event.tags)});
}

async function handle(data) {
    let message;
    try {
        message = JSON.parse(data.toString('utf8'));
    } catch (e) {
        console.log(e);
        send_notice(this, new Error('Invalid event format: (NIPS-01) JSON UTF-8 required'));
        return;
    }
    console.log('MESSAGE', message)
    try {
        if (Array.isArray(message)) {
            switch (message[0]) {
                case 'EVENT':
                    const event = parse_event(message[1]);
                    await save_event(event);
                    publish_event(event);
                    break;
                case 'REQ':
                    const filters = message.slice(2).map(f => parse_filter(f));
                    await send_events_and_subscribe({
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
