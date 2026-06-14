const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// 🏠 회원가입 페이지 화면 렌더링 (주소창: .../stud19/user/register)
router.get('/register', (req, res) => {
    res.render('register');
});

// 📥 회원가입 양식 데이터 받아와서 DB에 등록 처리하는 곳!
router.post('/register', async (req, res) => {
    const { username, password, name, birth, address, phone, email } = req.body;

    // 🛑 [과제 감점방지] 아이디랑 이메일 똑같이 적으면 보안상 노답이라 여기서 바로 입구컷!!
    if (username === email) {
        return res.send(`
            <script>
                alert('보안을 위해 아이디와 이메일은 동일하게 설정할 수 없습니다.');
                history.back();
            </script>
        `);
    }

    // 🔐 비밀번호는 소중하니까 bcrypt 해시로 안전하게 암호화 돌리기
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔍 데이터베이스에 이미 똑같은 아이디로 가입한 사람 있는지 체크
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, existingUser) => {
        if (err) return res.status(500).send('DB 오류');

        if (existingUser) {
            // 🚪 탈퇴했던 회원이 같은 아이디로 또 가입하려고 하면 그냥 로그인 창으로 유도
            if (existingUser.is_withdrawn === 1) {
                return res.redirect('login');
            }
            // ⚠️ 아이디 중복되면 튕기지 말고 alert 창 띄우고 다시 가입 서식 페이지 유지!
            return res.send(`
                <script>
                    alert('이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.');
                    location.href = 'register';
                </script>
            `);
        }

        // 🎉 중복 검사 다 통과했으면 정상 회원(is_withdrawn = 0)으로 드디어 인서트 성공!
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

// 🔑 로그인 페이지 화면 렌더링 (주소창: .../stud19/user/login)
router.get('/login', (req, res) => {
    res.render('login');
});

// 🕵️‍♂️ 로그인 인증 및 유저 세션 바인딩 처리 구역
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.send(`
                <script>
                    alert('아이디 또는 비밀번호가 맞지 않습니다.');
                    location.href = 'login';
                </script>
            `);
        }

        // ⚖️ 내가 입력한 비번이랑 DB에 들어있는 암호화 비번이랑 매칭되는지 비교 검사
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // 👻 계정 정보는 맞는데 탈퇴 플래그 켜진 회원이면 재가입 동의창 화면으로 던지기
            if (user.is_withdrawn === 1) {
                return res.render('user_rejoin', { username: user.username });
            }

            // 💾 정상 회원이면 세션 정보에 유저 메타 데이터 싹 다 기록하기
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
            return res.send(`
                <script>
                    alert('아이디 또는 비밀번호가 맞지 않습니다.');
                    location.href = 'login';
                </script>
            `);
        }
    });
});

// 🔄 탈퇴한 유저 구제용 재가입 신청 서브밋 (주소창: .../stud19/user/rejoin-submit)
router.post('/rejoin-submit', async (req, res) => {
    const { username, password } = req.body;
    const newHashedPassword = await bcrypt.hash(password, 10);

    // 🛠️ 탈퇴 상태 0으로 원복 시키고 비밀번호도 새로 해시 돌려서 업데이트
    db.run('UPDATE users SET password = ?, is_withdrawn = 0 WHERE username = ?', [newHashedPassword, username], (err) => {
        if (err) {
            console.error('재가입 처리 오류:', err.message);
            return res.redirect('login');
        }

        // 🛒 가입하자마자 로그인 상태 유지시켜 주려고 복구된 정보 다시 조회해서 세션에 바로 주입!
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
                return res.redirect('../');
            }
            res.redirect('login');
        });
    });
});

// 🏃‍♂️ 로그아웃 세션 완전 파기 (주소창: .../stud19/user/logout)
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('logout 에러:', err);
        res.redirect('../');
    });
});

// 📝 내 정보 수정 폼 화면 그려주기 (주소창: .../stud19/user/edit)
router.get('/edit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('login');

    db.get('SELECT * FROM users WHERE username = ? AND is_withdrawn = 0', [sessionUser.username], (err, row) => {
        if (err || !row) return res.status(404).send('사용자 정보를 찾을 수 없습니다.');
        res.render('user_edit', { user: row });
    });
});

// 💾 회원정보 수정 데이터 받아서 실제 DB 갱신하는 곳
router.post('/edit', async (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.redirect('login');

    const { name, password, birth, address, phone, email } = req.body;
    const username = sessionUser.username;

    // 🛡️ 빈 칸으로 대충 넘긴 항목들은 기존 세션값 날아가지 않게 삼항 연산자로 방어 코딩!!
    const finalName = (name && name.trim() !== "") ? name : sessionUser.name;
    const finalBirth = (birth && birth.trim() !== "") ? birth : sessionUser.birth;
    const finalAddress = (address && address.trim() !== "") ? address : sessionUser.address;
    const finalPhone = (phone && phone.trim() !== "") ? phone : sessionUser.phone;
    const finalEmail = (email && email.trim() !== "") ? email : sessionUser.email;

    try {
        let sql = '';
        let params = [];

        // 💡 비밀번호 칸 입력 여부에 따라 쿼리문 분기해서 태우기 (안 건드렸으면 패스워드 업데이트 제외)
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

            // ⚡ 상단 메인 GNB 헤더 이름 실시간 동기화를 위해 현재 수정값 세션에도 즉시 반영
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

// 🚨 회원 탈퇴 요청 서브밋 처리 (주소창: .../stud19/user/withdraw-submit)
router.post('/withdraw-submit', (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) return res.status(401).send('로그인이 필요합니다.');

    // 🗑️ 회원 행을 아예 DELETE 치면 큰일나니까 탈퇴 플래그(is_withdrawn = 1)만 논리적 수정!
    db.run('UPDATE users SET is_withdrawn = 1 WHERE username = ?', [sessionUser.username], (err) => {
        if (err) {
            console.error('탈퇴 처리 중 DB 오류:', err.message);
            return res.status(500).send('탈퇴 처리 중 오류가 발생했습니다.');
        }

        // 💥 DB 탈퇴 처리 완료됐으니 현재 브라우저 세션 싹 다 폭파하고 인덱스로 튕겨내기
        req.session.destroy((sessionErr) => {
            if (sessionErr) console.error('세션 파기 오류:', sessionErr);
            res.redirect('../');
        });
    });
});

// 🔍 분실 아이디 찾기 가드 (주소창: .../stud19/user/find-id)
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

        res.send(`
            <script>
                alert('가입하신 아이디는 [ ${row.username} ] 입니다.');
                location.href = 'login';
            </script>
        `);
    });
});

// 🎲 분실 비밀번호 임시 난수 발급 처리 (주소창: .../stud19/user/find-pwd)
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

        // 🎰 랜덤 8자리 문자열 마구잡이로 뽑아서 임시 패스워드 생성 후 암호화 저장
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedTempPassword = await bcrypt.hash(tempPassword, 10);

        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedTempPassword, row.id], (updateErr) => {
            if (updateErr) return res.status(500).send('임시 비밀번호 발급 실패');

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