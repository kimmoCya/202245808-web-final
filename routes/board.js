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
// 🔒 로그인 여부를 검사하는 미들웨어 가드
// ==================================================
function requireLogin(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
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
                        res.redirect('../board');
                    }
                );
            } else {
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
            res.redirect('../../board');
        }
    );
});

// ==================================================
// 5. 문의글 수정 화면 진입 (주소창: .../stud19/board/edit/:id)
// ==================================================
router.get('/edit/:id', requireLogin, (req, res) => {
    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) return res.send('글 없음');

        // 🚩 [보안 가드] 글 작성자와 현재 로그인한 유저의 세션명이 다르면 진입 원천 차단!
        if (post.author !== req.session.user.username) {
            return res.send('<script>alert("본인이 작성한 글만 수정할 수 있습니다."); history.back();</script>');
        }

        res.render('post', { post, parentId: null, user: req.session.user });
    });
});

// 5-1. 문의글 수정 처리 데이터베이스 반영
router.post('/edit/:id', requireLogin, upload.single('attachment'), (req, res) => {
    const { title, content } = req.body;

    // 🚩 [보안 가드] POST 요청 처리 시에도 재차 본인인지 쿼리 조회 검증 후 업데이트 진행
    db.get('SELECT author FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) return res.send('글 없음');

        if (post.author !== req.session.user.username) {
            return res.send('<script>alert("수정 권한이 없습니다."); history.back();</script>');
        }

        db.run(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, req.params.id],
            (err2) => {
                if (err2) return res.send('수정 실패');
                res.redirect('../../board');
            }
        );
    });
});

// ==================================================
// 6. 문의글 삭제 처리 (주소창: .../stud19/board/delete/:id)
// ==================================================
router.get('/delete/:id', requireLogin, (req, res) => {
    const postId = req.params.id;
    const currentUser = req.session.user;

    db.get('SELECT author FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) return res.send('존재하지 않는 게시글입니다.');

        // 🚩 [보안 가드 핵심 분기]
        // 1. 현재 접속 유저가 최고 관리자(ADMIN)이거나
        // 2. 글 작성자가 현재 로그인한 본인 계정일 때만 삭제 허용!
        const isExistAdmin = currentUser && currentUser.role === 'ADMIN';
        const isAuthorMe = post.author === currentUser.username;

        if (!isExistAdmin && !isAuthorMe) {
            return res.send('<script>alert("삭제 권한이 없습니다. 본인 글 또는 관리자만 삭제 가능합니다."); history.back();</script>');
        }

        db.run('DELETE FROM posts WHERE id = ?', [postId], (err2) => {
            if (err2) return res.send('삭제 실패');
            res.redirect('../../board');
        });
    });
});

module.exports = router;