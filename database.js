// database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./users.db');

// Создание таблицы, если нет
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      stars INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0,
      lastFarm INTEGER DEFAULT 0,
      lastBonus INTEGER DEFAULT 0
    )
  `);
});

function getUser(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) return callback(err);
    if (!row) {
      db.run('INSERT INTO users (id) VALUES (?)', [id], (err) => {
        if (err) return callback(err);
        return getUser(id, callback); // снова вызываем, чтобы получить строку
      });
    } else {
      callback(null, row);
    }
  });
}

function updateUser(id, data, callback) {
  const { stars, balance, lastFarm, lastBonus } = data;
  db.run(`
    UPDATE users SET stars = ?, balance = ?, lastFarm = ?, lastBonus = ? WHERE id = ?
  `, [stars, balance, lastFarm, lastBonus, id], callback);
}

module.exports = { getUser, updateUser };
