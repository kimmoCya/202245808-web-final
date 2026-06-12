const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../cart/add
router.post('/add', (req, res) => {
    const user = req.session.user;
    const productId = req.body.productId;

    if (!user) {
        return res.status(401).send(`
            <script>
                alert('장바구니 담기 위해서는 로그인이 필요합니다.');
                location.href = '../user/login';
            </script>
        `);
    }

    const query = `INSERT INTO cart_items (user_id, product_id, quantity) 
                 VALUES (?, ?, 1) 
                 ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + 1`;

    db.run(query, [user.id, productId], function (err) {
        if (err) {
            console.error('장바구니 추가 오류:', err.message);
            return res.status(500).send('장바구니 추가 실패');
        }

        // 🚩 [핵심 복구] 흰 화면 없이 바로 선택창 띄우고 브라우저 제어
        res.send(`
            <script>
                if (confirm('장바구니에 상품이 정상적으로 담겼습니다.\\n장바구니로 이동하시겠습니까?')) {
                    location.href = '../cart';
                } else {
                    location.href = '../products';
                }
            </script>
        `);
    });
});

// 주소창: .../cart
router.get('/', (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('../user/login');

    const query = `
    SELECT p.id, p.name, p.price, p.emoji, p.image, c.quantity
    FROM cart_items c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?`;

    db.all(query, [user.id], (err, rows) => {
        if (err) return res.status(500).send('장바구니 조회 실패');
        res.render('cart', { cartItems: rows, user });
    });
});

// 주소창: .../cart/update
router.post('/update', (req, res) => {
    if (!req.session.user) return res.redirect('../login_required');
    const userId = req.session.user.id;
    const productId = req.body.productId;
    const action = req.body.action;

    db.get(`SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId], (err, row) => {
        if (err || !row) return res.status(500).send("조회 실패");

        let newQuantity = row.quantity;
        if (action === 'increase') newQuantity += 1;
        else if (action === 'decrease') newQuantity -= 1;

        if (newQuantity <= 0) {
            db.run(`DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId], (err) => {
                return res.redirect('../cart');
            });
        } else {
            db.run(`UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?`, [newQuantity, userId, productId], (err) => {
                return res.redirect('../cart');
            });
        }
    });
});

// 주소창: .../cart/delete
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;
    if (!user) return res.redirect('../user/login');

    const query = `DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('삭제 실패');
        res.redirect('../cart');
    });
});

module.exports = router;