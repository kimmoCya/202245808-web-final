const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/products
router.get('/', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, allProducts) => {
        if (err) return res.status(500).send('DB 오류: 전체 상품 조회 실패');

        const queryFeatured = `SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY id DESC LIMIT 4`;

        db.all(queryFeatured, (err2, featuredProducts) => {
            if (err2) return res.status(500).send('DB 오류: 추천 상품 조회 실패');

            // 검증 완료: 뷰 파일 이름만 문자열로 넘겨주므로 상대 경로 규칙에 아무런 문제를 주지 않음
            res.render('products', {
                allProducts: allProducts,
                featuredProducts: featuredProducts,
                user: req.session.user
            });
        });
    });
});

// 주소창: .../stud19/products/all
router.get('/all', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('전체 상품 목록 불러오기 실패');

        // 검증 완료: 뷰 파일 이름 호출 규격 이상 없음
        res.render('products_all', {
            products: rows,
            user: req.session.user
        });
    });
});

module.exports = router;