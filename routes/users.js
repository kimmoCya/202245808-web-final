const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/users
router.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

module.exports = router;