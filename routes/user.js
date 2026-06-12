const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 주소창: .../stud19/user/register
router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { username, password, name, birth, address, phone, email } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, existingUser) => {
        if (err) return res.status(500).send('DB 오류');

        if (existingUser) {
            if (existingUser.is_withdrawn === 1) {
                return res.redirect('login');
            }
            return res.status(400).send('이미 존재하는 아이디입니다.');
        }

        db.run(
            'INSERT INTO users (username, password, name, birth, address, phone, email, is_withdrawn) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            [username, hashedPassword, name, birth || null, address || null, phone || null, email || null],
            (insertErr) => {
                if (insertErr) return res.status(500).send('가입 실패');
                res.redirect('login');
            }
        );
    });
});

// 주소창: .../stud19/user/login
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.redirect('login');
        }

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            if (user.is_withdrawn === 1) {
                // 🚩 탈퇴 유저 감지 시 재가입 뷰 출력
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
            res.redirect('../');
        } else {
            return res.status(401).send('비밀번호가 일치하지 않습니다.');
        }
    });
});

// 주소창: .../stud19/user/rejoin-submit
router.post('/rejoin-submit', async (req, res) => {
    const { username, password } = req.body;
    const newHashedPassword = await bcrypt.hash(password, 10);

    db.run('UPDATE users SET password = ?, is_withdrawn = 0 WHERE username = ?', [newHashedPassword, username], (err) => {
        if (err) {
            console.error('재가입 처리 오류:', err.message);
            return res.redirect('login');
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
                // 🚩 [보정] /user/rejoin-submit 위치에서 상위 컨텍스트 루트(.../stud19/)로 안전하게 탈출 리다이렉트
                return res.redirect('../');
            }
            res.redirect('login');
        });
    });
});

// 주소창: .../stud19/user/logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('logout 에러:', err);
        res.redirect('../');
    });
});

// 주소창: .../stud19/user/edit
router.get('/edit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('login');

    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, row) => {
        if (err || !row) return res.status(404).send('사용자 정보를 찾을 수 없습니다.');
        res.render('user_edit', { user: row });
    });
});

router.post('/edit', async (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('login');

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
                return res.status(500).send('수정 실패');
            }

            req.session.user.name = finalName;
            req.session.user.birth = finalBirth;
            req.session.user.address = finalAddress;
            req.session.user.phone = finalPhone;
            req.session.user.email = finalEmail;

            req.session.save(() => {
                res.redirect('../mypage');
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('서버 오류 발생');
    }
});

// 주소창: .../stud19/user/withdraw-submit
router.post('/withdraw-submit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('탈퇴 처리 중 DB 오류:', err.message);
            return res.status(500).send('탈퇴 처리 중 오류가 발생했습니다.');
        }

        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.redirect('../');
        });
    });
});

// 주소창: .../stud19/user/find-id
router.post('/find-id', (req, res) => {
    const { name, email } = req.body;

    db.get('SELECT username FROM users WHERE name = ? AND email = ? AND is_withdrawn = 0', [name, email], (err, row) => {
        if (err) return res.status(500).send('DB 오류');
        if (!row) {
            return res.send(`
                <script>
                    alert('일치하는 회원 정보가 없습니다.');
                    location.href = 'login';
                </script>
            `);
        }

        // 🚩 [핵심 복구] 찾은 아이디를 브라우저 알림창(alert)으로 확실하게 띄워줌
        res.send(`
            <script>
                alert('가입하신 아이디는 [ ${row.username} ] 입니다.');
                location.href = 'login';
            </script>
        `);
    });
});

// 주소창: .../stud19/user/find-pwd
router.post('/find-pwd', (req, res) => {
    const { username, name, email } = req.body;

    db.get('SELECT id FROM users WHERE username = ? AND name = ? AND email = ? AND is_withdrawn = 0', [username, name, email], async (err, row) => {
        if (err) return res.status(500).send('DB 오류');
        if (!row) {
            return res.send(`
                <script>
                    alert('일치하는 회원 정보가 없습니다.');
                    location.href = 'login';
                </script>
            `);
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedTempPassword, row.id], (updateErr) => {
            if (updateErr) return res.status(500).send('임시 비밀번호 발급 실패');

            // 🚩 [핵심 복구] 발급된 임시 비밀번호를 알림창(alert)으로 완벽하게 노출
            res.send(`
                <script>
                    alert('임시 비밀번호가 발급되었습니다.\\n로그인 후 즉시 변경해 주세요.\\n\\n임시 비밀번호: ${tempPassword}');
                    location.href = 'login';
                </script>
            `);
        });
    });
});

module.exports = router;