const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 관리자 권한 체크 미들웨어
function isAdmin(req, res, next) {
    const user = req.session.user;
    if (user && user.role === 'ADMIN') {
        next();
    } else {
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

// 회원 목록 조회
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, name, role, is_withdrawn FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 명부 조회 실패');
        res.render('admin/users', { users: rows });
    });
});

// 회원 권한 변경
router.post('/users/update-role', isAdmin, (req, res) => {
    const { userId, role } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
        if (err) return res.status(500).send('회원 권한 변경 실패');
        res.send('<script>alert("회원 권한 등급이 변경되었습니다."); location.href="../users";</script>');
    });
});

// 탈퇴 회원 영구 삭제
router.post('/users/remove-permanent', isAdmin, (req, res) => {
    const { userId } = req.body;
    db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
            console.error('회원 영구 삭제 실패:', err.message);
            return res.status(500).send('회원 데이터 삭제 실패');
        }
        res.send(`<script>alert("선택하신 회원 계정 및 개인정보가 완전히 삭제되었습니다."); location.href = "../users";</script>`);
    });
});

// 강제 탈퇴 처리
router.post('/users/kick', isAdmin, (req, res) => {
    const { userId } = req.body;
    db.run('UPDATE users SET is_withdrawn = 1 WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).send('강제 탈퇴 처리 실패');
        res.send('<script>alert("해당 회원이 강제 탈퇴 처리되었습니다."); location.href="../users";</script>');
    });
});

// 등록 상품 목록 조회
router.get('/products', isAdmin, (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 목록 조회 실패');
        res.render('admin/products', { products: rows });
    });
});

// 신규 상품 등록 서식 페이지
router.get('/products/new', isAdmin, (req, res) => {
    res.render('admin/products_new');
});

// 신규 상품 등록 처리
router.post('/products/new', isAdmin, (req, res) => {
    const { name, price, emoji, description, image, status } = req.body;
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(query, [name, price, emoji, description, image, status || '일반'], function(err) {
        if (err) return res.status(500).send('상품 등록 실패');
        res.send('<script>alert("신규 상품이 정상적으로 등록되었습니다."); location.href="../products";</script>');
    });
});

// 상품 정보 수정 페이지 호출
router.get('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품 정보를 찾을 수 없습니다.');
        res.render('admin/products_edit', { product: row });
    });
});

// 상품 정보 수정 및 비동기 상태 변경 통합 처리
router.post('/products/edit/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    const { name, price, emoji, description, image, status } = req.body;

    // 비동기 요청 시 누락되는 데이터 오염을 막기 위해 기존 데이터 선조회
    db.get('SELECT * FROM products WHERE id = ?', [productId], (searchErr, currentProduct) => {
        if (searchErr || !currentProduct) return res.status(404).send('상품 정보를 찾을 수 없습니다.');

        // 값이 누락되어 들어오면 기존 DB에 저장되어 있던 원본 값 유지
        const finalName = name || currentProduct.name;
        const finalPrice = price || currentProduct.price;
        const finalEmoji = emoji || currentProduct.emoji;
        const finalDescription = (description !== undefined) ? description : currentProduct.description;
        const finalImage = (image && image.trim() !== '') ? image : currentProduct.image; // 빈 값 유입 시 기존 파일명 사수
        const finalStatus = status || currentProduct.status;

        const query = `UPDATE products SET name=?, price=?, emoji=?, description=?, image=?, status=? WHERE id=?`;

        db.run(query, [finalName, finalPrice, finalEmoji, finalDescription, finalImage, finalStatus, productId], (err) => {
            if (err) return res.status(500).send('상품 정보 수정 실패');

            // 관리대장 셀렉트 박스를 통한 비동기 JSON 요청인 경우 200 성공만 반환
            if (req.headers['content-type'] === 'application/json') {
                return res.sendStatus(200);
            }

            // 일반 폼 수정 요청인 경우 알림창 출력 후 리다이렉트
            res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="../../products";</script>');
        });
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

// 전체 주문 내역 가져오기
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

// 주문 배송 단계 변경
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
        res.send(`<script>alert('주문 상태가 [${nextStatus}] 상태로 변경되었습니다.'); location.href = '../orders';</script>`);
    });
});

module.exports = router;