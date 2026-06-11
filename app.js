const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const userRouter = require('./routes/user');
const boardRouter = require('./routes/board');
const productRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const orderRouter = require('./routes/order');
const mypageRouter = require('./routes/mypage');
const wishlistRouter = require('./routes/wishlist');
const adminRouter = require('./routes/admin');

const app = express();

const dbPath = path.join(__dirname, 'db/database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB 연결 오류:', err.message);
    else console.log('SQLite 데이터베이스 연결 성공');
});

db.serialize(() => {
    // 유저 테이블 생성
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            name TEXT,
            birth TEXT,
            email TEXT,
            address TEXT,
            phone TEXT
        )
    `);

    db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'`, (err) => {});

    db.run(`ALTER TABLE users ADD COLUMN is_withdrawn INTEGER DEFAULT 0`, (err) => {});

    // 위시리스트 테이블 생성
    db.run(`CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, product_id)
    )`);

    // 주문 테이블 생성
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, total_price INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT '배송준비중'`, (err) => {});

    // 주문 상세 아이템 테이블 생성
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, quantity INTEGER, price INTEGER
    )`);

    // 상품 테이블 생성
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price INTEGER, emoji TEXT, description TEXT, image TEXT, is_featured INTEGER DEFAULT 0, likes INTEGER DEFAULT 0
    )`);

    db.run(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT '일반'`, (err) => {});

    // 게시판 첨부파일 테이블 생성
    db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      filename TEXT,
      filepath TEXT
    )
    `);

    // 게시판 공지사항 컬럼 추가
    db.run(`ALTER TABLE posts ADD COLUMN is_notice INTEGER DEFAULT 0`, (err) => {});

    // 관리자 계정 생성
    db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
        if (!row) {
            const hashedAdminPassword = await bcrypt.hash('1234', 10);
            db.run(`INSERT INTO users (username, password, name, role, is_withdrawn) VALUES ('admin', ?, '최고관리자', 'ADMIN', 0)`, [hashedAdminPassword]);
        }
    });
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));

// 로그인 유저 세션 정보 할당
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 라우터 등록
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/user', userRouter);
app.use('/board', boardRouter);
app.use('/products', productRouter);
app.use('/cart', cartRouter);
app.use('/order', orderRouter);
app.use('/mypage', mypageRouter);
app.use('/wishlist', wishlistRouter);
app.use('/admin', adminRouter);

app.get('/login', (req, res) => { res.redirect('/user/login'); });

// 에러 처리
app.use(function(req, res, next) { next(createError(404)); });
app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;