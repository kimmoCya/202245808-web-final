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

// 회원 권한 변경 처리 POST 라우터
router.post('/users/update-role', isAdmin, (req, res) => {
    const { userId, role } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
        if (err) return res.status(500).send('회원 권한 변경 실패');
        res.send('<script>alert("회원 권한이 성공적으로 변경되었습니다."); location.href="../users";</script>');
    });
});

// 🚩 [신설 - 시체 파기 구역] 탈퇴 완료된 회원 레코드 영구 삭제 (Hard Delete)
router.post('/users/remove-permanent', isAdmin, (req, res) => {
    const { userId } = req.body;

    // 데이터베이스 users 테이블에서 해당 유저 데이터 완벽하게 행 삭제
    db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
            console.error('시체 파기 실패:', err.message);
            return res.status(500).send('회원 데이터 영구 삭제 실패');
        }

        // 🚩 [주소 교정] 치우기 완료 후 끝에 슬래시가 붙지 않는 깔끔한 /admin/users 상태로 내비게이션 점프
        res.send(`
            <script>
                alert("해당 계정의 모든 개인정보 및 시체 데이터가 DB에서 영구 삭제되었습니다.");
                location.href = "../users";
            </script>
        `);
    });
});

// 기존의 소프트 강제 탈퇴 라우터 (시체 보관 상태로 전환)
router.post('/users/kick', isAdmin, (req, res) => {
    const { userId } = req.body;
    db.run('UPDATE users SET is_withdrawn = 1 WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).send('강제 탈퇴 처리 실패');
        res.send('<script>alert("해당 회원을 강제 탈퇴 처리(시체 보관) 하였습니다."); location.href="../users";</script>');
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

    if (currentStatus === '결제완료' || currentStatus === '배송준비중') {
        nextStatus = '배송중';
    } else if (currentStatus === '배송중') {
        nextStatus = '배송완료';
    } else {
        return res.send('<script>location.href="../orders";</script>');
    }

    db.run('UPDATE orders SET status = ? WHERE id = ?', [nextStatus, orderId], (err) => {
        if (err) return res.status(500).send('배송 상태 업데이트 실패');

        res.send(`
            <script>
                alert('주문 상태가 [ ${nextStatus} ] 상태로 변경 처리 완료되었습니다.');
                location.href = '../orders';
            </script>
        `);
    });
});

module.exports = router;