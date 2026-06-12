const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 파일 실행 위치와 관계없이 항상 프로젝트 내의 정확한 DB 파일을 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 위시리스트 추가
router.post('/add', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) {
        // ⭕ [교정] 주소창: /wishlist/add (2단계 깊이) -> 부모 밖 한 칸 위로 나가서 user/login 호출 (../user/login)
        return res.send('<script>alert("위시리스트를 사용하려면 로그인이 필요합니다."); location.href="../user/login";</script>');
    }

    const query = `INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 추가 실패');
        // ⭕ [유지] history.back()은 이전 주소창 뎁스를 그대로 유지하므로 상대 경로상 완벽하게 안전합니다.
        res.send('<script>alert("위시리스트에 상품을 담았습니다."); history.back();</script>');
    });
});

// 위시리스트 목록 조회 (비어 있을 시 추천 상품 연동)
router.get('/', (req, res) => {
    const user = req.session.user;
    // ⭕ [교정] 주소창: /wishlist (1단계 깊이) -> 현재 위치 기준 선상의 동일 레벨 user/login 즉시 상대 바인딩 (user/login)
    if (!user) return res.redirect('user/login');

    const wishlistQuery = `
        SELECT w.id AS wish_id, p.id, p.name, p.price, p.emoji, p.image 
        FROM wishlist w
        JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC`;

    db.all(wishlistQuery, [user.id], (err, wishRows) => {
        if (err) return res.status(500).send('위시리스트 조회 실패');

        if (wishRows.length === 0) {
            // 위시리스트가 빈 경우 노출할 추천 상품 4개 조회
            const recommendQuery = "SELECT * FROM products WHERE status = '메인 추천 노출중' ORDER BY RANDOM() LIMIT 4";
            db.all(recommendQuery, [], (err2, recRows) => {
                if (err2) return res.status(500).send('추천 상품 조회 실패');
                res.render('wishlist', { wishlistItems: wishRows, featuredProducts: recRows, user });
            });
        } else {
            res.render('wishlist', { wishlistItems: wishRows, featuredProducts: [], user });
        }
    });
});

// 위시리스트 항목 삭제
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    // ⭕ [교정] 주소창: /wishlist/delete (2단계 깊이) -> 부모 밖 한 단계 위 레벨의 user/login 바인딩 (../user/login)
    if (!user) return res.redirect('../user/login');

    db.run(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 삭제 실패');
        // ⭕ [교정] 주소창: /wishlist/delete (2단계 깊이) -> 한 단계 위 부모 폴더인 wishlist 리스트 메인화면으로 리다이렉트 (../wishlist)
        res.redirect('../wishlist');
    });
});

module.exports = router;