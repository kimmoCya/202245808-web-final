const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/wishlist/add
router.post('/add', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) {
        return res.status(401).send('로그인이 필요합니다.');
    }

    const query = `INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 추가 실패');
        res.status(200).send('위시리스트 추가 완료');
    });
});

// 주소창: .../stud19/wishlist
router.get('/', (req, res) => {
    const user = req.session.user;

    // 🚩 [보정] 비로그인 시 형의 정석 로그인 주소인 .../stud19/login 으로 튕겨줌
    if (!user) return res.redirect('login');

    const wishlistQuery = `
        SELECT w.id AS wish_id, p.id, p.name, p.price, p.emoji, p.image 
        FROM wishlist w
        JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ?
        ORDER BY w.created_at DESC`;

    db.all(wishlistQuery, [user.id], (err, wishRows) => {
        if (err) return res.status(500).send('위시리스트 조회 실패');

        if (wishRows.length === 0) {
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

// 주소창: .../stud19/wishlist/delete
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    if (!user) return res.redirect('login');

    db.run(`DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`, [user.id, productId], (err) => {
        if (err) return res.status(500).send('위시리스트 삭제 실패');
        // 🚩 [보정] 알림창 일절 없이 묵묵하게 위시리스트 메인 화면으로 제자리 새로고침 처리
        res.redirect('wishlist');
    });
});

module.exports = router;