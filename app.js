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

// express 객체 생성
const app = express();

// SQLite 데이터베이스 파일 연결하기
const dbPath = path.join(__dirname, 'db/database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('DB 연결 오류:', err.message);
    else console.log('SQLite 데이터베이스 연결 성공');
});

// 서버 켤 때 필요한 테이블들 자동으로 만들어주는 구역
db.serialize(() => {
    // 1. 회원 정보 테이블
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

    // 기존 테이블에 컬럼 없을 때를 대비해서 ALTER TABLE로 예외 처리해둠
    db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'`, (err) => {});
    db.run(`ALTER TABLE users ADD COLUMN is_withdrawn INTEGER DEFAULT 0`, (err) => {});

    // 2. 위시리스트(찜) 테이블
    db.run(`CREATE TABLE IF NOT EXISTS wishlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, product_id)
    )`);

    // 3. 주문 테이블
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, total_price INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT '배송준비중'`, (err) => {});

    // 4. 주문 상세 품목 테이블
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, quantity INTEGER, price INTEGER
    )`);

    // 5. 상품 테이블
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price INTEGER, emoji TEXT, description TEXT, image TEXT, is_featured INTEGER DEFAULT 0, likes INTEGER DEFAULT 0
    )`);
    db.run(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT '일반'`, (err) => {});

    // 6. 고객센터 게시판 첨부파일 테이블
    db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      filename TEXT,
      filepath TEXT
    )
    `);

    // 처음 서버 실행할 때 관리자 계정(admin/1234) 없으면 자동으로 하나 넣어두기
    db.get("SELECT * FROM users WHERE username = 'admin'", async (err, row) => {
        if (!row) {
            const hashedAdminPassword = await bcrypt.hash('1234', 10);
            db.run(`INSERT INTO users (username, password, name, role, is_withdrawn) VALUES ('admin', ?, '최고관리자', 'ADMIN', 0)`, [hashedAdminPassword]);
        }
    });
});

// 뷰 엔진을 EJS로 설정하고 views 폴더 지정
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// express 기본 미들웨어들 세팅
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// 정적 파일(CSS, 이미지 등)을 불러오기 위한 public 폴더 기본 설정
app.use(express.static(path.join(__dirname, 'public')));

// 로컬 localhost 환경에서도 uploads 폴더 안의 상품 사진들이 안 깨지고 잘 나오도록 추가한 구역
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 세션 사용 설정 (비밀키 고정)
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));

// 모든 EJS 템플릿 화면에서 로그인한 유저 정보(user)를 바로 다이렉트로 쓸 수 있게 해주는 전역 변수 설정
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ==========================================
// 학교 실습 서버 멀티유저 및 포트 자동 할당 구역
// ==========================================
// 교수님이 공지방에 올려주신 조건에 맞춰서 포트 설정하는 부분
const PORT = process.env.PORT || 3000;
const currentStudent = process.env.USER || '';
const isServerEnvironment = currentStudent.startsWith('stud');

// 학번 계정명(stud19 등) 뒤의 숫자를 파싱해서 3000번에 더해주는 자동 포트 계산 로직
let defaultPort = '3000';
if (isServerEnvironment) {
    const match = currentStudent.match(/stud(\d+)/);
    if (match) {
        defaultPort = String(3000 + parseInt(match[1], 10));
    }
}

const port = normalizePort(process.env.PORT ? PORT : defaultPort);
app.set('port', port);

// 학교 서버 가상 디렉토리(/stud19 등) 주소 때문에 라우터 먹통되고 404 터지는 거 막아주는 주소 정규화 부분
app.use((req, res, next) => {
    const parts = req.url.split('/').filter(Boolean);
    // 주소창 첫 번째 단어가 내가 만든 기능 라우터 이름이 아니면 학번 폴더 이름으로 생각하고 주소창에서 잘라냄
    if (parts.length > 0 && !['user', 'board', 'products', 'cart', 'order', 'mypage', 'wishlist', 'admin', 'users', 'login'].includes(parts[0])) {
        req.url = '/' + parts.slice(1).join('/');
    }
    next();
});

// 각각의 기능별 서브 라우터 파일들 매핑
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

// 주소창에 그냥 /login 쳤을 때도 user 폴더 안의 로그인 주소로 부드럽게 넘겨주기
app.get('/login', (req, res) => { res.redirect('user/login'); });

// 주소를 잘못 입력했을 때 404 에러를 에러 핸들러로 던져주는 구역
app.use(function(req, res, next) { next(createError(404)); });

// 최종 에러 처리 화면 렌더링 핸들러
app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

// HTTP 서버 인스턴스 생성하고 구동하기 (listen 호출)
const server = http.createServer(app);
server.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`[*] 학과 실습 서버 멀티유저 라우팅 유연화 세팅 완료!`);
    console.log(`[*] 현재 실행 계정: ${currentStudent || '로컬 PC 개발 환경'}`);
    console.log(`[*] 오픈된 포트: ${port}번`);
    console.log(`[*] 접속 테스트 주소: http://10.125.234.122/${currentStudent || ''}`);
    console.log(`==================================================\n`);
});

// 숫자가 아닌 포트 값이 들어왔을 때 변환 및 예외 처리해주는 헬퍼 함수
function normalizePort(val) {
    var port = parseInt(val, 10);
    if (isNaN(port)) return val;
    if (port >= 0) return port;
    return false;
}

module.exports = app;