/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {

    await knex
    .schema
    .raw(`
        CREATE TABLE events (
           id          text    not null primary key,
           pubkey      text    not null check(length(pubkey) = 64),
           created_at  integer not null,
           kind        integer not null,
           tags        text    not null, -- JSON
           content     text    not null,
           sig         text    not null check(length(sig) = 128)
        );

    `)
    .raw(`
        CREATE TABLE tags (
            id        text not null,
            type      text not null,
            value     text not null,
            other     text,
            FOREIGN KEY (id) REFERENCES events(id)
        );
    `)
  
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {

    await knex
    .schema
    .raw(`DROP TABLE EVENTS`);
  
};
