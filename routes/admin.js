const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 실행 위치와 관계없이 현재 파일 폴더 기준으로 DB 경로를 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 관리자 권한 검증 미들웨어
function isAdmin(req, res, next) {
    const user = req.session.user;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        // ⭕ [교정] 주소창: /admin/하위경로 (2~3단계 깊이) -> 부모 계층 밖의 user/login으로 안전하게 유도
        res.send('<script>alert("관리자 권한이 필요합니다."); location.href="../user/login";</script>');
    }
}

// 1. 통합 관리자 통제실 (대시보드 메인)
router.get('/', isAdmin, (req, res) => {
    // views/admin/dashboard.ejs 템플릿을 렌더링합니다.
    res.render('admin/dashboard');
});

// 2. 가입 회원 관리 목록
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        // views/admin/users.ejs 렌더링
        res.render('admin/users', { users: rows });
    });
});

// 3. 진열 상품 관리 목록
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 대장 조회 실패');
        // views/admin/products.ejs 렌더링
        res.render('admin/products', { products: rows });
    });
});

// 4. 신규 상품 등록 폼 이동
router.get('/products/new', isAdmin, (req, res) => {
    // views/admin/products_new.ejs 렌더링
    res.render('admin/products_new');
});

// 신규 상품 등록 처리
router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        // ⭕ [교정] 주소창: /admin/products/new (3단계 깊이) -> 한 단계 위인 상품 목록 스코프(../products)로 안전 복귀
        res.send('<script>alert("신규 상품이 등록되었습니다."); location.href="../products";</script>');
    });
});

// 5. 기존 상품 수정 폼 이동
router.get('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품 정보를 찾을 수 없습니다.');
        // views/admin/products_edit.ejs 렌더링
        res.render('admin/products_edit', { product: row });
    });
});

// 기존 상품 수정 처리
router.post('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    const { name, price, emoji, description, image, status } = req.body;
    const query = `UPDATE products SET name=?, price=?, emoji=?, description=?, image=?, status=? WHERE id=?`;

    db.run(query, [name, price, emoji, description, image, status, productId], (err) => {
        if (err) return res.status(500).send('상품 정보 수정 실패');
        // ⭕ [교정] 주소창: /admin/products/edit/아이디 (4단계 깊이) -> 두 단계 위인 상품 목록 스코프(../../products)로 탈출 회군
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 6. 상품 삭제 처리
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        // ⭕ [교정] 주소창: /admin/products/delete/아이디 (4단계 깊이) -> 두 단계 위 상품 목록(../../products)으로 복귀
        res.send('<script>alert("상품이 성공적으로 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 7. 배송/주문 관리 목록 조회
router.get('/orders', isAdmin, (req, res) => {
    const query = `
        SELECT o.id AS orderId, o.total_price AS totalPrice, o.status, o.created_at AS createdAt, u.name AS userName
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('전체 주문 대장 조회 실패');
        // views/admin/orders.ejs 렌더링
        res.render('admin/orders', { orders: rows });
    });
});

// 배송 상태 업데이트 처리
router.post('/orders/update-status', isAdmin, (req, res) => {
    const { orderId, status } = req.body;
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');
        // ⭕ [교정] 주소창: /admin/orders/update-status (3단계 깊이) -> 한 단계 위인 주문 관리 스코프(../orders)로 회군
        res.send('<script>alert("배송 및 주문 상태가 변경되었습니다."); location.href="../orders";</script>');
    });
});

module.exports = router;