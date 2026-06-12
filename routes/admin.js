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
        res.send('<script>alert("접근 권한이 없습니다. 관리자만 가능합니다."); location.href="/";</script>');
    }
}

router.use(isAdmin);

router.get('/', (req, res) => {
    res.render('admin/dashboard', { user: req.session.user });
});

router.get('/users', (req, res) => {
    db.all('SELECT id, username, name, email, phone, role, is_withdrawn FROM users ORDER BY is_withdrawn ASC, id DESC', (err, rows) => {
        if (err) return res.status(500).send('회원 조회 실패');
        res.render('admin/users', { users: rows, user: req.session.user });
    });
});

router.post('/user/update-role', (req, res) => {
    const { userId, role } = req.body;
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
        if (err) return res.status(500).send('등급 변경 에러');
        res.send('<script>alert("회원 등급이 성공적으로 업데이트되었습니다."); location.href="/admin/users";</script>');
    });
});

router.post('/user/kick', (req, res) => {
    const { userId } = req.body;
    db.run('UPDATE users SET is_withdrawn = 1 WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).send('회원 강제 탈퇴 에러');
        res.send('<script>alert("해당 회원이 강제 탈퇴 처리되었습니다."); location.href="/admin/users";</script>');
    });
});

router.get('/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY id DESC', (err, rows) => {
        if (err) return res.status(500).send('상품 조회 에러');
        res.render('admin/products', { products: rows, user: req.session.user });
    });
});

router.get('/products/new', (req, res) => {
    res.render('admin/products_new', { user: req.session.user });
});

router.post('/products/add', (req, res) => {
    const { name, price, description, image, status } = req.body;
    const emoji = '🥤';
    const query = `INSERT INTO products (name, price, emoji, description, image, status) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [name, price, emoji, description, image || 'default.png', status || '일반'], (err) => {
        if (err) return res.status(500).send('상품 추가 에러');
        res.send('<script>alert("신규 상품이 등록되었습니다."); location.href="/admin/products";</script>');
    });
});

router.get('/products/edit/:id', (req, res) => {
    const productId = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
        if (err || !row) return res.status(404).send('상품을 찾을 수 없습니다.');
        res.render('admin/products_edit', { product: row, user: req.session.user });
    });
});

router.post('/products/edit/:id', (req, res) => {
    const productId = req.params.id;
    const { name, price, description, image, status } = req.body;
    const emoji = '🥤';
    const query = `UPDATE products SET name = ?, price = ?, emoji = ?, description = ?, image = ?, status = ? WHERE id = ?`;
    db.run(query, [name, price, emoji, description, image || 'default.png', status, productId], (err) => {
        if (err) return res.status(500).send('상품 수정 에러');
        res.send('<script>alert("상품 정보가 수정되었습니다."); location.href="/admin/products";</script>');
    });
});

router.post('/products/update-status', (req, res) => {
    const { id, status } = req.body;
    db.run('UPDATE products SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true });
    });
});

router.post('/products/delete', (req, res) => {
    const { productId } = req.body;
    db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
        if (err) return res.json({ success: false });
        res.json({ success: true });
    });
});

router.get('/orders', (req, res) => {
    const query = `
        SELECT o.id AS order_id, o.total_price, o.status, o.created_at, u.name AS user_name, u.username
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.status != '배송완료'
        ORDER BY o.id DESC`;

    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('주문 조회 에러');
        res.render('admin/orders', { orders: rows, user: req.session.user });
    });
});

router.post('/orders/update-batch', (req, res) => {
    let { orderIds, newStatuses } = req.body;

    if (!orderIds || !newStatuses) {
        return res.send('<script>alert("수정할 내역이 없습니다."); location.href="/admin/orders";</script>');
    }

    if (!Array.isArray(orderIds)) {
        orderIds = [orderIds];
        newStatuses = [newStatuses];
    }

    db.serialize(() => {
        const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
        for (let i = 0; i < orderIds.length; i++) {
            stmt.run(newStatuses[i], orderIds[i]);
        }
        stmt.finalize((err) => {
            if (err) return res.status(500).send('일괄 수정 실패');
            res.send('<script>alert("배송 상태가 일괄 적용되었습니다."); location.href="/admin/orders";</script>');
        });
    });
});

module.exports = router;