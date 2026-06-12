const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 파일 실행 위치와 관계없이 항상 프로젝트 내의 정확한 DB 파일을 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 기본 사용자 리스팅 라우트 (주소창: /users -> 1단계 깊이)
router.get('/', function(req, res, next) {
    // ⭕ [무결성 검증] 리다이렉트 분기가 없는 단순 텍스트 반환 엔드포인트이므로 배포 시 완벽하게 안전합니다.
    res.send('respond with a resource');
});

module.exports = router;