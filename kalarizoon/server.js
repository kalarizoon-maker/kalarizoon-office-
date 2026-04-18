const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const PORT = process.env.PORT || 5000;
const SECRET_KEY = 'kalarizoon_secret_key_2024';

// অ্যাডমিন লগইন তথ্য
const ADMIN_NUMBER = 'kalarizoon';
const ADMIN_EMAIL = 'admin@kalarizoon.com';
const ADMIN_PASSWORD = '96321';

const GOOGLE_CLIENT_ID = "861715344690-5unee9541opt1dno0horahs82tsugbhn.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// ডাটা ফোল্ডার তৈরি
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const DB_PATH = path.join(dataDir, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ডিফল্ট সাইট সেটিংস
const DEFAULT_SITE_SETTINGS = {
    siteName: 'kalarizoon',
    logo: '/logo/logo.png',
    vBadgeImage: '/logo/vbadge.png'
};

// ডাটাবেস লোড ফাংশন
function loadDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        const initialData = {
            users: [],
            posts: [],
            notifications: [],
            withdrawals: [],
            adminHistory: [],
            approvedPosts: [],
            rejectedPosts: [],
            pendingPosts: [],
            removedPendingPosts: [],
            payUserStats: {},
            payHistory: [],
            siteSettings: DEFAULT_SITE_SETTINGS,
            userBadges: {}
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    try {
        const data = JSON.parse(fs.readFileSync(DB_PATH));
        if (!data.siteSettings) data.siteSettings = DEFAULT_SITE_SETTINGS;
        if (!data.userBadges) data.userBadges = {};
        if (!data.approvedPosts) data.approvedPosts = [];
        if (!data.rejectedPosts) data.rejectedPosts = [];
        if (!data.pendingPosts) data.pendingPosts = [];
        if (!data.removedPendingPosts) data.removedPendingPosts = [];
        if (!data.payUserStats) data.payUserStats = {};
        if (!data.payHistory) data.payHistory = [];
        
        // অ্যাডমিন ইউজার তৈরি
        const adminExists = data.users.find(u => u.isAdmin === true);
        if (!adminExists) {
            data.users.push({
                id: 'admin_' + Date.now(),
                name: 'Administrator',
                email: ADMIN_EMAIL,
                bkash: ADMIN_NUMBER,
                numberType: 'admin',
                password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
                withdrawCode: '000000',
                referralCode: 'ADMIN001',
                referredBy: '',
                coins: 0,
                joinDate: new Date().toISOString(),
                bio: '',
                avatar: '',
                provider: 'email',
                isAdmin: true
            });
        }
        
        return data;
    } catch (e) {
        console.error("ডাটাবেস লোডে সমস্যা:", e);
        return { users: [], posts: [], notifications: [], withdrawals: [], adminHistory: [], approvedPosts: [], rejectedPosts: [], pendingPosts: [], removedPendingPosts: [], payUserStats: {}, payHistory: [], siteSettings: DEFAULT_SITE_SETTINGS, userBadges: {} };
    }
}

function saveDatabase(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateReferralCode(bkash) {
    return Buffer.from(bkash).toString('base64').substring(0, 8);
}

function createToken(user) {
    return jwt.sign({ id: user.id, bkash: user.bkash, email: user.email, isAdmin: user.isAdmin || false }, SECRET_KEY, { expiresIn: '7d' });
}

function verifyToken(req) {
    try {
        const token = req.headers.authorization;
        if (!token) return null;
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
}

function updatePayUserStats(db, userId, reward) {
    if (!db.payUserStats) db.payUserStats = {};
    if (!db.payUserStats[userId]) {
        db.payUserStats[userId] = {
            weeklyBDT: 0,
            totalBDT: 0,
            postCount: 0,
            lastReset: new Date().toISOString(),
            weekStart: new Date().toISOString()
        };
    }
    db.payUserStats[userId].weeklyBDT = (db.payUserStats[userId].weeklyBDT || 0) + reward;
    db.payUserStats[userId].totalBDT = (db.payUserStats[userId].totalBDT || 0) + reward;
    db.payUserStats[userId].postCount = (db.payUserStats[userId].postCount || 0) + 1;
}

// API হ্যান্ডলার
async function handleAPI(req, res, parsedUrl, body) {
    const pathname = parsedUrl.pathname;
    const db = loadDatabase();

    // ===== গুগল লগইন =====
    if (pathname === '/api/auth/google' && req.method === 'POST') {
        try {
            const { token } = JSON.parse(body);
            const ticket = await client.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
            const payload = ticket.getPayload();
            const { name, email, picture, email_verified } = payload;

            if (!email_verified) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ইমেইল ভেরিফাইড নয়' }));
            }

            let user = db.users.find(u => u.email === email);

            if (!user) {
                const bkash = '01' + Math.floor(100000000 + Math.random() * 900000000).toString();
                const withdrawCode = Math.floor(100000 + Math.random() * 900000).toString();
                user = {
                    id: Date.now().toString(),
                    name: name || 'গুগল ইউজার',
                    email: email,
                    bkash: bkash,
                    numberType: 'google',
                    password: bcrypt.hashSync(Date.now().toString(), 10),
                    withdrawCode: withdrawCode,
                    referralCode: generateReferralCode(bkash),
                    referredBy: '',
                    coins: 10,
                    joinDate: new Date().toISOString(),
                    bio: '',
                    avatar: picture || '',
                    provider: 'google',
                    isAdmin: false
                };
                db.users.push(user);
                db.notifications = db.notifications || [];
                db.notifications.push({
                    id: Date.now(),
                    userId: bkash,
                    message: `🎉 স্বাগতম ${user.name}! ওয়েলকাম বোনাস হিসেবে ১০ বিডিটি পেলেন!`,
                    timestamp: new Date().toISOString(),
                    viewed: false,
                    type: 'bonus',
                    link: '/profile'
                });
                saveDatabase(db);
            }

            const jwtToken = createToken(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                token: jwtToken,
                user: { name: user.name, email: user.email, bkash: user.bkash, avatar: user.avatar, coins: user.coins || 0, isAdmin: user.isAdmin || false }
            }));
        } catch (error) {
            console.error("গুগল লগইন সমস্যা:", error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'গুগল লগইন ব্যর্থ' }));
        }
        return true;
    }

    // ===== সাইনআপ =====
    if (pathname === '/api/signup' && req.method === 'POST') {
        try {
            const { name, email, bkash, password, withdrawCode, referralCode } = JSON.parse(body);

            if (!name || !email || !bkash || !password || !withdrawCode) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'সব ঘর পূরণ করুন' }));
            }

            if (!/^01[0-9]{9}$/.test(bkash)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ভুল নম্বর (01XXXXXXXXX)' }));
            }

            if (db.users.find(u => u.email === email || u.bkash === bkash)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ইউজার already exists' }));
            }

            const hashedPassword = bcrypt.hashSync(password, 10);

            // রেফারেল চেক
            if (referralCode) {
                const referrer = db.users.find(u => generateReferralCode(u.bkash) === referralCode);
                if (referrer) {
                    const referrerIndex = db.users.findIndex(u => u.bkash === referrer.bkash);
                    if (referrerIndex !== -1) {
                        db.users[referrerIndex].coins = (db.users[referrerIndex].coins || 0) + 10;
                        db.notifications = db.notifications || [];
                        db.notifications.push({
                            id: Date.now(),
                            userId: referrer.bkash,
                            message: `🎉 ${name} আপনার রেফারেল কোড ব্যবহার করে জয়েন করেছে! +১০ বিডিটি বোনাস!`,
                            timestamp: new Date().toISOString(),
                            viewed: false,
                            type: 'referral',
                            link: '/profile'
                        });
                    }
                }
            }

            const newUser = {
                id: Date.now().toString(),
                name, email, bkash,
                numberType: 'bkash',
                password: hashedPassword,
                withdrawCode: withdrawCode,
                referralCode: generateReferralCode(bkash),
                referredBy: referralCode || '',
                coins: 0,
                joinDate: new Date().toISOString(),
                bio: '',
                avatar: '',
                provider: 'email',
                isAdmin: false
            };

            db.users.push(newUser);
            saveDatabase(db);

            const token = createToken(newUser);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true, token,
                user: { name: newUser.name, bkash: newUser.bkash, email: newUser.email, coins: newUser.coins, avatar: newUser.avatar, isAdmin: false }
            }));
        } catch (error) {
            console.error("সাইনআপ সমস্যা:", error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'সাইনআপ ব্যর্থ' }));
        }
        return true;
    }

    // ===== লগইন =====
    if (pathname === '/api/login' && req.method === 'POST') {
        try {
            const { identifier, password } = JSON.parse(body);
            
            // অ্যাডমিন লগইন
            if (identifier === ADMIN_NUMBER && password === ADMIN_PASSWORD) {
                let adminUser = db.users.find(u => u.isAdmin === true);
                if (!adminUser) {
                    adminUser = {
                        id: 'admin_' + Date.now(),
                        name: 'Administrator',
                        email: ADMIN_EMAIL,
                        bkash: ADMIN_NUMBER,
                        numberType: 'admin',
                        password: bcrypt.hashSync(ADMIN_PASSWORD, 10),
                        withdrawCode: '000000',
                        referralCode: 'ADMIN001',
                        referredBy: '',
                        coins: 0,
                        joinDate: new Date().toISOString(),
                        bio: '',
                        avatar: '',
                        provider: 'email',
                        isAdmin: true
                    };
                    db.users.push(adminUser);
                    saveDatabase(db);
                }
                const token = createToken(adminUser);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true, token,
                    user: { name: adminUser.name, bkash: adminUser.bkash, email: adminUser.email, coins: adminUser.coins || 0, avatar: adminUser.avatar, isAdmin: true }
                }));
                return true;
            }
            
            const user = db.users.find(u => u.email === identifier || u.bkash === identifier);
            if (!user) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ইউজার পাওয়া যায়নি' }));
            }
            if (!bcrypt.compareSync(password, user.password)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ভুল পাসওয়ার্ড' }));
            }
            const token = createToken(user);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true, token,
                user: { name: user.name, bkash: user.bkash, email: user.email, coins: user.coins || 0, avatar: user.avatar, isAdmin: user.isAdmin || false }
            }));
        } catch (error) {
            console.error("লগইন সমস্যা:", error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'লগইন ব্যর্থ' }));
        }
        return true;
    }

    // ===== সাইট সেটিংস GET =====
    if (pathname === '/api/site-settings' && req.method === 'GET') {
        const settings = db.siteSettings || DEFAULT_SITE_SETTINGS;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings }));
        return true;
    }

    // ===== সাইট সেটিংস UPDATE =====
    if (pathname === '/api/site-settings' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        try {
            const { siteName, logo, vBadgeImage } = JSON.parse(body);
            if (siteName) db.siteSettings.siteName = siteName;
            if (logo) db.siteSettings.logo = logo;
            if (vBadgeImage) db.siteSettings.vBadgeImage = vBadgeImage;
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, settings: db.siteSettings }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'সেটিংস আপডেট ব্যর্থ' }));
        }
        return true;
    }

    // ===== ইমেজ আপলোড =====
    if (pathname === '/api/upload-image' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        try {
            const { image, type } = JSON.parse(body);
            if (!image || !type) throw new Error("Missing data");
            
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const filename = `${type}_${Date.now()}.png`;
            const filepath = path.join(UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, base64Data, 'base64');
            
            const imageUrl = `/uploads/${filename}`;
            if (type === 'logo') db.siteSettings.logo = imageUrl;
            else if (type === 'vbadge') db.siteSettings.vBadgeImage = imageUrl;
            
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, url: imageUrl }));
        } catch (error) {
            console.error("আপলোড সমস্যা:", error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'আপলোড ব্যর্থ' }));
        }
        return true;
    }

    // ===== সব ইউজার GET =====
    if (pathname === '/api/users' && req.method === 'GET') {
        const users = db.users.map(u => ({
            id: u.id, name: u.name, bkash: u.bkash, email: u.email,
            coins: u.coins || 0, withdrawCode: u.withdrawCode, joinDate: u.joinDate,
            avatar: u.avatar, isAdmin: u.isAdmin || false,
            hasVBadge: !!(db.userBadges && db.userBadges[u.bkash] && db.userBadges[u.bkash].hasVBadge)
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, users }));
        return true;
    }

    // ===== V-Badge গ্রান্ট/রিভোক =====
    if (pathname === '/api/users/badge' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        try {
            const { userId, action } = JSON.parse(body);
            if (!db.userBadges) db.userBadges = {};
            if (action === 'grant') {
                db.userBadges[userId] = {
                    hasVBadge: true,
                    grantedBy: decoded.bkash,
                    grantedAt: new Date().toISOString()
                };
                db.notifications = db.notifications || [];
                db.notifications.push({
                    id: Date.now(), userId: userId,
                    message: `👑 আপনি ভেরিফিকেশন ব্যাজ (V-Badge) পেয়েছেন!`,
                    timestamp: new Date().toISOString(), viewed: false, type: 'badge', link: '/profile'
                });
            } else if (action === 'revoke') {
                if (db.userBadges[userId]) db.userBadges[userId].hasVBadge = false;
            }
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'ব্যাজ আপডেট ব্যর্থ' }));
        }
        return true;
    }

    // ===== ইউজারের নিজের পোস্ট (হিস্ট্রি) =====
    if (pathname === '/api/user-posts' && req.method === 'GET') {
        const decoded = verifyToken(req);
        if (!decoded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        const userPosts = (db.posts || []).filter(p => p.userId === decoded.bkash).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, posts: userPosts }));
        return true;
    }

    // ===== সব পোস্ট (হোম ফিড) =====
    if (pathname === '/api/posts' && req.method === 'GET') {
        const posts = (db.posts || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, posts }));
        return true;
    }

    // ===== পেন্ডিং পোস্ট (অ্যাডমিন) =====
    if (pathname === '/api/pending-posts' && req.method === 'GET') {
        const showRemoved = parsedUrl.query.showRemoved === 'true';
        let pendingPosts = showRemoved ? [...(db.pendingPosts || []), ...(db.removedPendingPosts || [])] : (db.pendingPosts || []);
        pendingPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, posts: pendingPosts }));
        return true;
    }

    // ===== পোস্ট তৈরি =====
    if (pathname === '/api/posts' && req.method === 'POST') {
        try {
            const { account, platform, fullPassword, password, userId, userName, userAvatar, token } = JSON.parse(body);
            const decoded = verifyToken({ headers: { authorization: token } });
            if (!decoded || (decoded.bkash !== userId && decoded.email !== userId)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
            }
            const newPost = {
                _id: Date.now().toString(),
                account, platform, fullPassword,
                password: password.substring(0, 4) + '****',
                timestamp: new Date().toISOString(),
                userId, userName, userAvatar: userAvatar || '',
                status: 'pending',
                copied: false, removed: false, adminRemoved: false
            };
            db.posts = db.posts || [];
            db.posts.push(newPost);
            db.pendingPosts = db.pendingPosts || [];
            db.pendingPosts.push(newPost);
            db.notifications = db.notifications || [];
            db.notifications.push({
                id: Date.now(), userId: userId,
                message: `📢 নতুন ${platform} পোস্ট pending: ${account}`,
                timestamp: new Date().toISOString(), viewed: false, type: 'post_status', link: '/history'
            });
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'পোস্ট জমা হয়েছে' }));
        } catch (error) {
            console.error("পোস্ট তৈরি সমস্যা:", error);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'পোস্ট জমা ব্যর্থ' }));
        }
        return true;
    }

    // ===== পোস্ট অনুমোদন =====
    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/approve') && req.method === 'PUT') {
        const postId = pathname.split('/')[3];
        let postIndex = (db.pendingPosts || []).findIndex(p => p._id === postId);
        let post = null;
        if (postIndex !== -1) {
            post = db.pendingPosts[postIndex];
            db.pendingPosts.splice(postIndex, 1);
        } else {
            const removedIndex = (db.removedPendingPosts || []).findIndex(p => p._id === postId);
            if (removedIndex !== -1) {
                post = db.removedPendingPosts[removedIndex];
                db.removedPendingPosts.splice(removedIndex, 1);
            }
        }
        if (post) {
            post.status = 'approved';
            post.approvedAt = new Date().toISOString();
            db.approvedPosts = db.approvedPosts || [];
            db.approvedPosts.push(post);
            const mainPostIndex = (db.posts || []).findIndex(p => p._id === postId);
            if (mainPostIndex !== -1) db.posts[mainPostIndex].status = 'approved';
            
            const reward = post.platform === 'gmail' ? 3 : 4;
            const userIndex = db.users.findIndex(u => u.bkash === post.userId);
            if (userIndex !== -1) db.users[userIndex].coins = (db.users[userIndex].coins || 0) + reward;
            updatePayUserStats(db, post.userId, reward);
            
            db.notifications = db.notifications || [];
            db.notifications.push({
                id: Date.now(), userId: post.userId,
                message: `✅ আপনার ${post.platform} পোস্ট অনুমোদিত! +${reward} বিডিটি যোগ!`,
                timestamp: new Date().toISOString(), viewed: false, type: 'post_status', link: '/history'
            });
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reward: reward }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        }
        return true;
    }

    // ===== পোস্ট রিজেক্ট =====
    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/reject') && req.method === 'PUT') {
        const postId = pathname.split('/')[3];
        const postIndex = (db.pendingPosts || []).findIndex(p => p._id === postId);
        if (postIndex !== -1) {
            const post = db.pendingPosts[postIndex];
            post.status = 'rejected';
            post.rejectedAt = new Date().toISOString();
            db.rejectedPosts = db.rejectedPosts || [];
            db.rejectedPosts.push(post);
            db.pendingPosts.splice(postIndex, 1);
            const mainPostIndex = (db.posts || []).findIndex(p => p._id === postId);
            if (mainPostIndex !== -1) db.posts[mainPostIndex].status = 'rejected';
            
            db.notifications = db.notifications || [];
            db.notifications.push({
                id: Date.now(), userId: post.userId,
                message: `❌ আপনার ${post.platform} পোস্ট rejected হয়েছে।`,
                timestamp: new Date().toISOString(), viewed: false, type: 'post_status', link: '/history'
            });
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        }
        return true;
    }

    // ===== পেন্ডিং থেকে রিমুভ =====
    if (pathname.startsWith('/api/pending-posts/') && req.method === 'DELETE' && !pathname.endsWith('/restore')) {
        const postId = pathname.split('/').pop();
        const postIndex = (db.pendingPosts || []).findIndex(p => p._id === postId);
        if (postIndex !== -1) {
            const post = db.pendingPosts[postIndex];
            post.adminRemoved = true;
            db.removedPendingPosts = db.removedPendingPosts || [];
            db.removedPendingPosts.push(post);
            db.pendingPosts.splice(postIndex, 1);
            const mainPostIndex = (db.posts || []).findIndex(p => p._id === postId);
            if (mainPostIndex !== -1) db.posts[mainPostIndex].adminRemoved = true;
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        }
        return true;
    }

    // ===== রিমুভ করা পোস্ট রিস্টোর =====
    if (pathname.startsWith('/api/pending-posts/') && pathname.endsWith('/restore') && req.method === 'PUT') {
        const postId = pathname.split('/')[3];
        const removedIndex = (db.removedPendingPosts || []).findIndex(p => p._id === postId);
        if (removedIndex !== -1) {
            const post = db.removedPendingPosts[removedIndex];
            post.adminRemoved = false;
            post.removed = false;
            db.pendingPosts = db.pendingPosts || [];
            db.pendingPosts.push(post);
            db.removedPendingPosts.splice(removedIndex, 1);
            const mainPostIndex = (db.posts || []).findIndex(p => p._id === postId);
            if (mainPostIndex !== -1) {
                db.posts[mainPostIndex].adminRemoved = false;
                db.posts[mainPostIndex].removed = false;
            }
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'পোস্ট পাওয়া যায়নি' }));
        }
        return true;
    }

    // ===== পোস্ট কপি মার্ক =====
    if (pathname.startsWith('/api/posts/') && pathname.endsWith('/copied') && req.method === 'PUT') {
        const postId = pathname.split('/')[3];
        const pendingIndex = (db.pendingPosts || []).findIndex(p => p._id === postId);
        if (pendingIndex !== -1) db.pendingPosts[pendingIndex].copied = true;
        const removedIndex = (db.removedPendingPosts || []).findIndex(p => p._id === postId);
        if (removedIndex !== -1) db.removedPendingPosts[removedIndex].copied = true;
        saveDatabase(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== অনুমোদিত পোস্ট =====
    if (pathname === '/api/approved-posts' && req.method === 'GET') {
        const approvedPosts = (db.approvedPosts || []).sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, posts: approvedPosts }));
        return true;
    }

    // ===== রিজেক্টেড পোস্ট =====
    if (pathname === '/api/rejected-posts' && req.method === 'GET') {
        const rejectedPosts = (db.rejectedPosts || []).sort((a, b) => new Date(b.rejectedAt) - new Date(a.rejectedAt));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, posts: rejectedPosts }));
        return true;
    }

    // ===== নোটিফিকেশন GET =====
    if (pathname.startsWith('/api/notifications/') && req.method === 'GET') {
        const userId = pathname.split('/').pop();
        const notifications = (db.notifications || []).filter(n => n.userId === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, notifications }));
        return true;
    }

    // ===== নোটিফিকেশন ভিউড মার্ক =====
    if (pathname.startsWith('/api/notifications/') && pathname.endsWith('/view') && req.method === 'PUT') {
        const userId = pathname.split('/')[3];
        (db.notifications || []).forEach(n => { if (n.userId === userId) n.viewed = true; });
        saveDatabase(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== নোটিফিকেশন ক্লিয়ার =====
    if (pathname.startsWith('/api/notifications/') && req.method === 'DELETE') {
        const userId = pathname.split('/').pop();
        db.notifications = (db.notifications || []).filter(n => n.userId !== userId);
        saveDatabase(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== ইউজার কয়েন আপডেট =====
    if (pathname.startsWith('/api/users/') && pathname.endsWith('/coins') && req.method === 'POST') {
        const identifier = pathname.split('/')[3];
        const { amount, action } = JSON.parse(body);
        const userIndex = db.users.findIndex(u => u.bkash === identifier || u.email === identifier);
        if (userIndex !== -1) {
            if (action === 'add') db.users[userIndex].coins = (db.users[userIndex].coins || 0) + amount;
            else if (action === 'remove') db.users[userIndex].coins = Math.max(0, (db.users[userIndex].coins || 0) - amount);
            saveDatabase(db);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== ইউজার অ্যাভাটার আপডেট =====
    if (pathname.startsWith('/api/users/') && pathname.endsWith('/avatar') && req.method === 'PUT') {
        const identifier = pathname.split('/')[3];
        const { avatar } = JSON.parse(body);
        const userIndex = db.users.findIndex(u => u.bkash === identifier || u.email === identifier);
        if (userIndex !== -1) {
            db.users[userIndex].avatar = avatar;
            (db.posts || []).forEach(p => { if (p.userId === identifier) p.userAvatar = avatar; });
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        }
        return true;
    }

    // ===== প্রোফাইল GET =====
    if (pathname === '/api/me' && req.method === 'GET') {
        const decoded = verifyToken(req);
        if (!decoded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false }));
        }
        const user = db.users.find(u => u.id === decoded.id);
        if (!user) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            user: { name: user.name, bkash: user.bkash, email: user.email, coins: user.coins || 0, withdrawCode: user.withdrawCode, avatar: user.avatar, isAdmin: user.isAdmin || false }
        }));
        return true;
    }

    // ===== উইথড্রয়াল তৈরি =====
    if (pathname === '/api/withdrawals' && req.method === 'POST') {
        try {
            const { userName, userBkash, amount, code } = JSON.parse(body);
            db.withdrawals = db.withdrawals || [];
            db.withdrawals.push({
                _id: Date.now().toString(), userName, userBkash, amount, code,
                timestamp: new Date().toISOString(), status: 'pending'
            });
            const userIndex = db.users.findIndex(u => u.bkash === userBkash);
            if (userIndex !== -1) db.users[userIndex].coins = (db.users[userIndex].coins || 0) - amount;
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false }));
        }
        return true;
    }

    // ===== উইথড্রয়াল GET =====
    if (pathname === '/api/withdrawals' && req.method === 'GET') {
        const withdrawals = (db.withdrawals || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, withdrawals }));
        return true;
    }

    // ===== উইথড্রয়াল কমপ্লিট =====
    if (pathname.startsWith('/api/withdrawals/') && pathname.endsWith('/complete') && req.method === 'PUT') {
        const id = pathname.split('/')[3];
        const withdrawalIndex = (db.withdrawals || []).findIndex(w => w._id === id);
        if (withdrawalIndex !== -1) {
            db.withdrawals[withdrawalIndex].status = 'completed';
            saveDatabase(db);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== স্ট্যাটিস্টিক্স =====
    if (pathname === '/api/stats' && req.method === 'GET') {
        const totalUsers = db.users.filter(u => !u.isAdmin).length;
        const totalPosts = (db.posts || []).filter(p => p.status === 'approved').length;
        const totalCoins = db.users.reduce((sum, u) => sum + (u.coins || 0), 0);
        const pendingCount = (db.pendingPosts || []).length;
        const approvedCount = (db.approvedPosts || []).length;
        const rejectedCount = (db.rejectedPosts || []).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, totalUsers, totalPosts, totalCoins, pendingCount, approvedCount, rejectedCount }));
        return true;
    }

    // ===== পে ইউজার লিস্ট =====
    if (pathname === '/api/pay-user-stats' && req.method === 'GET') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        
        const payStats = db.payUserStats || {};
        const users = db.users.filter(u => !u.isAdmin);
        
        const payUserList = users.map(user => {
            const stats = payStats[user.bkash] || { weeklyBDT: 0, totalBDT: 0, postCount: 0, weekStart: new Date().toISOString() };
            return {
                userId: user.bkash, name: user.name, avatar: user.avatar || '',
                bkash: user.bkash, email: user.email,
                weeklyBDT: stats.weeklyBDT || 0, totalBDT: stats.totalBDT || 0,
                postCount: stats.postCount || 0, weekStart: stats.weekStart || new Date().toISOString()
            };
        }).sort((a, b) => b.totalBDT - a.totalBDT);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payUserList }));
        return true;
    }

    // ===== পে হিস্ট্রি =====
    if (pathname === '/api/pay-history' && req.method === 'GET') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        
        const history = (db.payHistory || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, history }));
        return true;
    }

    // ===== মার্ক ইউজার পেইড =====
    if (pathname === '/api/pay-user-stats/success' && req.method === 'POST') {
        const decoded = verifyToken(req);
        if (!decoded || !decoded.isAdmin) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'অনুমতি নেই' }));
        }
        
        try {
            const { userId } = JSON.parse(body);
            const user = db.users.find(u => u.bkash === userId);
            if (!user) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, message: 'ইউজার পাওয়া যায়নি' }));
            }
            
            const stats = db.payUserStats[userId] || { weeklyBDT: 0, totalBDT: 0, postCount: 0 };
            
            db.payHistory = db.payHistory || [];
            db.payHistory.push({
                id: Date.now().toString(), userId: userId, userName: user.name,
                userAvatar: user.avatar || '', userBkash: user.bkash,
                weeklyBDT: stats.weeklyBDT || 0, totalBDT: stats.totalBDT || 0,
                postCount: stats.postCount || 0, timestamp: new Date().toISOString(),
                adminName: decoded.name || 'Admin'
            });
            
            db.payUserStats[userId] = {
                weeklyBDT: 0, totalBDT: 0, postCount: 0,
                lastReset: new Date().toISOString(), weekStart: new Date().toISOString()
            };
            
            saveDatabase(db);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'পেমেন্ট সফল হয়েছে' }));
        } catch (error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'সমস্যা হয়েছে' }));
        }
        return true;
    }

    // ===== অ্যাডমিন মানি সেন্ড =====
    if (pathname === '/api/admin/send-money' && req.method === 'POST') {
        const { toBkash, amount } = JSON.parse(body);
        const userIndex = db.users.findIndex(u => u.bkash === toBkash);
        if (userIndex !== -1) {
            db.users[userIndex].coins = (db.users[userIndex].coins || 0) + amount;
            db.adminHistory = db.adminHistory || [];
            db.adminHistory.push({ id: Date.now(), toBkash, amount, timestamp: new Date().toISOString() });
            db.notifications = db.notifications || [];
            db.notifications.push({ id: Date.now(), userId: toBkash, message: `💰 অ্যাডমিন ${amount} বিডিটি পাঠিয়েছেন!`, timestamp: new Date().toISOString(), viewed: false, type: 'admin_action', link: '/profile' });
            saveDatabase(db);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== নোটিফিকেশন সেন্ড =====
    if (pathname === '/api/notifications/send' && req.method === 'POST') {
        const { target, message } = JSON.parse(body);
        db.notifications = db.notifications || [];
        if (target) {
            db.notifications.push({ id: Date.now(), userId: target, message, timestamp: new Date().toISOString(), viewed: false, type: 'admin_message', link: '#' });
        } else {
            db.users.filter(u => !u.isAdmin).forEach(u => {
                db.notifications.push({ id: Date.now() + Math.random(), userId: u.bkash, message, timestamp: new Date().toISOString(), viewed: false, type: 'admin_message', link: '#' });
            });
        }
        saveDatabase(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return true;
    }

    // ===== পোস্ট এডিট =====
    if (pathname.startsWith('/api/posts/') && req.method === 'PUT' && !pathname.endsWith('/approve') && !pathname.endsWith('/reject') && !pathname.endsWith('/copied')) {
        const postId = pathname.split('/').pop();
        const { account, fullPassword } = JSON.parse(body);
        const postIndex = (db.posts || []).findIndex(p => p._id === postId);
        if (postIndex !== -1) {
            db.posts[postIndex].account = account;
            db.posts[postIndex].fullPassword = fullPassword;
            db.posts[postIndex].password = fullPassword.substring(0, 4) + '****';
            saveDatabase(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'পোস্ট আপডেট হয়েছে' }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'পোস্ট পাওয়া যায়নি' }));
        }
        return true;
    }

    return false;
}

// সার্ভার তৈরি
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        // API রাউটিং
        if (parsedUrl.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            const handled = await handleAPI(req, res, parsedUrl, body);
            if (!handled) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'API endpoint পাওয়া যায়নি' }));
            }
            return;
        }
        
        // স্ট্যাটিক ফাইল সার্ভিং
        let filePath;
        let contentType = 'text/html';
        
        // লোগো এবং আপলোড ফাইল হ্যান্ডলিং
        if (parsedUrl.pathname.startsWith('/logo/')) {
            filePath = path.join(__dirname, parsedUrl.pathname);
        } else if (parsedUrl.pathname.startsWith('/uploads/')) {
            filePath = path.join(__dirname, parsedUrl.pathname);
        } else if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
            filePath = path.join(__dirname, 'index.html');
        } else if (parsedUrl.pathname.endsWith('.css')) {
            filePath = path.join(__dirname, 'style.css');
            contentType = 'text/css';
        } else if (parsedUrl.pathname.endsWith('.js')) {
            filePath = path.join(__dirname, 'script.js');
            contentType = 'application/javascript';
        } else if (parsedUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
            filePath = path.join(__dirname, parsedUrl.pathname);
            contentType = 'image/' + path.extname(parsedUrl.pathname).slice(1);
        } else {
            filePath = path.join(__dirname, 'index.html');
        }
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                console.error("ফাইল পাওয়া যায়নি:", filePath);
                res.writeHead(404);
                res.end('ফাইল পাওয়া যায়নি');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`🚀 সার্ভার চলছে: http://localhost:${PORT}`);
    console.log(`👑 অ্যাডমিন লগইন: নাম্বার = ${ADMIN_NUMBER}, পাসওয়ার্ড = ${ADMIN_PASSWORD}`);
    console.log(`📁 ফাইল গুলো root ফোল্ডারে থাকতে হবে`);
    console.log(`📁 লোগো ফোল্ডার: /logo/logo.png`);
});