const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// 현재 실행 파일 위치 기준으로 스크립트 및 DB 절대경로 매핑
const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, '../schema.sql');

const db = new sqlite3.Database(dbPath);
const schema = fs.readFileSync(schemaPath, 'utf-8');

// 테이블 생성 및 초기 데이터 스키마 일괄 실행
db.exec(schema, (err) => {
    if (err) {
        console.error('스키마 실행 오류:', err.message);
    } else {
        console.log('데이터베이스 테이블 스키마 초기화 완료');
    }
    db.close();
});