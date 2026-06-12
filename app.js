const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const http = require('http');

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

// app 객체 선언
const app = express();

// SQLite 데이터베이스 연결 설정
const dbPath = path.join(__dirname, 'db/database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB 연결 오류:', err.message);
    else console.log('SQLite 데이터베이스 연결 성공');
});

db.serialize(() => {
    // 회원 테이블 초기화
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

    // 위시리스트 테이블 초기화
    db.run(`CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, product_id)
    )`);

    // 주문 테이블 초기화
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, total_price INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT '배송준비중'`, (err) => {});

    // 주문 상세 항목 테이블 초기화
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, quantity INTEGER, price INTEGER
    )`);

    // 상품 테이블 초기화
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price INTEGER, emoji TEXT, description TEXT, image TEXT, is_featured INTEGER DEFAULT 0, likes INTEGER DEFAULT 0
    )`);
    db.run(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT '일반'`, (err) => {});

    // 파일 테이블 초기화
    db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      filename TEXT,
      filepath TEXT
    )
    `);

    // 최고 관리자 마스터 계정 초기 시딩
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

// 전역 유저 세션 핸들러
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ==========================================
// ✨ [실습 서버 멀티유저 인프라 자동화 세팅]
// ==========================================

// 1. 현재 리눅스 로그인 계정명(stud2, stud19 등)을 자동으로 인식합니다.
const currentStudent = process.env.USER || '';
const isServerEnvironment = currentStudent.startsWith('stud');

// 2. 서버 환경이면 '/stud2', 로컬 PC 환경이면 기존대로 ''(빈값)이 기본 주소가 됩니다.
const basePath = isServerEnvironment ? `/${currentStudent}` : '';

// 3. 계정 번호에 맞춰서 포트 자동 연산 (stud2 -> 3002, stud19 -> 3019)
let defaultPort = '3000';
if (isServerEnvironment) {
    const match = currentStudent.match(/stud(\d+)/);
    if (match) {
        defaultPort = String(3000 + parseInt(match[1], 10));
    }
}
const port = normalizePort(process.env.PORT || defaultPort);
app.set('port', port);

// 4. 모든 라우터에 자동으로 계정별 basePath(/stud2 등)를 동적으로 주입합니다.
app.use(basePath + '/', indexRouter);
app.use(basePath + '/users', usersRouter);
app.use(basePath + '/user', userRouter);
app.use(basePath + '/board', boardRouter);
app.use(basePath + '/products', productRouter);
app.use(basePath + '/cart', cartRouter);
app.use(basePath + '/order', orderRouter);
app.use(basePath + '/mypage', mypageRouter);
app.use(basePath + '/wishlist', wishlistRouter);
app.use(basePath + '/admin', adminRouter);

app.get(basePath + '/login', (req, res) => { res.redirect(`${basePath}/user/login`); });

// 404 및 에러 핸들러
app.use(function(req, res, next) { next(createError(404)); });
app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

// 5. 서버 진짜 구동하기 (listen 코드 내장)
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`[*] 학과 실습 서버 멀티유저 라우팅 맵핑 완료!`);
    console.log(`[*] 현재 실행 계정: ${currentStudent || '로컬 PC 개발 환경'}`);
    console.log(`[*] 오픈된 포트: ${port}번`);
    console.log(`[*] 접속 테스트 주소: http://10.125.234.122${basePath || ':3000'}`);
    console.log(`==================================================\n`);
});

function normalizePort(val) {
    var port = parseInt(val, 10);
    if (isNaN(port)) return val;
    if (port >= 0) return port;
    return false;
}

module.exports = app;