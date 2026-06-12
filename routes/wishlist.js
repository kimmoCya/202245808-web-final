const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 실행 위치와 관계없이 현재 파일 폴더 기준으로 DB 경로를 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 위시리스트 추가
router.post('/add', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) {
        return res.send('<script>alert("위시리스트를 사용하려면 로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 추가 실패');
        res.send('<script>alert("위시리스트에 상품을 담았습니다."); history.back();</script>');
    });
});

// 위시리스트 목록 조회 (비어 있을 시 추천 상품 연동)
router.get('/', (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/user/login');

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

    if (!user) return res.redirect('/user/login');

    db.run(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 삭제 실패');
        res.redirect('/wishlist');
    });
});

module.exports = router;