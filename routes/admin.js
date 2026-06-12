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
        // ⭕ [교정] 주소창 깊이 /admin 기준 -> 한 단계 부모 밖의 user/login으로 안전 유도
        res.send('<script>alert("관리자 권한이 필요합니다."); location.href="../user/login";</script>');
    }
}

// 1. 관리자 메인 통제실 대시보드 진입 (주소창: .../stud19/admin 완벽 안착)
// 주소창 깊이를 2단계로 깔끔하게 유지해야 대시보드 내부의 "products", "users", "orders" 명사 링크들과 복잡한 계산 없이 1:1로 자석처럼 맞물립니다.
router.get('/', isAdmin, (req, res) => {
    // views/admin/dashboard.ejs 템플릿을 깨끗하게 렌더링합니다.
    res.render('admin/dashboard');
});

// 2. 가입 회원 관리 목록 (주소창: .../stud19/admin/users)
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        res.render('admin/users', { users: rows });
    });
});

// 3. 진열 상품 관리 목록 (주소창: .../stud19/admin/products)
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 대장 조회 실패');
        res.render('admin/products', { products: rows });
    });
});

// 4. 신규 상품 등록 폼 이동 (주소창: .../stud19/admin/products/new)
router.get('/products/new', isAdmin, (req, res) => {
    res.render('admin/products_new');
});

// 신규 상품 등록 처리
router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        // ⭕ [교정] 등록 완료 시 현재 주소창 깊이(4단계)에서 한 단계 위인 상품 목록 스코프(../products 즉, /admin/products)로 부드럽게 복귀시킵니다.
        res.send('<script>alert("신규 상품이 등록되었습니다."); location.href="../products";</script>');
    });
});

// 5. 기존 상품 수정 폼 이동 (주소창: .../stud19/admin/products/edit/:id)
router.get('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품 정보를 찾을 수 없습니다.');
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
        // ⭕ [교정] 현재 수정 창의 주소창 깊이는 5단계 구조입니다.
        // 따라서 두 단계 위인 상품 대장 목록 스코프(../../products 즉, /admin/products)로 온전하게 회군시킵니다.
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 6. 상품 삭제 처리 (주소창: .../stud19/admin/products/delete/:id)
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        // ⭕ [교정] 삭제 처리 후 두 단계 위인 상품 대장 목록(../../products)으로 안전하게 리다이렉트 유도합니다.
        res.send('<script>alert("상품이 성공적으로 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 7. 배송/주문 관리 목록 조회 (주소창: .../stud19/admin/orders)
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

// 배송 상태 업데이트 처리 (주소창: .../stud19/admin/orders/update-status)
router.post('/orders/update-status', isAdmin, (req, res) => {
    const { orderId, status } = req.body;
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');
        // ⭕ [교정] 상태 변경 후 한 단계 위인 주문 관리 메인 스코프(../orders 즉, /admin/orders)로 명확히 소환합니다.
        res.send('<script>alert("배송 및 주문 상태가 변경되었습니다."); location.href="../orders";</script>');
    });
});

module.exports = router;