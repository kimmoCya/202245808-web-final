\const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 메인 페이지 조회 (추천 상태 상품 중 랜덤 4개 추출)
router.get('/', (req, res) => {
    const query = "SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY RANDOM() LIMIT 4";

    db.all(query, [], (err, featuredProducts) => {
        if (err) {
            return res.status(500).send('추천 상품 불러오기 실패');
        }

        // ⭕ [핵심 가드] 메인 홈 화면(/)은 1단계 가장 얕은 깊이입니다.
        // 이 화면에서 로그인 버튼을 누르면 주소창은 현재 위치 뒤에 'user/login'이 붙은 상대 계층으로 안전하게 진입해야 합니다.
        res.render('index', {
            title: '내 쇼핑몰',
            featuredProducts,
            user: req.session.user
        });
    });
});

module.exports = router;