const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 로그인 세션 확인해서 관리자(ADMIN)인지 검사하는 미들웨어
function isAdmin(req, res, next) {
    const user = req.session.user;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
        // 실제 사이트처럼 안내 문구 수정
        res.send('<script>alert("관리자 권한이 없습니다. 관리자 계정으로 로그인해주세요."); location.href="../user/login";</script>');
    }
}

// 관리자 메인 대시보드
router.get('/', isAdmin, (req, res) => {
    if (!req.originalUrl.endsWith('/')) {
        return res.redirect(req.originalUrl + '/');
    }
    res.render('admin/dashboard');
});

// 회원 목록 조회 화면 (.../stud19/admin/users)
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        res.render('admin/users', { users: rows });
    });
});

// 회원 권한 변경 (일반회원 <-> 관리자 등)
router.post('/users/update-role', isAdmin, (req, res) => {
    const { userId, role } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
        if (err) return res.status(500).send('회원 권한 변경 실패');
        res.send('<script>alert("회원 권한 등급이 변경되었습니다."); location.href="../users";</script>');
    });
});

// 탈퇴 완료된 회원 데이터베이스에서 완전히 삭제하기
router.post('/users/remove-permanent', isAdmin, (req, res) => {
    const { userId } = req.body;

    // users 테이블에서 해당 id 데이터를 행 삭제
    db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
            console.error('회원 영구 삭제 실패:', err.message);
            return res.status(500).send('회원 데이터 삭제 실패');
        }

        // 쇼핑몰 표준 텍스트로 보정 및 가상 디렉토리 주소창 유지
        res.send(`
            <script>
                alert("선택하신 회원 계정 및 개인정보가 완전히 삭제되었습니다.");
                location.href = "../users";
            </script>
        `);
    });
});

// 강제 탈퇴 처리하기 (우선은 withdrawn 플래그만 1로 업데이트해서 보관)
router.post('/users/kick', isAdmin, (req, res) => {
    const { userId } = req.body;
    db.run('UPDATE users SET is_withdrawn = 1 WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).send('강제 탈퇴 처리 실패');
        res.send('<script>alert("해당 회원이 강제 탈퇴 처리되었습니다."); location.href="../users";</script>');
    });
});

// 등록된 상품 목록 대장 조회 (.../stud19/admin/products)
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 목록 조회 실패');
        res.render('admin/products', { products: rows });
    });
});

// 신규 상품 등록 서식 페이지 진입
router.get('/products/new', isAdmin, (req, res) => {
    res.render('admin/products_new');
});

// 신규 상품 등록 DB Insert 처리
router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        res.send('<script>alert("신규 상품이 정상적으로 등록되었습니다."); location.href="../products";</script>');
    });
});

// 상품 정보 수정 화면 가져오기
router.get('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품 정보를 찾을 수 없습니다.');
        res.render('admin/products_edit', { product: row });
    });
});

// 상품 정보 수정 완료 처리 Update
router.post('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    const { name, price, emoji, description, image, status } = req.body;
    const query = `UPDATE products SET name=?, price=?, emoji=?, description=?, image=?, status=? WHERE id=?`;

    db.run(query, [name, price, emoji, description, image, status, productId], (err) => {
        if (err) return res.status(500).send('상품 정보 수정 실패');
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
    });
});

// 상품 삭제 처리
router.post('/products/delete/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.status(500).send('상품 삭제 실패');
        res.send('<script>alert("선택하신 상품이 삭제되었습니다."); location.href="../../products";</script>');
    });
});

// 전체 주문 내역 가져오기 (배송 완료된 주문은 리스트에서 제외)
router.get('/orders', isAdmin, (req, res) => {
    const query = `
        SELECT o.id AS orderId, o.total_price AS totalPrice, o.status, o.created_at AS createdAt, u.name AS userName
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.status != '배송완료'
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('전체 주문 내역 조회 실패');
        res.render('admin/orders', { orders: rows });
    });
});

// 주문 배송 단계 변경 처리
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
                alert('주문 상태가 [${nextStatus}] 상태로 변경되었습니다.');
                location.href = '../orders';
            </script>
        `);
    });
});

module.exports = router