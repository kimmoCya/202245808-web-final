const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// ==================================================
// 1. 상품 상세나 목록에서 [장바구니 추가] 버튼 타격 구역 (주소창: .../cart/add)
// ==================================================
router.post('/add', (req, res) => {
    const user = req.session.user;
    const productId = req.body.productId;

    if (!user) {
        // 🚩 [완벽 보정] 주소창이 /cart/add (3단계) 상태이므로
        // ../../ 로 완전히 학번 루트 디렉토리 계층까지 탈출한 뒤, 순수 단어 'user/login' 을 찔러야 정확히 도달함!
        return res.send(`
            <script>
                alert('장바구니를 담기 위해서는 로그인이 필요합니다.');
                location.href = '../../user/login';
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

        // 형이 원하던 O, X 팝업 선택 모달 제어판 주소창 정규화 완료
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

// ==================================================
// 2. 장바구니 메인 목록 화면 진입 (주소창: .../cart)
// ==================================================
router.get('/', (req, res) => {
    const user = req.session.user;

    // 🚩 [핵심 교정 가드] 주소창에 슬래시 없는 순수 /cart (2단계) 상태로 진입했을 때 비로그인이면
    // 한 단계 위인 학번 루트로 후퇴한 뒤(../), user/login 으로 꽂아야 주소창이 깨지지 않습니다!
    if (!user) {
        return res.redirect('../user/login');
    }

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

// ==================================================
// 3. 장바구니 수량 증감 제어 구역 (주소창: .../cart/update)
// ==================================================
router.post('/update', (req, res) => {
    // 세션 튕김 방어 주소 매핑 보정
    if (!req.session.user) return res.redirect('../../user/login');

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

// ==================================================
// 4. 장바구니 특정 품목 완전 제거 (주소창: .../cart/delete)
// ==================================================
router.post('/delete', (req, res) => {
    const user = req.session.user;
    const { productId } = req.body;

    // 세션 튕김 방어 주소 매핑 보정
    if (!user) return res.redirect('../../user/login');

    const query = `DELETE FROM cart_items WHERE user_id = ? AND product_id = ?`;
    db.run(query, [user.id, productId], (err) => {
        if (err) return res.status(500).send('삭제 실패');
        res.redirect('../cart');
    });
});

module.exports = router;