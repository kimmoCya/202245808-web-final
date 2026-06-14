const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

const multer = require('multer');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

// ==================================================
// 🔒 [신설] 로그인 여부를 검사하는 미들웨어 가드
// ==================================================
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        // 로그인 세션이 존재하면 다음 라우터 행선지로 통과
        next();
    } else {
        // 로그인 안 되어 있으면 자바스크립트 경고창 띄우고 로그인 페이지로 강제 압송
        // 주소창 계층에 맞춰 슬래시 없는 'user/login'으로 상대 경로 지정
        return res.send(`
            <script>
                alert("고객센터 게시판은 로그인 후 이용 가능합니다.");
                location.href = "user/login";
            </script>
        `);
    }
}

// ==================================================
// 1. 고객센터 게시판 메인 리스트 (주소창: .../stud19/board)
// ==================================================
// 🚩 requireLogin 미들웨어를 장착하여 로그인 안 한 사용자는 진입 컷!
router.get('/', requireLogin, (req, res) => {
    const query = `
        SELECT p.*, 
               (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) AS comment_count
        FROM posts p
        ORDER BY p.is_notice DESC, 
                 COALESCE(p.parent_id, p.id) DESC, 
                 p.parent_id IS NOT NULL ASC, 
                 p.id ASC
    `;

    db.all(query, [], (err, posts) => {
        if (err) return res.send('목록 불러오기 실패');
        // 이쁜 내비바 연동을 위해 세션 user 객체 함께 인계
        res.render('board', { title: '고객센터 게시판', posts, user: req.session.user });
    });
});

// ==================================================
// 2. 새 문의글 작성 화면 진입 및 처리 (주소창: .../stud19/board/new)
// ==================================================
router.get('/new', requireLogin, (req, res) => {
    res.render('post', { post: null, parentId: null, user: req.session.user });
});

router.post('/new', requireLogin, upload.single('attachment'), (req, res) => {
    const { title, content, parent_id, is_notice } = req.body;
    const author = req.session.user?.username || '익명';
    const noticeValue = is_notice ? 1 : 0;

    db.run(
        'INSERT INTO posts (title, content, parent_id, author, is_notice) VALUES (?, ?, ?, ?, ?)',
        [title, content, parent_id || null, author, noticeValue],
        function (err) {
            if (err) return res.send('작성 실패');

            const postId = this.lastID;

            if (req.file) {
                const { filename, path: filepath } = req.file;
                db.run(
                    'INSERT INTO files (post_id, filename, filepath) VALUES (?, ?, ?)',
                    [postId, filename, filepath],
                    (err2) => {
                        if (err2) console.error('파일 저장 오류:', err2.message);

                        // 🚩 [주소 교정] 작성 완료 후 끝에 슬래시가 없는 깔끔한 /board 로 복귀
                        res.redirect('../board');
                    }
                );
            } else {
                // 🚩 [주소 교정] 작성 완료 후 끝에 슬래시가 없는 깔끔한 /board 로 복귀
                res.redirect('../board');
            }
        }
    );
});

// ==================================================
// 3. 문의글 상세 보기 화면 (주소창: .../stud19/board/view/:id)
// ==================================================
router.get('/view/:id', requireLogin, (req, res) => {
    const postId = req.params.id;

    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) return res.send('글 없음');

        db.all('SELECT * FROM files WHERE post_id = ?', [postId], (ferr, files) => {
            if (ferr) console.error('파일 조회 실패:', ferr.message);

            db.all('SELECT * FROM posts WHERE parent_id = ? ORDER BY id ASC', [postId], (cerr, comments) => {
                if (cerr) console.error('댓글 조회 실패:', cerr.message);
                res.render('detail', { post, files: files || [], comments: comments || [], user: req.session.user });
            });
        });
    });
});

// ==================================================
// 4. 답글 작성 화면 및 처리 (주소창: .../stud19/board/reply/:id)
// ==================================================
router.get('/reply/:id', requireLogin, (req, res) => {
    const parentId = req.params.id;
    db.get("SELECT title FROM posts WHERE id = ?", [parentId], (err, row) => {
        if (err || !row) return res.send("원글 없음");
        res.render('post', {
            post: null,
            parentId: parentId,
            user: req.session.user
        });
    });
});

router.post('/reply/:id', requireLogin, upload.single('attachment'), (req, res) => {
    const parentId = req.params.id;
    const { title, content } = req.body;
    const author = req.session.user?.username || '익명';

    db.run(
        'INSERT INTO posts (title, content, parent_id, author, is_notice) VALUES (?, ?, ?, ?, 0)',
        [title, content, parentId, author],
        function (err) {
            if (err) return res.send('답글 등록 실패');

            // 🚩 [주소 교정] 답글 저장 후 슬래시 없는 /board 목록으로 안전 복귀
            res.redirect('../../board');
        }
    );
});

// ==================================================
// 5. 문의글 수정 구역 (주소창: .../stud19/board/edit/:id)
// ==================================================
router.get('/edit/:id', requireLogin, (req, res) => {
    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) return res.send('글 없음');
        res.render('post', { post, parentId: null, user: req.session.user });
    });
});

router.post('/edit/:id', requireLogin, upload.single('attachment'), (req, res) => {
    const { title, content } = req.body;
    db.run(
        'UPDATE posts SET title = ?, content = ? WHERE id = ?',
        [title, content, req.params.id],
        (err) => {
            if (err) return res.send('수정 실패');

            // 수정 완료 후 해당 글 상세보기 화면으로 백업
            res.redirect('../view/' + req.params.id);
        }
    );
});

// ==================================================
// 6. 문의글 삭제 (주소창: .../stud19/board/delete/:id)
// ==================================================
router.get('/delete/:id', requireLogin, (req, res) => {
    const postId = req.params.id;
    const currentUser = req.session.user;

    // 최고 관리자 계정 권한 예외 방어 가드
    if (!currentUser || currentUser.role !== 'ADMIN') {
        return res.send('<script>alert("게시글 삭제는 최고 관리자만 가능합니다."); history.back();</script>');
    }

    db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
        if (err) return res.send('삭제 실패');

        // 🚩 [형의 의도 완벽 반영] 삭제 후 다른 페이지나 홈으로 안 튕기고,
        // 주소창 맨 끝에 슬래시가 붙지 않는 순수 /board 목록 화면 그대로 안착시킴!
        res.redirect('../../board');
    });
});

module.exports = router;