const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.sqlite');

// 주문 내역 조회
router.get('/history', (req, res) => {
    const sessionUser = req.session.user;

    if (!sessionUser) {
        return res.send('<script>alert("로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `
        SELECT 
            o.id AS orderId,
            o.total_price AS totalPrice,
            o.status,
            o.created_at AS createdAt,
            oi.quantity,
            oi.price,
            p.name,
            p.emoji
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE o.user_id = ?
    `;

    db.all(query, [sessionUser.id], (err, rows) => {
        if (err) {
            console.error('주문 결제 내역 조회 오류:', err.message);
            return res.status(500).send('주문 내역 조회 에러');
        }

        const orderGroups = {};
        rows.forEach(row => {
            if (!orderGroups[row.orderId]) {
                orderGroups[row.orderId] = {
                    orderId: row.orderId,
                    totalPrice: row.totalPrice,
                    status: row.status,
                    createdAt: row.createdAt,
                    items: []
                };
            }
            orderGroups[row.orderId].items.push({
                name: row.name,
                emoji: row.emoji,
                quantity: row.quantity,
                price: row.price
            });
        });

        let ordersArray = Object.values(orderGroups);
        ordersArray.sort((a, b) => b.orderId - a.orderId);

        res.render('order_history.ejs', {
            orders: ordersArray
        });
    });
});

// 주문서 작성 페이지 이동
router.post('/confirm', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.send('<script>alert("로그인이 필요합니다."); location.href="/user/login";</script>');
    }

    const query = `
        SELECT p.id AS product_id, p.name, p.price, p.emoji, p.image, c.quantity
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?`;

    db.all(query, [user.id], (err, cartRows) => {
        if (err || !cartRows || cartRows.length === 0) {
            return res.send('<script>alert("장바구니가 비어 있거나 상품 정보 조회에 실패하여 주문을 진행할 수 없습니다."); location.href="/cart";</script>');
        }

        const orderItems = cartRows.map(row => {
            return {
                product_id: row.product_id,
                name: row.name,
                price: row.price,
                emoji: row.emoji,
                quantity: row.quantity,
                total: row.price * row.quantity
            };
        });

        const totalPrice = orderItems.reduce((sum, item) => sum + item.total, 0);

        res.render('order_form.ejs', {
            user,
            orderItems,
            totalPrice
        });
    });
});

// 결제 처리 완료 로직
router.post('/checkout', (req, res) => {
    const user = req.session.user;

    if (!user) return res.status(401).send('로그인이 필요합니다.');

    const query = `
        SELECT p.id AS product_id, p.price, c.quantity
        FROM cart_items c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ?`;

    db.all(query, [user.id], (err, cartRows) => {
        if (err || !cartRows || cartRows.length === 0) {
            return res.send('<script>alert("주문할 상품이 존재하지 않습니다."); location.href="/cart";</script>');
        }

        let totalPrice = 0;
        cartRows.forEach(row => {
            totalPrice += row.price * row.quantity;
        });

        db.serialize(() => {
            db.run('INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)', [user.id, totalPrice, '배송준비중'], function(err1) {
                if (err1) return res.status(500).send('주문 처리 실패');

                const orderId = this.lastID;
                const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
                cartRows.forEach(row => {
                    stmt.run(orderId, row.product_id, row.quantity, row.price);
                });

                stmt.finalize((err2) => {
                    if (err2) return res.status(500).send('상세 품목 저장 실패');

                    db.run('DELETE FROM cart_items WHERE user_id = ?', [user.id], (err3) => {
                        if (err3) console.error('장바구니 비우기 오류:', err3.message);
                        res.send('<script>alert("주문 및 결제가 완료되었습니다."); location.href="/mypage";</script>');
                    });
                });
            });
        });
    });
});

// 주문 취소 처리 로직 (배송준비중 상태의 주문 정보 삭제)
router.post('/cancel', (req, res) => {
    const user = req.session.user;
    const { orderId } = req.body;

    if (!user) return res.status(401).send('로그인이 필요합니다.');

    db.get('SELECT status FROM orders WHERE id = ? AND user_id = ?', [orderId, user.id], (err, row) => {
        if (err || !row) return res.status(404).send('주문 정보를 찾을 수 없습니다.');

        if (row.status !== '배송준비중') {
            return res.send('<script>alert("이미 배송이 진행 중인 상품은 취소가 불가능합니다."); location.href="/order/history";</script>');
        }

        db.serialize(() => {
            db.run('DELETE FROM order_items WHERE order_id = ?', [orderId], (err1) => {
                if (err1) return res.status(500).send('상세 내역 취소 실패');

                db.run('DELETE FROM orders WHERE id = ? AND user_id = ?', [orderId, user.id], (err2) => {
                    if (err2) return res.status(500).send('주문 취소 에러');
                    res.send('<script>alert("주문이 정상적으로 취소 및 환불 처리되었습니다."); location.href="/order/history";</script>');
                });
            });
        });
    });
});

module.exports = router;