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
        // 경로 검증: 주소창 /admin/ 기준 한 단계 위 루트로 나가서 user/login 이동하므로 원본 상대 경로 규칙 이상 없음
        res.send('<script>alert("관리자 권한이 필요합니다."); location.href="../user/login";</script>');
    }
}

router.get('/', isAdmin, (req, res) => {
    if (!req.originalUrl.endsWith('/')) {
        // 경로 검증: 맨 앞 / 삭제하고 현재 Url 끝에 /만 붙여 리다이렉트하도록 수정 처리 불필요 (Express 내부 프록시 매핑 규격 유지)
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
        // 경로 검증: /admin/products/new 주소창 스코프에서 한 단계 위인 /products로 이동하므로 원본 상대 경로 규칙 이상 없음
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
        // 경로 검증: /admin/products/edit/:id 주소창 스코프에서 두 단계 위 목록인 /products로 이동하므로 원본 상대 경로 규칙 이상 없음
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 주소창: .../stud19/admin/products/delete/:id
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        // 경로 검증: 두 단계 위 목록인 /products로 복귀 처리 검증 완료
        res.send('<script>alert("상품이 성공적으로 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 주소창: .../stud19/admin/orders
router.get('/orders', isAdmin, (req, res) => {
    const query = `
        SELECT o.id AS orderId, o.total_price AS totalPrice, o.status, o.created_at AS createdAt, u.name AS userName
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('전체 주문 대장 조회 실패');
        res.render('admin/orders', { orders: rows });
    });
});

// 주소창: .../stud19/admin/orders/update-status
router.post('/orders/update-status', isAdmin, (req, res) => {
    const { orderId, status } = req.body;
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');
        // 경로 검증: /admin/orders/update-status 주소창 스코프에서 한 단계 위인 /orders로 복귀하므로 원본 상대 경로 규칙 이상 없음
        res.send('<script>alert("배송 및 주문 상태가 변경되었습니다."); location.href="../orders";</script>');
    });
});

module.exports = router;