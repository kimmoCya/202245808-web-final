const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const router = express.Router();

// [상대경로 완벽 고정] 실행 위치와 관계없이 현재 파일 폴더 기준으로 DB 경로를 추적합니다.
const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 회원가입 페이지
router.get('/register', (req, res) => {
    res.render('register');
});

// 회원가입 처리
router.post('/register', async (req, res) => {
    const { username, password, name, birth, address, phone, email } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, existingUser) => {
        if (err) return res.send('<script>alert("DB 오류"); history.back();</script>');

        if (existingUser) {
            // 과거 탈퇴 계정이 동일 아이디로 가입 시 재가입 유도 인터셉트
            if (existingUser.is_withdrawn === 1) {
                return res.send(`
                    <script>
                        alert("과거에 탈퇴하신 계정입니다. 해당 아이디를 복구하시려면 로그인 창에서 기존 비밀번호로 로그인해 주세요.");
                        top.location.href = "/user/login";
                    </script>
                `);
            }
            return res.send('<script>alert("이미 존재하는 아이디입니다."); history.back();</script>');
        }

        db.run(
            'INSERT INTO users (username, password, name, birth, address, phone, email, is_withdrawn) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            [username, hashedPassword, name, birth || null, address || null, phone || null, email || null],
            (insertErr) => {
                if (insertErr) return res.send('<script>alert("가입 실패"); history.back();</script>');
                res.redirect('/user/login');
            }
        );
    });
});

// 로그인 페이지
router.get('/login', (req, res) => {
    res.render('login');
});

// 로그인 처리
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.send('<script>alert("존재하지 않는 사용자입니다."); top.location.href="/user/login";</script>');
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // 소프트 딜리트 상태인 유저는 재가입 비밀번호 변경 폼으로 포워딩
            if (user.is_withdrawn === 1) {
                return res.render('user_rejoin', { username: user.username });
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                email: user.email,
                phone: user.phone,
                address: user.address
            };
            return res.redirect('/');
        } else {
            return res.send('<script>alert("비밀번호가 일치하지 않습니다. 다시 확인해 주세요."); history.back();</script>');
        }
    });
});

// 재가입 처리
router.post('/rejoin-submit', async (req, res) => {
    const { username, password } = req.body;
    const newHashedPassword = await bcrypt.hash(password, 10);

    db.run('UPDATE users SET password = ?, is_withdrawn = 0 WHERE username = ?', [newHashedPassword, username], (err) => {
        if (err) {
            console.error('재가입 처리 오류:', err.message);
            return res.send('<script>alert("복구 중 오류가 발생했습니다."); top.location.href="/user/login";</script>');
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], (searchErr, refreshedUser) => {
            if (!searchErr && refreshedUser) {
                req.session.user = {
                    id: refreshedUser.id,
                    username: refreshedUser.username,
                    name: refreshedUser.name,
                    role: refreshedUser.role,
                    email: refreshedUser.email,
                    phone: refreshedUser.phone,
                    address: refreshedUser.address
                };
                return res.send('<script>alert("계정 및 기존 주문 내역이 복구되어 자동 로그인되었습니다."); top.location.href="/";</script>');
            }
            res.redirect('/user/login');
        });
    });
});

// 로그아웃
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('로그아웃 오류:', err);
        res.redirect('/');
    });
});

// 회원정보 수정 페이지
router.get('/edit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('/user/login');

    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, row) => {
        if (err || !row) return res.send('사용자 정보를 찾을 수 없습니다.');
        res.render('user_edit', { user: row });
    });
});

// 회원정보 수정 처리
router.post('/edit', async (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('/user/login');

    const { name, password, birth, address, phone, email } = req.body;
    const username = sessionUser.username;

    const finalName = (name && name.trim() !== "") ? name : sessionUser.name;
    const finalBirth = (birth && birth.trim() !== "") ? birth : sessionUser.birth;
    const finalAddress = (address && address.trim() !== "") ? address : sessionUser.address;
    const finalPhone = (phone && phone.trim() !== "") ? phone : sessionUser.phone;
    const finalEmail = (email && email.trim() !== "") ? email : sessionUser.email;

    try {
        let sql = '';
        let params = [];

        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            sql = `UPDATE users SET name=?, password=?, birth=?, address=?, phone=?, email=? WHERE username=? AND is_withdrawn=0`;
            params = [finalName, hashedPassword, finalBirth, finalAddress, finalPhone, finalEmail, username];
        } else {
            sql = `UPDATE users SET name=?, birth=?, address=?, phone=?, email=? WHERE username=? AND is_withdrawn=0`;
            params = [finalName, finalBirth, finalAddress, finalPhone, finalEmail, username];
        }

        db.run(sql, params, function (err) {
            if (err) {
                console.error('회원정보 수정 DB 오류:', err.message);
                return res.send('<script>alert("수정 실패"); history.back();</script>');
            }

            req.session.user.name = finalName;
            req.session.user.birth = finalBirth;
            req.session.user.address = finalAddress;
            req.session.user.phone = finalPhone;
            req.session.user.email = finalEmail;

            req.session.save(() => {
                res.send('<script>alert("회원 정보가 수정되었습니다."); top.location.href="/mypage";</script>');
            });
        });
    } catch (error) {
        console.error(error);
        res.send('서버 오류 발생');
    }
});

// 회원 탈퇴 처리
router.post('/withdraw-submit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('탈퇴 처리 중 DB 오류:', err.message);
            return res.send('<script>alert("탈퇴 처리 중 오류가 발생했습니다."); history.back();</script>');
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.send('<script>alert("회원 탈퇴가 완료되었습니다."); top.location.href="/";</script>');
        });
    });
});

// 아이디 찾기 처리
router.post('/find-id', (req, res) => {
    const { name, email } = req.body;

    db.get('SELECT username FROM users WHERE name = ? AND email = ? AND is_withdrawn = 0', [name, email], (err, row) => {
        if (err) return res.send('<script>alert("데이터베이스 오류가 발생했습니다."); history.back();</script>');
        if (!row) return res.send('<script>alert("일치하는 회원 정보가 없습니다."); history.back();</script>');

        return res.send(`
            <script>
                alert("회원님의 아이디는 [ ${row.username} ] 입니다.");
                top.location.href = "/user/login";
            </script>
        `);
    });
});

// 비밀번호 찾기 처리 (임시 비밀번호 생성)
router.post('/find-pwd', (req, res) => {
    const { username, name, email } = req.body;

    db.get('SELECT id FROM users WHERE username = ? AND name = ? AND email = ? AND is_withdrawn = 0', [username, name, email], async (err, row) => {
        if (err) return res.send('<script>alert("데이터베이스 오류가 발생했습니다."); history.back();</script>');
        if (!row) return res.send('<script>alert("입력하신 정보와 일치하는 계정을 찾을 수 없습니다."); history.back();</script>');

        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedTempPassword, row.id], (updateErr) => {
            if (updateErr) return res.send('<script>alert("임시 비밀번호 발급 중 오류가 발생했습니다."); history.back();</script>');

            return res.send(`
                <script>
                    alert("임시 비밀번호가 발급되었습니다.\\n\\n[ ${tempPassword} ]\\n\\n로그인 후 비밀번호를 변경해 주세요.");
                    top.location.href = "/user/login";
                </script>
            `);
        });
    });
});

module.exports = router;