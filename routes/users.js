const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 파일 실행 위치와 관계없이 항상 프로젝트 내의 정확한 DB 파일을 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 기본 사용자 리스팅 라우트
router.get('/', function(req, res, next) {
    res.send('respond with a resource');
});

module.exports = router;