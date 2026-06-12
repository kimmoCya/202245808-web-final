const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

function isAdmin(req, res, next) {
    const user = req.session.user;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        res.send('<script>alert("관리자 권한이 필요합니다."); location.href="../user/login";</script>');
    }
}

router.get('/', isAdmin, (req, res) => {
    if (!req.originalUrl.endsWith('/')) {
        return res.redirect(req.originalUrl + '/');
    }
    res.render('admin/dashboard');
});

// 주소창: .../stud19/admin/users
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        res.render('admin/users', { users: rows });
    });
});

// 주소창: .../stud19/admin/products
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 대장 조회 실패');
        res.render('admin/products', { products: rows });
    });
});

// 주소창: .../stud19/admin/products/new
router.get('/products/new', isAdmin, (req, res) => {
    res.render('admin/products_new');
});

router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        res.send('<script>alert("신규 상품이 등록되었습니다."); location.href="../products";</script>');
    });
});

// 주소창: .../stud19/admin/products/edit/:id
router.get('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품 정보를 찾을 수 없습니다.');
        res.render('admin/products_edit', { product: row });
    });
});

router.post('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    const { name, price, emoji, description, image, status } = req.body;
    const query = `UPDATE products SET name=?, price=?, emoji=?, description=?, image=?, status=? WHERE id=?`;

    db.run(query, [name, price, emoji, description, image, status, productId], (err) => {
        if (err) return res.status(500).send('상품 정보 수정 실패');
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 주소창: .../stud19/admin/products/delete/:id
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        res.send('<script>alert("상품이 성공적으로 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 주소창: .../stud19/admin/orders
router.get('/orders', isAdmin, (req, res) => {
    // 🚩 [핵심 보정] 배송 완료된 주문 내역은 일괄 처리장 리스트에서 아예 안 보이게 SQL 조건절 추가
    const query = `
        SELECT o.id AS orderId, o.total_price AS totalPrice, o.status, o.created_at AS createdAt, u.name AS userName
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.status != '배송완료'
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('전체 주문 대장 조회 실패');
        res.render('admin/orders', { orders: rows });
    });
});

// 주소창: .../stud19/admin/orders/update-status
router.post('/orders/update-status', isAdmin, (req, res) => {
    const { orderId, currentStatus } = req.body;
    let nextStatus = '';

    // 🚩 [핵심 구현] 버튼 단 하나로 단계를 유기적으로 토글시키는 변환 로직
    if (currentStatus === '결제완료') {
        nextStatus = '배송중';
    } else if (currentStatus === '배송중') {
        nextStatus = '배송완료';
    } else {
        // 이미 배송완료 상태인 내역은 예외 조치로 목록 복귀
        return res.send('<script>location.href="../orders";</script>');
    }

    db.run('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');

        // 데이터 수정 성공 후 알림 띄우고 주문 처리 대장으로 복귀 처리
        res.send(`
            <script>
                alert('주문 상태가 [ ${nextStatus} ] 상태로 변경 처리 완료되었습니다.');
                location.href = '../orders';
            </script>
        `);
    });
});

module.exports = router;