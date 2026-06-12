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
        // ⭕ [교정] 권한 부족 시 상위 계층 밖의 로그인 페이지로 정확히 유도
        res.send('<script>alert("관리자 권한이 필요합니다."); location.href="../user/login";</script>');
    }
}

// 1. 기존 /admin 으로 들어오면 자동으로 /admin/dashboard 로 안전하게 포워딩합니다.
router.get('/', isAdmin, (req, res) => {
    // ⭕ [버그 해결 핵심] 중복 매핑 탈출 가드: 슬래시를 붙이거나 덧붙이지 않고,
    // /admin 스코프 바로 뒤에 결합되도록 상대 디렉터리 경로 파일명 지정 방식으로 명시적 리다이렉트합니다.
    res.redirect('./admin/dashboard');
});

// 2. 진짜 관리자 통제실 메인 화면 (주소창: /admin/dashboard -> 3단계 깊이 완벽 고정)
router.get('/dashboard', isAdmin, (req, res) => {
    // views/admin/dashboard.ejs 템플릿을 깨끗하게 렌더링합니다.
    res.render('admin/dashboard');
});

// 3. 가입 회원 관리 목록 (주소창: /admin/users -> 3단계 깊이)
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        res.render('admin/users', { users: rows });
    });
});

// 4. 진열 상품 관리 목록 (주소창: /admin/products -> 3단계 깊이)
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 대장 조회 실패');
        res.render('admin/products', { products: rows });
    });
});

// 5. 신규 상품 등록 폼 이동 (주소창: /admin/products/new -> 4단계 깊이)
router.get('/products/new', isAdmin, (req, res) => {
    res.render('admin/products_new');
});

// 신규 상품 등록 처리
router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        // ⭕ [교정] 주소창이 4단계 깊이이므로, 한 단계 위인 상품 목록 스코프(../products)로 안전 회군
        res.send('<script>alert("신규 상품이 등록되었습니다."); location.href="../products";</script>');
    });
});

// 6. 기존 상품 수정 폼 이동 (주소창: /admin/products/edit/:id)
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
        // ⭕ [교정] 주소창: 5단계 구조 -> 두 단계 위인 상품 목록 스코프(../../products)로 완전 탈출
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 상품 삭제 처리
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        res.send('<script>alert("상품이 성공적으로 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 7. 배송/주문 관리 목록 조회 (주소창: /admin/orders -> 3단계 깊이)
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

// 배송 상태 업데이트 처리
router.post('/orders/update-status', isAdmin, (req, res) => {
    const { orderId, status } = req.body;
    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');
        res.send('<script>alert("배송 및 주문 상태가 변경되었습니다."); location.href="../orders";</script>');
    });
});

module.exports = router;