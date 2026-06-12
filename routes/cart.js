const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 장바구니에 담기
router.post('/add', (req, res) => {
    const user = req.session.user;
    const productId = req.body.productId;

    if (!user) {
        return res.status(401).render('login_required', {
            message: '장바구니 담기 위해서는 로그인이 필요합니다.',
            // ⭕ [교정] 주소창: /cart/add (2단계) -> 한 단계 위 부모 계층에서 user/login 매핑 (../user/login)
            redirectUrl: '../user/login'
        });
    }

    const query = `INSERT INTO cart_items (user_id, product_id, quantity) 
                 VALUES (?, ?, 1) 
                 ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + 1`;

    db.run(query, [user.id, productId], function (err) {
        if (err) {
            console.error('장바구니 추가 오류:', err.message);
            return res.status(500).send('장바구니 추가 실패');
        }

        res.send(`
            <script>
                if (confirm("장바구니에 상품이 정상적으로 담겼습니다.\\n장바구니 페이지로 이동하시겠습니까?")) {
                    // ⭕ [교정] 주소창: /cart/add (2단계) -> 한 단계 위 부모 폴더에서 cart 메인 리스트 바인딩 (../cart)
                    location.href = "../cart";
                } else {
                    history.back();
                }
            </script>
        `);
    });
});

// 장바구니 목록 조회
router.get('/', (req, res) => {
    const user = req.session.user;
    // ⭕ [교정] 주소창: /cart (1단계 메인 깊이) -> 현재 계층 기준 동일 선상의 user/login 경로 호출 (user/login)
    if (!user) return res.redirect('user/login');

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

// 장바구니 수량 조절
router.post('/update', (req, res) => {
    if (!req.session.user) {
        // ⭕ [교정] 주소창: /cart/update (2단계) -> 한 단계 위 부모 폴더 기준으로 login_required 렌더링용 리다이렉트
        return res.redirect('../login_required');
    }
    const userId = req.session.user.id;
    const productId = req.body.productId;
    const action = req.body.action;

    db.get(`SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId], (err, row) => {
        if (err || !row) {
            return res.status(500).send("조회 실패");
        }

        let newQuantity = row.quantity;
        if (action === 'increase') {
            newQuantity += 1;
        } else if (action === 'decrease') {
            newQuantity -= 1;
        }

        if (newQuantity <= 0) {
            db.run(`DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`, [userId, productId], (err) => {
                // ⭕ [교정] 주소창: /cart/update (2단계) -> 한 단계 위 부모 디렉토리인 cart 리스트 메인으로 복귀 (../cart)
                return res.redirect('../cart');
            });
        } else {
            db.run(`UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?`, [newQuantity, userId, productId], (err) => {
                // ⭕ [교정] 주소창: /cart/update (2단계) -> 한 단계 위 부모 디렉토리인 cart 리스트 메인으로 복귀 (../cart)
                return res.redirect('../cart');
            });
        }
    });
});

// 장바구니 항목 전체 삭제
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    // ⭕ [교정] 주소창: /cart/delete (2단계) -> 한 단계 위 부모 계층 밖의 user/login 타겟팅 (../user/login)
    if (!user) return res.redirect('../user/login');

    const query = `DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`;
    db.run(query, [user.id, productId], (err) => {
        if (err) {
            return res.status(500).send('삭제 실패');
        }
        // ⭕ [교정] 주소창: /cart/delete (2단계) -> 한 단계 위 부모 디렉토리인 cart 리스트 메인으로 회군 (../cart)
        res.redirect('../cart');
    });
});

module.exports = router;