const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 현재 파일 위치 기준으로 데이터베이스 절대경로 자동 해석
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('유저 테이블 구조 초기화 시작...');

    // 무결성 오류 및 컬럼 변경 반영을 위한 기존 유저 테이블 드롭
    db.run('DROP TABLE IF EXISTS users', function(err) {
        if (err) {
            console.error('유저 TABLE DROP 실패:', err.message);
        } else {
            console.log('기존 유저 테이블 제거 완료. 어플리케이션 재시작 시 자동 재생성됩니다.');
        }
        db.close();
    });
});