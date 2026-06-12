const express = require('express');
const router = require('express').Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// [상대경로 완벽 고정] 실행 위치와 관계없이 현재 파일 폴더 기준으로 DB 경로를 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 마이페이지 메인 조회
router.get('/', (req, res) => {
    const sessionUser = req.session.user;

    if (!sessionUser) {
        return res.redirect('/user/login');
    }

    // 탈퇴 여부 검증을 포함한 유저 데이터 단건 조회
    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, user) => {
        if (err || !user) {
            console.error('마이페이지 조회 오류:', err);
            return res.send('<script>alert("사용자 정보를 불러올 수 없거나 탈퇴된 계정입니다."); location.href="/";</script>');
        }

        res.render('mypage', { user: user });
    });
});

// 회원 탈퇴 처리 플래그 업데이트
router.post('/withdraw', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    // 회원 데이터 완전 파기 대신 논리 삭제(Soft Delete) 상태값 업데이트
    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('탈퇴 처리 중 DB 오류:', err.message);
            return res.send('<script>alert("탈퇴 처리 중 오류가 발생했습니다."); history.back();</script>');
        }

        // 데이터 업데이트 성공 후 활성화된 세션 컨텍스트 파기
        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.send('<script>alert("회원 탈퇴가 정상적으로 완료되었습니다. 그동안 이용해 주셔서 감사합니다."); location.href="/";</script>');
        });
    });
});

module.exports = router;