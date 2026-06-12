const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('시스템 유저 테이블 구조 초기화 시작');

    db.run('DROP TABLE IF EXISTS users', function(err) {
        if (err) {
            console.error('유저 TABLE DROP 실패:', err.message);
        } else {
            console.log('기존 유저 테이블 제거 완료.');
        }

        db.close((closeErr) => {
            if (closeErr) console.error('Database 닫기 오류:', closeErr.message);
            else console.log('데이터베이스 자원 반환 완료.');
        });
    });
});