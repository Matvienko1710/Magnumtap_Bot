[]

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  const content = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const db = loadDB();
  let user = db.find(u => u.id === userId);
  if (!user) {
    user = { id: userId, stars: 0, lastFarm: 0, lastBonus: 0 };
    db.push(user);
    saveDB(db);
  }
  return user;
}

function saveUser(userId, updatedData) {
  const db = loadDB();
  const index = db.findIndex(u => u.id === userId);
  if (index !== -1) {
    db[index] = { ...db[index], ...updatedData };
    saveDB(db);
  }
}

module.exports = {
  getUser,
  saveUser
};
