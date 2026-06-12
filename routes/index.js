const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/
router.get('/', (req, res) => {
    const query = "SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY RANDOM() LIMIT 4";

    db.all(query, [], (err, featuredProducts) => {
        if (err) {
            return res.status(500).send('추천 상품 불러오기 실패');
        }

        // 검증 완료: 템플릿 엔진 파일명 매핑 방식으로 상대 경로 계층에 전혀 영향을 주지 않음
        res.render('index', {
            title: '내 쇼핑몰',
            featuredProducts,
            user: req.session.user
        });
    });
});

module.exports = router;