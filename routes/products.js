const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 어떤 폴더 환경에서 실행되든 현재 파일 위치 기준으로 DB를 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 메인 및 추천 상품 목록 조회 (주소창: /products -> 1단계 깊이)
router.get('/', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, allProducts) => {
        if (err) return res.status(500).send('DB 오류: 전체 상품 조회 실패');

        // 관리대장 status 컬럼 연동을 통한 추천 상품 필터링
        const queryFeatured = `SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY id DESC LIMIT 4`;

        db.all(queryFeatured, (err2, featuredProducts) => {
            if (err2) return res.status(500).send('DB 오류: 추천 상품 조회 실패');

            // ⭕ [계층 해설] 현재 주소창 깊이가 1단계이므로, views/products.ejs 화면 내부에 바인딩된
            // 모든 상대 링크(cart, wishlist/add 등)가 엇나가지 않고 해당 우분투 계정 스코프를 유지합니다.
            res.render('products', {
                allProducts: allProducts,
                featuredProducts: featuredProducts,
                user: req.session.user
            });
        });
    });
});

// 전체 상품 목록 조회 페이지 (주소창: /products/all -> 2단계 깊이)
router.get('/all', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('전체 상품 목록 불러오기 실패');

        // ⭕ [계층 해설] 현재 주소창 깊이가 /products/all 로 2단계입니다.
        // views/products_all.ejs 뷰 템플릿이 렌더링될 때 주소창 깊이가 한 단계 더 깊으므로
        // 상단 헤더의 로고 홈 연결이나 GNB 메뉴들이 상위 계층(../)을 안전하게 바라보도록 프론트와 연동됩니다.
        res.render('products_all', {
            products: rows,
            user: req.session.user
        });
    });
});

module.exports = router;