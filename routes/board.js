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

// 게시판 목록 조회 (공지사항 상단 고정 및 계층형 정렬 반영)
router.get('/', (req, res) => {
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
        res.render('board', { title: '고객센터 게시판', posts });
    });
});

// 글쓰기 폼
router.get('/new', (req, res) => {
    res.render('post', { post: null, parentId: null });
});

// 글쓰기 처리
router.post('/new', upload.single('attachment'), (req, res) => {
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
                        // ⭕ [교정] 주소창: /board/new (2단계) -> 위로 한 칸 탈출한 후 board로 귀환 (../board)
                        res.redirect('../board');
                    }
                );
            } else {
                // ⭕ [교정] 주소창: /board/new (2단계) -> 위로 한 칸 탈출한 후 board로 귀환 (../board)
                res.redirect('../board');
            }
        }
    );
});

// 글 상세 조회
router.get('/view/:id', (req, res) => {
    const postId = req.params.id;

    db.get('SELECT * FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err || !post) return res.send('글 없음');

        db.all('SELECT * FROM files WHERE post_id = ?', [postId], (ferr, files) => {
            if (ferr) console.error('파일 조회 실패:', ferr.message);

            db.all('SELECT * FROM posts WHERE parent_id = ? ORDER BY id ASC', [postId], (cerr, comments) => {
                if (cerr) console.error('댓글 조회 실패:', cerr.message);
                res.render('detail', { post, files: files || [], comments: comments || [] });
            });
        });
    });
});

// 답글 달기 폼
router.get('/reply/:id', (req, res) => {
    const parentId = req.params.id;
    db.get("SELECT title FROM posts WHERE id = ?", [parentId], (err, row) => {
        if (err || !row) return res.send("원글 없음");
        res.render('reply', {
            parentId,
            parentTitle: row.title,
            user: req.session.user || null
        });
    });
});

// 댓글 및 답글 등록 처리
router.post('/create', (req, res) => {
    const { author, title, content, parent_id } = req.body;
    db.run(
        'INSERT INTO posts (author, title, content, parent_id) VALUES (?, ?, ?, ?)',
        [author, title, content, parent_id || null],
        function (err) {
            if (err) return res.send('등록 실패');

            if (parent_id) {
                // ⭕ [교정] 주소창: /board/create (2단계) -> 한 단계 위 부모 폴더에서 view/:id 호출 (../board/view/:id)
                res.redirect('../board/view/' + parent_id);
            } else {
                // ⭕ [교정] 주소창: /board/create (2단계) -> 한 단계 위 부모 폴더에서 board 리스트 호출 (../board)
                res.redirect('../board');
            }
        }
    );
});

// 수정 폼
router.get('/edit/:id', (req, res) => {
    db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
        if (err || !post) return res.send('글 없음');
        res.render('edit', { post });
    });
});

// 수정 처리
router.post('/edit/:id', (req, res) => {
    const { title, content } = req.body;
    db.run(
        'UPDATE posts SET title = ?, content = ? WHERE id = ?',
        [title, content, req.params.id],
        (err) => {
            if (err) return res.send('수정 실패');
            // ⭕ [교정] 주소창: /board/edit/:id (3단계 파라미터 계층) -> 부모 계층을 고려하여 한 단계 위 스코프의 view 호출 (../view/:id)
            res.redirect('../view/' + req.params.id);
        }
    );
});

// 삭제 처리 (관리자 전용)
router.get('/delete/:id', (req, res) => {
    const postId = req.params.id;
    const currentUser = req.session.user;

    if (!currentUser || currentUser.role !== 'ADMIN') {
        return res.send('<script>alert("게시글 삭제는 최고 관리자만 가능합니다."); history.back();</script>');
    }

    db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
        if (err) return res.send('삭제 실패');
        // ⭕ [교정] 주소창: /board/delete/:id (3단계 파라미터 계층) -> 두 단계 거슬러 올라가 상위의 board 목록으로 회군 (../../board)
        res.redirect('../../board');
    });
});

module.exports = router;