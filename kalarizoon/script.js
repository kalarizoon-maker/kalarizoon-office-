const API_URL = '';
let token = localStorage.getItem('token');
let currentUser = null;

let allPosts = [], userNotifications = [], userCoins = 0, userWithdrawCode = '';
let historyViewMode = 'my', nextSetId = 1, editingPostId = null;
let pendingPosts = [], approvedPosts = [], rejectedPosts = [];
let userPosts = [];
let payUserList = [], payHistory = [];

const GOOGLE_CLIENT_ID = "861715344690-5unee9541opt1dno0horahs82tsugbhn.apps.googleusercontent.com";

// ===== GOOGLE LOGIN =====
async function handleGoogleLogin(response) {
    const idToken = response.credential;
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken })
        });
        const data = await res.json();
        if (data.success) {
            token = data.token;
            localStorage.setItem('token', token);
            currentUser = data.user;
            showToast(`✅ Welcome ${currentUser.name}!`);
            await loadUserData();
            await updateAllAvatars();
            showApp();
            updateHomeAvatar();
        } else {
            showToast(data.message || 'Google login failed', true);
        }
    } catch (error) {
        showToast('Google login error', true);
    }
}

function initGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleLogin
        });
        const googleLoginBtn = document.getElementById('googleLoginBtn');
        const googleSignupBtn = document.getElementById('googleSignupBtn');
        if (googleLoginBtn) googleLoginBtn.onclick = () => google.accounts.id.prompt();
        if (googleSignupBtn) googleSignupBtn.onclick = () => google.accounts.id.prompt();
    }
}

function updateHomeAvatar() {
    const homeAvatar = document.getElementById('homeAvatar');
    if (currentUser && currentUser.avatar) {
        homeAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
    } else if (currentUser) {
        const savedAvatar = localStorage.getItem(`avatar_${currentUser.bkash}`);
        if (savedAvatar) {
            homeAvatar.innerHTML = `<img src="${savedAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
        }
    }
}

// ===== UTILITY FUNCTIONS =====
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const btn = input.parentElement.querySelector('.toggle-password i');
    if (input.type === 'password') {
        input.type = 'text';
        btn.classList.remove('fa-eye-slash');
        btn.classList.add('fa-eye');
    } else {
        input.type = 'password';
        btn.classList.remove('fa-eye');
        btn.classList.add('fa-eye-slash');
    }
}

function formatNumber(num) { return num.toFixed(1); }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

function showToast(msg, err=false) { 
    const t=document.createElement('div'); 
    t.className='freefire-toast'; 
    t.innerHTML = `<i class="fas fa-crown"></i> ${msg}`; 
    document.body.appendChild(t); 
    setTimeout(()=>t.remove(),2000); 
}

function getTimeAgo(date) { 
    const s=Math.floor((new Date()-new Date(date))/1000); 
    if(s<60) return 'just now'; 
    if(s<3600) return `${Math.floor(s/60)}m ago`; 
    if(s<86400) return `${Math.floor(s/3600)}h ago`; 
    return `${Math.floor(s/86400)}d ago`; 
}

async function apiCall(endpoint, method, data) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = token;
        const response = await fetch(`/api${endpoint}`, {
            method: method,
            headers: headers,
            body: data ? JSON.stringify(data) : undefined
        });
        return await response.json();
    } catch (error) {
        return { success: false, message: 'Network error' };
    }
}

// ===== AUTH FUNCTIONS =====
async function signup() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const bkash = document.getElementById('signupNumber').value.trim();
    const password = document.getElementById('signupPassword').value;
    const withdrawCode = document.getElementById('signupWithdrawCode').value.trim();
    const referralCode = document.getElementById('signupReferral').value.trim();
    const err = document.getElementById('signupError');
    
    if(!name || !email || !bkash || !password || !withdrawCode) { err.textContent='All fields required'; return; }
    if(!/^01[0-9]{9}$/.test(bkash)) { err.textContent='Invalid number (01XXXXXXXXX)'; return; }
    if(password.length<6) { err.textContent='Password min 6 chars'; return; }
    if(withdrawCode.length !== 6) { err.textContent='Withdrawal code must be 6 digits'; return; }
    
    const result = await apiCall('/signup', 'POST', { name, email, bkash, password, withdrawCode, referralCode });
    
    if(result.success) {
        token = result.token;
        localStorage.setItem('token', token);
        currentUser = result.user;
        showToast('✅ Account created successfully!');
        await loadUserData();
        showApp();
        updateHomeAvatar();
    } else {
        err.textContent = result.message;
    }
}

async function login() {
    const identifier = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginError');
    
    if(!identifier || !password) { err.textContent='All fields required'; return; }
    
    const result = await apiCall('/login', 'POST', { identifier, password });
    
    if(result.success) {
        token = result.token;
        localStorage.setItem('token', token);
        currentUser = result.user;
        showToast(`Welcome, ${currentUser.name}!`);
        await loadUserData();
        await updateAllAvatars();
        showApp();
        updateHomeAvatar();
        
        if(currentUser.isAdmin) {
            setTimeout(() => openAdminPanel(), 500);
        }
    } else {
        err.textContent = result.message;
    }
}

// ===== DATA LOADING =====
async function loadUserData() {
    if(!token) return;
    
    const postsResult = await apiCall('/posts', 'GET');
    if(postsResult.success) allPosts = postsResult.posts;
    
    if(currentUser) {
        const userPostsResult = await apiCall(`/user-posts/${currentUser.bkash}`, 'GET');
        if(userPostsResult.success) userPosts = userPostsResult.posts;
        
        const notifResult = await apiCall(`/notifications/${currentUser.bkash}`, 'GET');
        if(notifResult.success) userNotifications = notifResult.notifications;
        
        const usersResult = await apiCall('/users', 'GET');
        if(usersResult.success) {
            const user = usersResult.users.find(u => u.bkash === currentUser.bkash);
            if(user) {
                userCoins = user.coins || 0;
                userWithdrawCode = user.withdrawCode || '------';
                currentUser.name = user.name;
                currentUser.email = user.email;
                currentUser.avatar = user.avatar;
            }
        }
    }
    
    updateCoinDisplay();
    updateNotifUI();
    updateBellBadge();
    renderAllFeeds();
}

async function updateAllAvatars() {
    const usersResult = await apiCall('/users', 'GET');
    if(usersResult.success) {
        for(const user of usersResult.users) {
            if(user.avatar) {
                localStorage.setItem(`avatar_${user.bkash}`, user.avatar);
            }
        }
    }
}

// ===== POST FUNCTIONS =====
async function createPost(account, password, platform) {
    const result = await apiCall('/posts', 'POST', {
        account, platform, fullPassword: password,
        password: password.substring(0,4)+'****',
        userId: currentUser.bkash,
        userName: currentUser.name,
        userAvatar: currentUser.avatar || localStorage.getItem(`avatar_${currentUser.bkash}`) || '',
        token: token
    });
    
    if(result.success) {
        await loadUserData();
        showToast(`✅ Post submitted for approval!`);
        return true;
    }
    return false;
}

// ===== RENDER FUNCTIONS =====
function renderAllFeeds() { 
    renderHomeFeed(); 
    renderHistoryFeed(); 
    updateProfileStats(); 
}

function renderHomeFeed() {
    const fd = document.getElementById('postsFeed');
    const approvedOnly = allPosts.filter(p => p.status === 'approved');
    const todayPosts = approvedOnly.filter(p => new Date(p.timestamp) >= new Date(Date.now() - 24*60*60*1000));
    if(todayPosts.length===0) { fd.innerHTML='<div class="empty-state-centered"><i class="fas fa-newspaper"></i> No approved posts in last 24 hours</div>'; return; }
    
    fd.innerHTML = todayPosts.map(p => {
        const avatarImg = p.userAvatar ? `<img src="${p.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fas fa-user"></i>`;
        return `
            <div class="post-card">
                <div class="post-header">
                    <div class="post-avatar">${avatarImg}</div>
                    <div class="post-info">
                        <strong>${escapeHtml(p.userName)}</strong>
                        <div class="gray-text"><i class="fas fa-envelope"></i> ${escapeHtml(p.account)}</div>
                        <div class="gray-text"><i class="fas fa-lock"></i> ${escapeHtml(p.password)}</div>
                        <div class="post-meta"><i class="far fa-clock"></i> ${getTimeAgo(new Date(p.timestamp))}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderHistoryFeed() {
    const hd = document.getElementById('historyFeed');
    let displayPosts = historyViewMode === 'my' ? userPosts : allPosts.filter(p => p.userId === currentUser?.bkash);
    
    if(displayPosts.length===0) { hd.innerHTML='<div class="empty-state-centered"><i class="fas fa-box-open"></i> No posts yet</div>'; return; }
    
    hd.innerHTML = displayPosts.map(p => {
        const avatarImg = p.userAvatar ? `<img src="${p.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fas fa-user"></i>`;
        const removedClass = (p.removed || p.adminRemoved) ? 'removed' : '';
        const showEdit = historyViewMode === 'my' && p.status !== 'rejected' && !p.adminRemoved;
        
        let statusBadge = '';
        if (p.adminRemoved) {
            statusBadge = '<span style="background:#ef4444;color:white;padding:2px 8px;font-size:0.7rem;">Removed by Admin</span>';
        } else if (p.status === 'pending') {
            statusBadge = '<span style="background:#f59e0b;color:white;padding:2px 8px;font-size:0.7rem;">Pending</span>';
        } else if (p.status === 'approved') {
            statusBadge = '<span style="background:#10b981;color:white;padding:2px 8px;font-size:0.7rem;">Approved</span>';
        } else if (p.status === 'rejected') {
            statusBadge = '<span style="background:#ef4444;color:white;padding:2px 8px;font-size:0.7rem;">Rejected</span>';
        }
        
        return `
            <div class="post-card ${removedClass}">
                <div class="post-header">
                    <div class="post-avatar">${avatarImg}</div>
                    <div class="post-info">
                        <strong>${escapeHtml(p.userName)} ${statusBadge}</strong>
                        <div class="gray-text"><i class="fas fa-envelope"></i> ${escapeHtml(p.account)}</div>
                        <div class="gray-text"><i class="fas fa-lock"></i> ${escapeHtml(p.fullPassword || '****')}</div>
                        <div class="post-meta"><i class="far fa-clock"></i> ${getTimeAgo(new Date(p.timestamp))}</div>
                        ${showEdit ? `<button class="edit-post-btn-history edit-icon" data-id="${p._id}"><i class="fas fa-edit"></i> Edit</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.edit-post-btn-history').forEach(btn => btn.onclick = (e) => { openEditModal(btn.dataset.id); });
}

function updateProfileStats() {
    if(!currentUser) return;
    const userPostsFiltered = userPosts.filter(p => p.status === 'approved');
    document.getElementById('profileTotalPosts').innerText = userPostsFiltered.length;
    document.getElementById('profileEarnedCoins').innerText = formatNumber(userCoins);
    document.getElementById('profileCoinAmount').innerText = formatNumber(userCoins);
    document.getElementById('profileName').innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(currentUser.name)}`;
    document.getElementById('profileEmail').innerHTML = `<i class="fas fa-envelope"></i> ${escapeHtml(currentUser.email)}`;
    // Display phone number properly
    const displayNumber = currentUser.bkash && !currentUser.bkash.startsWith('google_') ? currentUser.bkash : (currentUser.bkash || 'N/A');
    document.getElementById('profileBkash').innerHTML = `<i class="fas fa-mobile-alt"></i> ${escapeHtml(displayNumber)}`;
    document.getElementById('profileWithdrawCodeDisplay').innerText = userWithdrawCode || '------';
    
    const avatar = currentUser.avatar || localStorage.getItem(`avatar_${currentUser.bkash}`);
    const preview = document.getElementById('profileAvatarPreview');
    if(avatar && preview) preview.innerHTML = `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;">`;
    else if(preview) preview.innerHTML = '<i class="fas fa-user-circle"></i>';
}

function updateCoinDisplay() {
    document.getElementById('coinAmount').textContent = formatNumber(userCoins);
    document.getElementById('coinPageAmount').textContent = formatNumber(userCoins);
    if(document.getElementById('profileCoinAmount')) document.getElementById('profileCoinAmount').textContent = formatNumber(userCoins);
}

function updateNotifUI() {
    const c = document.getElementById('notifListContainer');
    if(!c) return;
    if(userNotifications.length===0) { c.innerHTML='<div class="mail-empty">🔔 No notifications</div>'; return; }
    c.innerHTML = userNotifications.map(n => `<div class="notif-item"><i class="fas fa-bell"></i><div class="notif-text">${escapeHtml(n.message)}<div class="notif-time">${getTimeAgo(new Date(n.timestamp))}</div></div></div>`).join('');
}

function updateBellBadge() {
    const badge = document.getElementById('notifBadge');
    const unviewed = userNotifications.filter(n => !n.viewed).length;
    if(unviewed>0) { badge.style.display='flex'; badge.innerText=unviewed>9?'9+':unviewed; }
    else badge.style.display='none';
}

async function markNotificationsAsViewed() {
    if(currentUser) await apiCall(`/notifications/${currentUser.bkash}/view`, 'PUT');
    userNotifications.forEach(n => n.viewed = true);
    updateBellBadge();
}

// ===== FORM VALIDATION =====
function validateCredentials(platform, account, password) {
    if(platform === 'gmail') {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if(!emailRegex.test(account)) return { valid: false, message: "❌ Invalid email" };
        if(password.length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return { valid: false, message: "❌ Password must be 6+ chars with letters+numbers" };
        return { valid: true, message: "✅ Valid" };
    } else {
        if(account.length < 3 || !/^[a-zA-Z0-9_.]+$/.test(account)) return { valid: false, message: "❌ Invalid username" };
        if(password.length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return { valid: false, message: "❌ Password must be 6+ chars with letters+numbers" };
        return { valid: true, message: "✅ Valid" };
    }
}

async function handleSubmit() {
    const sets = document.querySelectorAll('.input-set');
    let success = 0;
    for(const setEl of sets) {
        if(validateSingleSet(setEl)) {
            const isGmail = setEl.querySelector('.set-gmail').classList.contains('active');
            const account = setEl.querySelector('.gmail-input').value.trim();
            const password = setEl.querySelector('.password-input').value;
            const platform = isGmail ? 'gmail' : 'instagram';
            const validation = validateCredentials(platform, account, password);
            if(validation.valid) {
                if(await createPost(account, password, platform)) success++;
            } else {
                showToast(validation.message, true);
            }
        }
    }
    if(success > 0) {
        document.getElementById('publishStatus').innerHTML = `<i class="fas fa-check-circle"></i><span>${success} post(s) submitted for approval!</span>`;
        showHome();
    } else {
        document.getElementById('publishStatus').innerHTML = `<i class="fas fa-ban"></i><span>No posts published</span>`;
    }
    sets.forEach(s => { s.querySelector('.gmail-input').value = ''; s.querySelector('.password-input').value = ''; });
}

function validateSingleSet(setEl) {
    const isGmail = setEl.querySelector('.set-gmail').classList.contains('active');
    const account = setEl.querySelector('.gmail-input').value.trim();
    const pwd = setEl.querySelector('.password-input').value;
    const accountErr = setEl.querySelector('.gmail-error');
    const pwdErr = setEl.querySelector('.password-error');
    let ok = true;
    if(!account) { accountErr.style.display='flex'; accountErr.querySelector('span').innerText='Required'; ok=false; }
    else if(isGmail && !/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(account)) { accountErr.style.display='flex'; accountErr.querySelector('span').innerText='Valid email required'; ok=false; }
    else { accountErr.style.display='none'; }
    if(!pwd) { pwdErr.style.display='flex'; pwdErr.querySelector('span').innerText='Password required'; ok=false; }
    else if(pwd.length<6) { pwdErr.style.display='flex'; pwdErr.querySelector('span').innerText='Min 6 chars'; ok=false; }
    else { pwdErr.style.display='none'; }
    return ok;
}

function createInputSet(setNumber, defaultPlatform = 'gmail') {
    const div = document.createElement('div'); div.className = 'input-set';
    div.innerHTML = `<div class="circle-badge"><span>${setNumber}</span></div>
    <div class="set-inline-buttons">
        <button class="set-inline-btn set-gmail ${defaultPlatform === 'gmail' ? 'active' : ''}"><i class="fab fa-google"></i> Gmail (3 BDT)</button>
        <button class="set-inline-btn set-instagram ${defaultPlatform === 'instagram' ? 'active' : ''}"><i class="fab fa-instagram"></i> Instagram (4 BDT)</button>
        <button class="set-inline-btn add-set-btn"><i class="fas fa-plus-circle"></i> Add Set</button>
    </div>
    <div class="input-row"><div class="input-label"><i class="fas fa-envelope"></i><span>Email/Username</span></div><div class="input-wrapper"><input type="text" class="gmail-input" placeholder="username@gmail.com"></div><div class="error-msg gmail-error"><i class="fas fa-exclamation-circle"></i> <span></span></div></div>
    <div class="input-row"><div class="input-label"><i class="fas fa-lock"></i><span>Password</span></div><div class="password-wrapper"><div class="input-wrapper"><input type="password" class="password-input" placeholder="Password"></div><button type="button" class="toggle-pwd-btn"><i class="fas fa-eye-slash"></i></button></div><div class="error-msg password-error"><i class="fas fa-exclamation-circle"></i> <span></span></div></div>`;
    
    const rm = document.createElement('button'); rm.className = 'remove-set-btn'; rm.innerHTML = '<i class="fas fa-times"></i>';
    rm.onclick = () => { if(document.querySelectorAll('.input-set').length > 1) { div.remove(); renumberSets(); } };
    div.appendChild(rm);
    attachSetEvents(div);
    return div;
}

function attachSetEvents(setEl) {
    const gmailBtn = setEl.querySelector('.set-gmail');
    const instaBtn = setEl.querySelector('.set-instagram');
    const addBtn = setEl.querySelector('.add-set-btn');
    const accountInput = setEl.querySelector('.gmail-input');
    const pwdInput = setEl.querySelector('.password-input');
    
    gmailBtn.onclick = () => {
        gmailBtn.classList.add('active');
        instaBtn.classList.remove('active');
        setEl.querySelector('.input-label i').className = 'fas fa-envelope';
        setEl.querySelector('.input-label span').textContent = 'Email';
        accountInput.placeholder = 'username@gmail.com';
    };
    instaBtn.onclick = () => {
        instaBtn.classList.add('active');
        gmailBtn.classList.remove('active');
        setEl.querySelector('.input-label i').className = 'fas fa-user';
        setEl.querySelector('.input-label span').textContent = 'Username';
        accountInput.placeholder = '@username';
    };
    addBtn.onclick = () => { 
        if(document.querySelectorAll('.input-set').length < 50) {
            document.getElementById('inputSetsContainer').appendChild(createInputSet(nextSetId++)); 
        }
    };
    accountInput.oninput = () => validateSingleSet(setEl);
    pwdInput.oninput = () => validateSingleSet(setEl);
    let vis = false;
    setEl.querySelector('.toggle-pwd-btn').onclick = () => { vis = !vis; pwdInput.type = vis ? 'text' : 'password'; };
}

function renumberSets() {
    document.querySelectorAll('.input-set').forEach((s, i) => { s.querySelector('.circle-badge span').innerText = i + 1; });
    nextSetId = document.querySelectorAll('.input-set').length + 1;
}

// ===== MONEY FUNCTIONS =====
async function withdrawMoney() {
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const code = document.getElementById('withdrawCode').value.trim();
    if(isNaN(amount) || amount <= 0) { showToast('Enter valid amount', true); return; }
    if(!code || code.length !== 6) { showToast('6-digit code required', true); return; }
    if(code !== userWithdrawCode) { showToast('Invalid withdrawal code!', true); return; }
    if(amount > userCoins) { showToast('Insufficient balance!', true); return; }
    
    const result = await apiCall('/withdrawals', 'POST', {
        userName: currentUser.name,
        userBkash: currentUser.bkash,
        amount, code
    });
    if(result.success) {
        await loadUserData();
        showToast('Withdrawal request sent!');
    }
    closeModals();
}

async function sendMoney() {
    const toNumber = document.getElementById('sendToBkash').value.trim();
    const amount = parseFloat(document.getElementById('sendAmount').value);
    if(!toNumber || !/^01[0-9]{9}$/.test(toNumber)) { showToast('Valid number required', true); return; }
    if(isNaN(amount) || amount <= 0) { showToast('Valid amount required', true); return; }
    if(amount > userCoins) { showToast('Insufficient balance!', true); return; }
    
    const result = await apiCall(`/users/${currentUser.bkash}/coins`, 'POST', { amount: amount, action: 'remove' });
    if(result.success) {
        await apiCall(`/users/${toNumber}/coins`, 'POST', { amount: amount, action: 'add' });
        await loadUserData();
        showToast(`${amount} BDT sent to ${toNumber}`);
        closeModals();
    }
}

// ===== EDIT POST =====
function openEditModal(postId) {
    const post = userPosts.find(p => p._id == postId);
    if(post && post.userId === currentUser?.bkash) {
        editingPostId = postId;
        document.getElementById('editAccount').value = post.account;
        document.getElementById('editPassword').value = post.fullPassword;
        document.getElementById('editModal').classList.add('show');
        document.getElementById('modalOverlay').classList.add('show');
    }
}

async function saveEditPost() {
    if(editingPostId) {
        const account = document.getElementById('editAccount').value.trim();
        const password = document.getElementById('editPassword').value;
        await apiCall(`/posts/${editingPostId}`, 'PUT', { account, fullPassword: password });
        closeEditModal();
        await loadUserData();
        renderAllFeeds();
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('modalOverlay').classList.remove('show');
}

// ===== PAY USER FUNCTIONS =====
async function loadPayUserData() {
    const result = await apiCall('/pay-user-stats', 'GET');
    if(result.success) {
        payUserList = result.payUserList;
    }
    
    const historyResult = await apiCall('/pay-history', 'GET');
    if(historyResult.success) {
        payHistory = historyResult.history;
    }
}

function renderPayUserList(searchTerm = '') {
    const container = document.getElementById('payUserList');
    let filtered = payUserList;
    
    if(searchTerm) {
        filtered = payUserList.filter(u => 
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.bkash.includes(searchTerm)
        );
    }
    
    if(filtered.length === 0) {
        container.innerHTML = '<div class="empty-state-centered">No users found</div>';
        return;
    }
    
    container.innerHTML = filtered.map(u => {
        // Format phone number display
        const displayNumber = u.bkash && !u.bkash.startsWith('google_') ? u.bkash : (u.bkash || 'N/A');
        return `
        <div class="pay-user-card">
            <div class="pay-user-avatar">
                ${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
            </div>
            <div class="pay-user-info">
                <h4>${escapeHtml(u.name)}</h4>
                <p><i class="fas fa-mobile-alt"></i> ${escapeHtml(displayNumber)}</p>
                <p><i class="fas fa-envelope"></i> ${escapeHtml(u.email)}</p>
            </div>
            <div class="pay-user-stats">
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${formatNumber(u.weeklyBDT)}</div>
                    <div class="pay-stat-label">Week BDT</div>
                </div>
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${formatNumber(u.totalBDT)}</div>
                    <div class="pay-stat-label">All BDT</div>
                </div>
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${u.postCount}</div>
                    <div class="pay-stat-label">Posts</div>
                </div>
            </div>
            <div class="pay-user-actions">
                <button class="admin-btn-sm success" onclick="markUserAsPaid('${u.userId}')">
                    <i class="fas fa-check"></i> Successful
                </button>
            </div>
        </div>
    `}).join('');
}

function renderPayHistory() {
    const container = document.getElementById('payHistoryList');
    
    if(payHistory.length === 0) {
        container.innerHTML = '<div class="empty-state-centered">No payment history</div>';
        return;
    }
    
    container.innerHTML = payHistory.map(h => {
        const displayNumber = h.userBkash && !h.userBkash.startsWith('google_') ? h.userBkash : (h.userBkash || 'N/A');
        return `
        <div class="pay-history-item">
            <div class="pay-history-header">
                <div class="pay-user-avatar" style="width:40px;height:40px;">
                    ${h.userAvatar ? `<img src="${h.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
                </div>
                <div>
                    <strong>${escapeHtml(h.userName)}</strong>
                    <p style="font-size:0.8rem;color:#64748b;">${escapeHtml(displayNumber)}</p>
                </div>
                <div style="margin-left:auto;font-size:0.8rem;color:#64748b;">
                    <i class="far fa-clock"></i> ${new Date(h.timestamp).toLocaleString()}
                </div>
            </div>
            <div class="pay-history-stats">
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${formatNumber(h.weeklyBDT)}</div>
                    <div class="pay-stat-label">Week BDT</div>
                </div>
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${formatNumber(h.totalBDT)}</div>
                    <div class="pay-stat-label">All BDT</div>
                </div>
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${h.postCount}</div>
                    <div class="pay-stat-label">Posts</div>
                </div>
                <div class="pay-stat-item">
                    <div class="pay-stat-value">${escapeHtml(h.adminName)}</div>
                    <div class="pay-stat-label">Processed By</div>
                </div>
            </div>
        </div>
    `}).join('');
}

async function markUserAsPaid(userId) {
    const user = payUserList.find(u => u.userId === userId);
    if(!user) return;
    
    if(confirm(`Mark ${user.name} as paid? This will reset their weekly stats.`)) {
        const result = await apiCall('/pay-user-stats/success', 'POST', { userId });
        if(result.success) {
            showToast(`✅ ${user.name} marked as paid!`);
            await loadPayUserData();
            
            const historyContainer = document.getElementById('payHistoryContainer');
            if(historyContainer.style.display === 'none') {
                renderPayUserList(document.getElementById('payUserSearchInput').value);
            } else {
                renderPayHistory();
            }
        } else {
            showToast(result.message || 'Error', true);
        }
    }
}

// ===== ADMIN PANEL FUNCTIONS =====
async function loadAdminData(showRemoved = false) {
    const url = showRemoved ? '/pending-posts?showRemoved=true' : '/pending-posts';
    const pendingResult = await apiCall(url, 'GET');
    if(pendingResult.success) pendingPosts = pendingResult.posts;
    
    const approvedResult = await apiCall('/approved-posts', 'GET');
    if(approvedResult.success) approvedPosts = approvedResult.posts;
    
    const rejectedResult = await apiCall('/rejected-posts', 'GET');
    if(rejectedResult.success) rejectedPosts = rejectedResult.posts;
    
    const activeCount = pendingPosts.filter(p => !p.adminRemoved).length;
    document.getElementById('pendingCount').innerText = activeCount;
    document.getElementById('dashPendingCount').innerText = activeCount;
    document.getElementById('dashApprovedCount').innerText = approvedPosts.length;
    document.getElementById('dashRejectedCount').innerText = rejectedPosts.length;
}

async function openAdminPanel() {
    if(!currentUser || !currentUser.isAdmin) {
        showToast('Admin access required', true);
        return;
    }
    
    await loadAdminData();
    await loadPayUserData();
    await refreshAdminPages();
    document.getElementById('adminPageContainer').classList.add('show');
    renderPendingPosts();
}

function closeAdminPanel() {
    document.getElementById('adminPageContainer').classList.remove('show');
    logout();
}

function switchAdminPage(page) {
    document.querySelectorAll('.admin-nav-link').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.admin-nav-link[data-admin-page="${page}"]`).classList.add('active');
    
    document.getElementById('adminDashboardPage').style.display = page === 'dashboard' ? 'block' : 'none';
    document.getElementById('adminPendingPage').style.display = page === 'pending' ? 'block' : 'none';
    document.getElementById('adminApprovedPage').style.display = page === 'approved' ? 'block' : 'none';
    document.getElementById('adminRejectedPage').style.display = page === 'rejected' ? 'block' : 'none';
    document.getElementById('adminPayUsersPage').style.display = page === 'payusers' ? 'block' : 'none';
    document.getElementById('adminUsersPage').style.display = page === 'users' ? 'block' : 'none';
    document.getElementById('adminWithdrawalsPage').style.display = page === 'withdrawals' ? 'block' : 'none';
    document.getElementById('adminSendMoneyPage').style.display = page === 'sendmoney' ? 'block' : 'none';
    document.getElementById('adminNotificationsPage').style.display = page === 'notifications' ? 'block' : 'none';
    
    if(page === 'pending') renderPendingPosts();
    else if(page === 'approved') renderApprovedPosts();
    else if(page === 'rejected') renderRejectedPosts();
    else if(page === 'payusers') {
        renderPayUserList();
        document.getElementById('payUserListTab').classList.add('active');
        document.getElementById('payHistoryTab').classList.remove('active');
        document.getElementById('payUserListContainer').style.display = 'block';
        document.getElementById('payHistoryContainer').style.display = 'none';
    }
    else if(page === 'users') renderAdminUsers();
    
    refreshAdminPages();
}

function renderPendingPosts(searchTerm = '') {
    const container = document.getElementById('pendingPostsList');
    let filtered = pendingPosts;
    
    if(searchTerm) {
        filtered = pendingPosts.filter(p => 
            p.account.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.userId.toLowerCase().includes(searchTerm.toLowerCase())
        );
    } else {
        filtered = pendingPosts.filter(p => !p.adminRemoved);
    }
    
    if(filtered.length === 0) {
        container.innerHTML = '<div class="empty-state-centered">No pending posts</div>';
        return;
    }
    
    const sorted = [...filtered].sort((a, b) => {
        if(a.copied && !b.copied) return 1;
        if(!a.copied && b.copied) return -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    container.innerHTML = sorted.map(p => {
        const copiedClass = p.copied ? 'copied' : '';
        const removedClass = p.adminRemoved ? 'removed-post' : '';
        const isRemoved = p.adminRemoved;
        
        return `
            <div class="admin-post-card ${copiedClass} ${removedClass}" id="post-${p._id}">
                <div class="post-header">
                    <div class="post-avatar">
                        ${p.userAvatar ? `<img src="${p.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
                    </div>
                    <div class="post-info">
                        <strong>${escapeHtml(p.userName)} (${p.userId}) ${p.adminRemoved ? '<span style="background:#f59e0b;color:white;padding:2px 8px;font-size:0.7rem;">Removed</span>' : ''}</strong>
                        <div class="gray-text"><i class="fas fa-envelope"></i> ${escapeHtml(p.account)}</div>
                        <div class="gray-text"><i class="fas fa-lock"></i> ${escapeHtml(p.fullPassword)}</div>
                        <div class="gray-text"><i class="fab fa-${p.platform === 'gmail' ? 'google' : 'instagram'}"></i> ${p.platform} (Reward: ${p.platform === 'gmail' ? '3' : '4'} BDT)</div>
                        <div class="post-meta"><i class="far fa-clock"></i> ${getTimeAgo(new Date(p.timestamp))}</div>
                    </div>
                </div>
                <div class="admin-post-actions">
                    <button class="admin-btn-sm copy" onclick="copyPostCredentials('${p._id}', '${p.account}', '${p.fullPassword}', '${p.platform}')">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    ${isRemoved ? 
                        `<button class="admin-btn-sm restore" onclick="restoreRemovedPost('${p._id}')">
                            <i class="fas fa-undo"></i> Restore
                        </button>
                        <button class="admin-btn-sm success" onclick="approvePost('${p._id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>` :
                        `<button class="admin-btn-sm success" onclick="approvePost('${p._id}')">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="admin-btn-sm danger" onclick="rejectPost('${p._id}')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                        <button class="admin-btn-sm warning" onclick="removeFromPending('${p._id}')">
                            <i class="fas fa-trash"></i> Remove
                        </button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

async function restoreRemovedPost(postId) {
    const result = await apiCall(`/pending-posts/${postId}/restore`, 'PUT');
    if(result.success) {
        showToast('Post restored to pending!');
        await loadAdminData();
        renderPendingPosts(document.getElementById('pendingSearchInput').value);
    }
}

function renderApprovedPosts(searchTerm = '') {
    const container = document.getElementById('approvedPostsList');
    let filtered = approvedPosts;
    
    if(searchTerm) {
        filtered = approvedPosts.filter(p => 
            p.account.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.userName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    if(filtered.length === 0) {
        container.innerHTML = '<div class="empty-state-centered">No approved posts</div>';
        return;
    }
    
    container.innerHTML = filtered.map(p => `
        <div class="admin-post-card">
            <div class="post-header">
                <div class="post-avatar">
                    ${p.userAvatar ? `<img src="${p.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
                </div>
                <div class="post-info">
                    <strong>${escapeHtml(p.userName)} (${p.userId})</strong>
                    <div class="gray-text"><i class="fas fa-envelope"></i> ${escapeHtml(p.account)}</div>
                    <div class="gray-text"><i class="fas fa-lock"></i> ${escapeHtml(p.fullPassword)}</div>
                    <div class="gray-text"><i class="fab fa-${p.platform === 'gmail' ? 'google' : 'instagram'}"></i> ${p.platform}</div>
                    <div class="post-meta"><i class="far fa-clock"></i> Approved: ${getTimeAgo(new Date(p.approvedAt))}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderRejectedPosts(searchTerm = '') {
    const container = document.getElementById('rejectedPostsList');
    let filtered = rejectedPosts;
    
    if(searchTerm) {
        filtered = rejectedPosts.filter(p => 
            p.account.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.userName.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    if(filtered.length === 0) {
        container.innerHTML = '<div class="empty-state-centered">No rejected posts</div>';
        return;
    }
    
    container.innerHTML = filtered.map(p => `
        <div class="admin-post-card">
            <div class="post-header">
                <div class="post-avatar">
                    ${p.userAvatar ? `<img src="${p.userAvatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
                </div>
                <div class="post-info">
                    <strong>${escapeHtml(p.userName)} (${p.userId})</strong>
                    <div class="gray-text"><i class="fas fa-envelope"></i> ${escapeHtml(p.account)}</div>
                    <div class="gray-text"><i class="fas fa-lock"></i> ${escapeHtml(p.fullPassword)}</div>
                    <div class="gray-text"><i class="fab fa-${p.platform === 'gmail' ? 'google' : 'instagram'}"></i> ${p.platform}</div>
                    <div class="post-meta"><i class="far fa-clock"></i> Rejected: ${getTimeAgo(new Date(p.rejectedAt))}</div>
                </div>
            </div>
        </div>
    `).join('');
}

async function copyPostCredentials(postId, account, password, platform) {
    const textToCopy = `${account}:${password}`;
    await navigator.clipboard.writeText(textToCopy);
    
    await apiCall(`/posts/${postId}/copied`, 'PUT');
    
    const postIndex = pendingPosts.findIndex(p => p._id === postId);
    if(postIndex !== -1) {
        pendingPosts[postIndex].copied = true;
    }
    
    renderPendingPosts(document.getElementById('pendingSearchInput').value);
    showToast('✅ Copied to clipboard!');
}

async function approvePost(postId) {
    const result = await apiCall(`/posts/${postId}/approve`, 'PUT');
    if(result.success) {
        showToast(`✅ Post approved! +${result.reward} BDT added to user!`);
        await loadAdminData();
        await loadPayUserData();
        await loadUserData();
        renderPendingPosts(document.getElementById('pendingSearchInput').value);
        updateCoinDisplay();
    }
}

async function rejectPost(postId) {
    const result = await apiCall(`/posts/${postId}/reject`, 'PUT');
    if(result.success) {
        showToast('Post rejected!');
        await loadAdminData();
        renderPendingPosts(document.getElementById('pendingSearchInput').value);
    }
}

async function removeFromPending(postId) {
    if(confirm('Remove this post from pending? User will see "Removed by Admin" in history.')) {
        const result = await apiCall(`/pending-posts/${postId}`, 'DELETE');
        if(result.success) {
            showToast('Post removed from pending');
            await loadAdminData();
            renderPendingPosts(document.getElementById('pendingSearchInput').value);
        }
    }
}

async function renderAdminUsers(searchTerm = '') {
    const container = document.getElementById('adminUsersList');
    const result = await apiCall('/users', 'GET');
    
    if(!result.success) {
        container.innerHTML = '<div class="empty-state-centered">Error loading users</div>';
        return;
    }
    
    let users = result.users.filter(u => !u.isAdmin);
    if(searchTerm) {
        users = users.filter(u => 
            u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.bkash.includes(searchTerm)
        );
    }
    
    container.innerHTML = `
        <table class="admin-table">
            <thead>
                <tr><th>Avatar</th><th>Name</th><th>Email</th><th>Number</th><th>Balance</th><th>Actions</th></tr>
            </thead>
            <tbody>
                ${users.map(u => {
                    const displayNumber = u.bkash && !u.bkash.startsWith('google_') ? u.bkash : (u.bkash || 'N/A');
                    return `
                    <tr>
                        <td>
                            <div class="post-avatar" style="width:40px;height:40px;">
                                ${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;">` : '<i class="fas fa-user"></i>'}
                            </div>
                        </td>
                        <td>${escapeHtml(u.name)}</td>
                        <td>${escapeHtml(u.email)}</td>
                        <td>${escapeHtml(displayNumber)}</td>
                        <td>${formatNumber(u.coins || 0)} BDT</td>
                        <td>
                            <button onclick="adminAddCoins('${u.bkash}',50)" class="admin-btn-sm">+50</button>
                            <button onclick="adminRemoveCoins('${u.bkash}',20)" class="admin-btn-sm warning">-20</button>
                            <button onclick="adminDeleteUser('${u.bkash}')" class="admin-btn-sm danger">Delete</button>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
}

async function refreshAdminPages() {
    const statsResult = await apiCall('/stats', 'GET');
    if(statsResult.success) {
        document.getElementById('adminStats').innerHTML = `
            <p><i class="fas fa-users"></i> <strong>Total Users:</strong> ${statsResult.totalUsers} | 
            <i class="fas fa-newspaper"></i> <strong>Total Posts:</strong> ${statsResult.totalPosts} | 
            <i class="fas fa-coins"></i> <strong>Total Balance:</strong> ${formatNumber(statsResult.totalCoins)} BDT</p>
        `;
    }
    
    const withdrawalsResult = await apiCall('/withdrawals', 'GET');
    if(withdrawalsResult.success) {
        document.getElementById('withdrawalsList').innerHTML = withdrawalsResult.withdrawals.length === 0 ? '<p>No withdrawal requests</p>' : `
            <table class="admin-table">
                <thead><tr><th>User</th><th>Number</th><th>Amount</th><th>Code</th><th>Time</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>${withdrawalsResult.withdrawals.map(w => {
                    const displayNumber = w.userBkash && !w.userBkash.startsWith('google_') ? w.userBkash : (w.userBkash || 'N/A');
                    return `
                    <tr>
                        <td>${escapeHtml(w.userName)}</td>
                        <td>${escapeHtml(displayNumber)}</td>
                        <td>${formatNumber(w.amount)} BDT</td>
                        <td>${w.code}</td>
                        <td>${new Date(w.timestamp).toLocaleString()}</td>
                        <td>${w.status === 'pending' ? '⏳ Pending' : '✅ Completed'}</td>
                        <td>${w.status === 'pending' ? `<button onclick="markWithdrawalComplete('${w._id}')" class="admin-btn-sm success">Complete</button>` : 'Completed'}</td>
                    </tr>
                `}).join('')}</tbody>
            </table>
        `;
    }
}

async function adminAddCoins(bkash, amount) {
    await apiCall(`/users/${bkash}/coins`, 'POST', { amount, action: 'add' });
    refreshAdminPages();
    renderAdminUsers();
    showToast(`Added ${amount} BDT to ${bkash}`);
}

async function adminRemoveCoins(bkash, amount) {
    await apiCall(`/users/${bkash}/coins`, 'POST', { amount, action: 'remove' });
    refreshAdminPages();
    renderAdminUsers();
    showToast(`Removed ${amount} BDT from ${bkash}`);
}

async function adminDeleteUser(bkash) {
    if(confirm('Delete this user permanently?')) {
        await apiCall(`/users/${bkash}`, 'DELETE');
        refreshAdminPages();
        renderAdminUsers();
        showToast('User deleted');
    }
}

async function adminSendMoneyToUser() {
    const toBkash = document.getElementById('adminSendBkash').value.trim();
    const amount = parseFloat(document.getElementById('adminSendAmount').value);
    if(!toBkash || !amount) { showToast('All fields required', true); return; }
    const result = await apiCall('/admin/send-money', 'POST', { toBkash, amount });
    if(result.success) {
        showToast(`${amount} BDT sent to ${toBkash}`);
        refreshAdminPages();
    }
}

async function adminSendNotification() {
    const target = document.getElementById('adminNotifBkash').value.trim();
    const message = document.getElementById('adminNotifMessage').value.trim();
    if(!message) { showToast('Enter message', true); return; }
    const result = await apiCall('/notifications/send', 'POST', { target, message });
    if(result.success) {
        showToast('Notification sent');
    }
}

async function markWithdrawalComplete(id) {
    const result = await apiCall(`/withdrawals/${id}/complete`, 'PUT');
    if(result.success) {
        refreshAdminPages();
        showToast('Withdrawal marked as completed');
    }
}

// ===== USERS PAGE =====
async function renderUsersPage() {
    const container = document.getElementById('usersListContainer');
    const result = await apiCall('/users', 'GET');
    if(!result.success) { container.innerHTML = '<div class="empty-state-centered">Error loading users</div>'; return; }
    
    let filteredUsers = result.users.filter(u => !u.isAdmin);
    const search = document.getElementById('searchUserInput')?.value.toLowerCase() || '';
    if(search) filteredUsers = filteredUsers.filter(u => u.name.toLowerCase().includes(search) || u.bkash.includes(search));
    
    if(filteredUsers.length===0) { container.innerHTML = '<div class="empty-state-centered">No users found</div>'; return; }
    container.innerHTML = filteredUsers.map(u => {
        const avatarImg = u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;">` : `<i class="fas fa-user-circle"></i>`;
        const displayNumber = u.bkash && !u.bkash.startsWith('google_') ? u.bkash : (u.bkash || 'N/A');
        return `
            <div class="user-list-item">
                <div class="user-list-avatar">${avatarImg}</div>
                <div class="user-list-info">
                    <h4><i class="fas fa-user"></i> ${escapeHtml(u.name)}</h4>
                    <p><i class="fas fa-mobile-alt"></i> ${escapeHtml(displayNumber)}</p>
                    <p><i class="fas fa-coins"></i> ${formatNumber(u.coins || 0)} BDT</p>
                </div>
                <button class="user-list-btn" onclick="viewUserProfile('${u.bkash}')"><i class="fas fa-eye"></i> View</button>
            </div>
        `;
    }).join('');
}

async function viewUserProfile(bkash) {
    const result = await apiCall('/users', 'GET');
    const user = result.users.find(u => u.bkash === bkash);
    if(!user) return;
    
    const avatarImg = user.avatar ? `<img src="${user.avatar}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">` : `<i class="fas fa-user-circle fa-3x"></i>`;
    const displayNumber = user.bkash && !user.bkash.startsWith('google_') ? user.bkash : (user.bkash || 'N/A');
    const content = `
        <div style="text-align:center;">
            <div style="margin:0 auto 1rem;width:80px;height:80px;">${avatarImg}</div>
            <h3><i class="fas fa-user"></i> ${escapeHtml(user.name)}</h3>
            <p><i class="fas fa-mobile-alt"></i> ${escapeHtml(displayNumber)}</p>
            <p><i class="fas fa-envelope"></i> ${escapeHtml(user.email || 'N/A')}</p>
            <div class="profile-stats-grid">
                <div class="stat-card"><i class="fas fa-coins"></i><div class="stat-number">${formatNumber(user.coins || 0)}</div><div class="stat-label">BDT</div></div>
            </div>
        </div>
    `;
    document.getElementById('profileViewContent').innerHTML = content;
    document.getElementById('profileViewModal').classList.add('show');
    document.getElementById('modalOverlay').classList.add('show');
}

// ===== AVATAR UPLOAD =====
async function setupAvatarUpload() {
    document.getElementById('editProfileIconBtn').onclick = () => document.getElementById('avatarInput').click();
    document.getElementById('avatarInput').onchange = async (e) => {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const avatar = ev.target.result;
                await apiCall(`/users/${currentUser.bkash}/avatar`, 'PUT', { avatar });
                currentUser.avatar = avatar;
                localStorage.setItem(`avatar_${currentUser.bkash}`, avatar);
                showToast('Profile picture updated!');
                updateProfileStats();
                updateHomeAvatar();
                await loadUserData();
                renderAllFeeds();
            };
            reader.readAsDataURL(file);
        }
    };
}

// ===== UI CONTROL =====
function closeModals() {
    document.getElementById('withdrawModal').classList.remove('show');
    document.getElementById('sendMoneyModal').classList.remove('show');
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('profileViewModal').classList.remove('show');
    document.getElementById('modalOverlay').classList.remove('show');
}

function initFirst() {
    document.getElementById('inputSetsContainer').innerHTML = '';
    document.getElementById('inputSetsContainer').appendChild(createInputSet(1, 'gmail'));
    nextSetId = 2;
}

function logout() { 
    currentUser = null; 
    token = null;
    localStorage.removeItem('token'); 
    document.getElementById('adminPageContainer').classList.remove('show');
    showAuth(); 
}

function showApp() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('signupPage').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');
    updateCoinDisplay(); updateNotifUI(); updateBellBadge(); updateProfileStats();
    showHome();
}

function showAuth() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('signupPage').classList.add('hidden');
    document.getElementById('appContent').classList.add('hidden');
}

let currentView = 'home';
function showPublish() { hidePages(); document.getElementById('publishPage').classList.remove('hidden'); currentView='publish'; updateBottomNav(); }
function showHome() { hidePages(); document.getElementById('homePage').classList.remove('hidden'); renderHomeFeed(); currentView='home'; updateBottomNav(); }
function showHistory() { hidePages(); document.getElementById('historyPage').classList.remove('hidden'); renderHistoryFeed(); updateHistoryButtonsActive(); currentView='history'; updateBottomNav(); }
function showProfile() { hidePages(); document.getElementById('profilePage').classList.remove('hidden'); updateProfileStats(); currentView='profile'; updateBottomNav(); }
function showUsers() { hidePages(); document.getElementById('usersPage').classList.remove('hidden'); renderUsersPage(); currentView='users'; updateBottomNav(); }

function hidePages() { 
    ['publishPage','homePage','historyPage','profilePage','usersPage'].forEach(id=>{
        const el=document.getElementById(id); 
        if(el) el.classList.add('hidden');
    }); 
}

function updateBottomNav() { 
    document.querySelectorAll('.bottom-nav-btn').forEach(btn=>btn.classList.remove('active')); 
    if(currentView==='home') document.getElementById('bottomHomeBtn').classList.add('active');
    else if(currentView==='history') document.getElementById('bottomHistoryBtn').classList.add('active');
    else if(currentView==='profile') document.getElementById('bottomProfileBtn').classList.add('active');
    else if(currentView==='users') document.getElementById('bottomUsersBtn').classList.add('active');
}

function updateHistoryButtonsActive() { 
    const myBtn = document.getElementById('myHistoryBtn'); 
    const allBtn = document.getElementById('allHistoryBtn'); 
    if(historyViewMode === 'my') { myBtn.classList.add('active'); allBtn.classList.remove('active'); } 
    else { allBtn.classList.add('active'); myBtn.classList.remove('active'); } 
}

// ===== INITIALIZATION =====
window.onload = async () => {
    initGoogleSignIn();
    
    token = localStorage.getItem('token');
    if(token) {
        const result = await apiCall('/me', 'GET');
        if(result.success) {
            currentUser = result.user;
            await loadUserData();
            await updateAllAvatars();
            showApp();
            updateHomeAvatar();
            if(currentUser.isAdmin) {
                setTimeout(() => openAdminPanel(), 500);
            }
        } else {
            localStorage.removeItem('token');
            showAuth();
        }
    } else {
        showAuth();
    }
    
    initFirst();
    setupAvatarUpload();
    
    // Auth buttons
    document.getElementById('signupBtn').onclick = signup;
    document.getElementById('loginBtn').onclick = login;
    document.getElementById('gotoSignupBtn').onclick = () => { document.getElementById('loginPage').classList.add('hidden'); document.getElementById('signupPage').classList.remove('hidden'); };
    document.getElementById('gotoLoginBtn').onclick = () => { document.getElementById('signupPage').classList.add('hidden'); document.getElementById('loginPage').classList.remove('hidden'); };
    document.getElementById('logoutBtn').onclick = logout;
    
    // Post buttons
    document.getElementById('submitPostBtn').onclick = handleSubmit;
    document.getElementById('createPostCard').onclick = showPublish;
    document.getElementById('topPublishBtn').onclick = showPublish;
    
    // Navigation
    document.getElementById('bottomHomeBtn').onclick = showHome;
    document.getElementById('bottomHistoryBtn').onclick = showHistory;
    document.getElementById('bottomProfileBtn').onclick = showProfile;
    document.getElementById('bottomUsersBtn').onclick = showUsers;
    document.getElementById('logoHomeBtn').onclick = showHome;
    
    // History toggle
    document.getElementById('myHistoryBtn').onclick = () => { historyViewMode='my'; renderHistoryFeed(); updateHistoryButtonsActive(); };
    document.getElementById('allHistoryBtn').onclick = () => { historyViewMode='all'; renderHistoryFeed(); updateHistoryButtonsActive(); };
    
    // Coin page
    document.getElementById('coinBoxBtn').onclick = () => document.getElementById('coinPage').classList.add('show');
    document.getElementById('closeCoinBtn').onclick = () => document.getElementById('coinPage').classList.remove('show');
    document.getElementById('withdrawCoinBtn').onclick = () => { document.getElementById('withdrawModal').classList.add('show'); document.getElementById('modalOverlay').classList.add('show'); };
    document.getElementById('sendMoneyCoinBtn').onclick = () => { document.getElementById('sendMoneyModal').classList.add('show'); document.getElementById('modalOverlay').classList.add('show'); };
    
    // Money actions
    document.getElementById('confirmWithdrawBtn').onclick = withdrawMoney;
    document.getElementById('closeWithdrawBtn').onclick = closeModals;
    document.getElementById('confirmSendBtn').onclick = sendMoney;
    document.getElementById('closeSendBtn').onclick = closeModals;
    document.getElementById('closeProfileViewBtn').onclick = closeModals;
    
    // Edit post
    document.getElementById('saveEditBtn').onclick = saveEditPost;
    document.getElementById('closeEditBtn').onclick = closeEditModal;
    
    // Notifications
    document.getElementById('mailIconBtn').onclick = () => document.getElementById('mailMenu').classList.toggle('show');
    document.getElementById('notificationBell').onclick = () => { markNotificationsAsViewed(); document.getElementById('notificationsDropdown').classList.toggle('show'); };
    document.getElementById('clearNotifBtn').onclick = async () => { if(currentUser) await apiCall(`/notifications/${currentUser.bkash}`, 'DELETE'); userNotifications = []; updateNotifUI(); updateBellBadge(); };
    
    // Admin
    document.getElementById('closeAdminPageBtn').onclick = closeAdminPanel;
    document.querySelectorAll('.admin-nav-link').forEach(btn => btn.onclick = () => switchAdminPage(btn.dataset.adminPage));
    
    // Pay User Tabs
    document.getElementById('payUserListTab').onclick = () => {
        document.getElementById('payUserListTab').classList.add('active');
        document.getElementById('payHistoryTab').classList.remove('active');
        document.getElementById('payUserListContainer').style.display = 'block';
        document.getElementById('payHistoryContainer').style.display = 'none';
        renderPayUserList();
    };
    
    document.getElementById('payHistoryTab').onclick = () => {
        document.getElementById('payHistoryTab').classList.add('active');
        document.getElementById('payUserListTab').classList.remove('active');
        document.getElementById('payUserListContainer').style.display = 'none';
        document.getElementById('payHistoryContainer').style.display = 'block';
        renderPayHistory();
    };
    
    // Search
    document.getElementById('searchUserBtn').onclick = renderUsersPage;
    document.getElementById('pendingSearchBtn').onclick = () => {
        const searchTerm = document.getElementById('pendingSearchInput').value;
        if(searchTerm) {
            loadAdminData(true).then(() => renderPendingPosts(searchTerm));
        } else {
            loadAdminData().then(() => renderPendingPosts());
        }
    };
    document.getElementById('approvedSearchBtn').onclick = () => renderApprovedPosts(document.getElementById('approvedSearchInput').value);
    document.getElementById('rejectedSearchBtn').onclick = () => renderRejectedPosts(document.getElementById('rejectedSearchInput').value);
    document.getElementById('adminUserSearchBtn').onclick = () => renderAdminUsers(document.getElementById('adminUserSearchInput').value);
    document.getElementById('payUserSearchBtn').onclick = () => renderPayUserList(document.getElementById('payUserSearchInput').value);
    
    // Copy withdraw code
    document.getElementById('copyWithdrawCodeBtn')?.addEventListener('click', () => { 
        const code = document.getElementById('profileWithdrawCodeDisplay').innerText; 
        if(code && code !== '------') { navigator.clipboard.writeText(code); showToast('Code copied!'); } 
    });
    
    // Global click handlers
    document.addEventListener('click', (e) => {
        if(!document.getElementById('mailIconBtn').contains(e.target) && !document.getElementById('mailMenu').contains(e.target)) 
            document.getElementById('mailMenu').classList.remove('show');
        if(!document.getElementById('notificationBell').contains(e.target) && !document.getElementById('notificationsDropdown').contains(e.target)) 
            document.getElementById('notificationsDropdown').classList.remove('show');
        if(!document.getElementById('coinBoxBtn').contains(e.target) && !document.getElementById('coinPage').contains(e.target)) 
            document.getElementById('coinPage').classList.remove('show');
        if(e.target === document.getElementById('modalOverlay')) closeModals();
    });
    
    // Make functions globally available
    window.adminAddCoins = adminAddCoins;
    window.adminRemoveCoins = adminRemoveCoins;
    window.adminDeleteUser = adminDeleteUser;
    window.adminSendMoneyToUser = adminSendMoneyToUser;
    window.adminSendNotification = adminSendNotification;
    window.markWithdrawalComplete = markWithdrawalComplete;
    window.viewUserProfile = viewUserProfile;
    window.togglePassword = togglePassword;
    window.copyPostCredentials = copyPostCredentials;
    window.approvePost = approvePost;
    window.rejectPost = rejectPost;
    window.removeFromPending = removeFromPending;
    window.restoreRemovedPost = restoreRemovedPost;
    window.markUserAsPaid = markUserAsPaid;
};