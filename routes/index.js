const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// 메인 페이지 조회 (메인 추천 노출중 상품 중 랜덤 4개 추출)
router.get('/', (req, res) => {
    const query = "SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY RANDOM() LIMIT 4";

    db.all(query, [], (err, featuredProducts) => {
        if (err) {
            return res.status(500).send('추천 상품 불러오기 실패');
        }
        res.render('index', {
            title: '내 쇼핑몰',
            featuredProducts,
            user: req.session.user
        });
    });
});

module.exports = router;