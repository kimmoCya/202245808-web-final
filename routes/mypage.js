const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/mypage
router.get('/', (req, res) => {
    const sessionUser = req.session.user;

    if (!sessionUser) {
        return res.redirect('user/login');
    }

    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, user) => {
        if (err || !user) {
            console.error('마이페이지 조회 오류:', err);
            return res.status(404).send('사용자 정보를 불러올 수 없거나 탈퇴된 계정입니다.');
        }

        res.render('mypage', { user: user });
    });
});

// 주소창: .../stud19/mypage/withdraw
router.post('/withdraw', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('탈퇴 처리 중 DB 오류:', err.message);
            return res.status(500).send('탈퇴 처리 중 오류가 발생했습니다.');
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            // 주소창 /mypage/withdraw (3단계)에서 최상위 홈으로 이동
            res.redirect('../../');
        });
    });
});

module.exports = router;