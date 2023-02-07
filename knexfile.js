module.exports = {
    client: 'sqlite3',
    connection: './database-sqlite3.db',
    useNullAsDefault: true,
    pool: {
        min: 0,
        max: 10
    }
}
