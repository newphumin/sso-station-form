// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ Supabase
// ==========================================
const SUPABASE_URL = 'https://fkgpxagdgdubdwtdxtry.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZ3B4YWdkZ2R1YmR3dGR4dHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTE5MDIsImV4cCI6MjEwNTAyNzkwMn0.IosqraENXtMvgrzOdiIK01bRqxe_H8HdBNwtUt7O_e8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ตัวแปรสถานะ & Pagination
// ==========================================
let isSystemOpen = false;
let filterMapping = []; 
let tambolMapping = new Map(); 

let currentUserProfile = { name: '', sso: '' };
let pendingSaveData = null; 
let currentlyEditingCode = null; 
let pendingAdminAction = null; 

let currentSearchData = []; 
let currentPage = 1;
const itemsPerPage = 100;

// ==========================================
// 3. ฟังก์ชันสิทธิ์ผู้ใช้งาน (Role-Based Access)
// ==========================================
function getRoleAccess() {
    if (!currentUserProfile.sso) return { type: 'NONE', prov: null, sso: null };
    const ssoCode = currentUserProfile.sso.split(' - ')[0]; 
    
    if (ssoCode === '1000') return { type: 'ADMIN', prov: null, sso: null };
    
    const ssoNum = parseInt(ssoCode, 10);
    // กทม. รหัส 1001 - 1012 (ล็อกเขต)
    if (ssoNum >= 1001 && ssoNum <= 1012) {
        return { type: 'BKK_BRANCH', prov: '10', sso: ssoCode };
    }
    
    // ต่างจังหวัด (ล็อกจังหวัด) อ่านรหัสจังหวัดจาก 2 ตัวแรก
    const provCode = ssoCode.substring(0, 2);
    return { type: 'PROVINCE', prov: provCode, sso: null };
}

function applyRoleBasedFilters(prefix = 'filter') {
    const access = getRoleAccess();
    const pSel = document.getElementById(`${prefix}Province`);
    const sSel = document.getElementById(`${prefix}SSO`);
    const aSel = document.getElementById(`${prefix}Amphur`);
    
    if (!pSel || filterMapping.length === 0) return;

    pSel.disabled = false; sSel.disabled = true; aSel.disabled = true;
    
    if (access.type === 'ADMIN') {
        pSel.value = '';
        sSel.innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>';
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>';
    } 
    else if (access.type === 'BKK_BRANCH') {
        pSel.value = access.prov; pSel.disabled = true; 
        
        const sMap = new Map();
        filterMapping.filter(i => i.province_code == access.prov).forEach(i => {
            if (i.sso_branch_code && !sMap.has(i.sso_branch_code)) sMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
        });
        populateDropdown(`${prefix}SSO`, Array.from(sMap, ([value, text]) => ({value, text})), '-- แสดงทุกสำนักงาน --');
        sSel.value = access.sso; sSel.disabled = true; 
        
        const aMap = new Map();
        filterMapping.filter(i => i.province_code == access.prov && i.sso_branch_code == access.sso).forEach(i => {
            if (i.amphur_code && !aMap.has(i.amphur_code)) aMap.set(i.amphur_code, `${i.amphur_code} - ${i.amphur_name}`);
        });
        populateDropdown(`${prefix}Amphur`, Array.from(aMap, ([value, text]) => ({value, text})), '-- แสดงทุกอำเภอ --');
        aSel.disabled = false; 
    }
    else if (access.type === 'PROVINCE') {
        pSel.value = access.prov; pSel.disabled = true; 
        
        const sMap = new Map();
        filterMapping.filter(i => i.province_code == access.prov).forEach(i => {
            if (i.sso_branch_code && !sMap.has(i.sso_branch_code)) sMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
        });
        populateDropdown(`${prefix}SSO`, Array.from(sMap, ([value, text]) => ({value, text})), '-- แสดงทุกสำนักงาน --');
        sSel.disabled = false; 
        
        sSel.value = '';
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>';
    }
}

// ==========================================
// 4. ฟังก์ชัน Custom Alerts & Confirm
// ==========================================
function customAlert(title, message, type = 'info') {
    const modal = document.getElementById('customAlertModal');
    if (!modal) return;
    const iconBox = document.getElementById('alertIconBox');
    const icon = document.getElementById('alertIcon');
    const titleEl = document.getElementById('alertTitle');
    
    icon.className = ''; titleEl.innerText = title; document.getElementById('alertMessage').innerText = message;

    if (type === 'success') {
        iconBox.className = 'py-5 bg-green-50 border-b border-green-100'; icon.className = 'fa-solid fa-circle-check text-5xl text-green-500'; titleEl.className = 'text-xl font-bold text-green-700 mb-2';
    } else if (type === 'error') {
        iconBox.className = 'py-5 bg-red-50 border-b border-red-100'; icon.className = 'fa-solid fa-circle-xmark text-5xl text-red-500'; titleEl.className = 'text-xl font-bold text-red-700 mb-2';
    } else if (type === 'warning') {
        iconBox.className = 'py-5 bg-yellow-50 border-b border-yellow-100'; icon.className = 'fa-solid fa-circle-exclamation text-5xl text-yellow-500'; titleEl.className = 'text-xl font-bold text-yellow-700 mb-2';
    } else {
        iconBox.className = 'py-5 bg-blue-50 border-b border-blue-100'; icon.className = 'fa-solid fa-circle-info text-5xl text-blue-500'; titleEl.className = 'text-xl font-bold text-blue-700 mb-2';
    }
    modal.classList.remove('hidden');
}

function customConfirm(title, message, callbackOk) {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) { if(confirm(message)) callbackOk(); return; }
    
    document.getElementById('confirmTitle').innerText = title; document.getElementById('confirmMessage').innerText = message;
    const btnOk = document.getElementById('btnConfirmOk'); const btnCancel = document.getElementById('btnConfirmCancel');
    
    const newBtnOk = btnOk.cloneNode(true); const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk); btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    
    newBtnOk.addEventListener('click', () => { modal.classList.add('hidden'); callbackOk(); });
    newBtnCancel.addEventListener('click', () => { modal.classList.add('hidden'); });
    modal.classList.remove('hidden');
}

// ==========================================
// 5. Admin Auth
// ==========================================
function requireAdminAuth(actionCallback) {
    const pwdInput = document.getElementById('adminPasswordInput');
    const modal = document.getElementById('adminAuthModal');
    if (!pwdInput || !modal) return;
    pendingAdminAction = actionCallback; 
    pwdInput.value = ''; modal.classList.remove('hidden'); pwdInput.focus();
}

function closeAdminAuth() {
    const modal = document.getElementById('adminAuthModal');
    if(modal) modal.classList.add('hidden');
    pendingAdminAction = null; 
}

async function verifyAdminPassword() {
    const pwdInput = document.getElementById('adminPasswordInput');
    const pwd = pwdInput.value.trim();
    if (!pwd) { customAlert('แจ้งเตือน', 'กรุณากรอกรหัสผ่าน', 'warning'); return; }

    const btn = document.getElementById('btnAdminVerify');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ตรวจสอบ...';

    const { data, error } = await supabaseClient.from('system_settings_1').select('setting_value').eq('setting_name', 'admin_auth').maybeSingle();
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> ยืนยันรหัสผ่าน';

    if (error || !data) { customAlert('ระบบขัดข้อง', 'ไม่พบการตั้งค่ารหัสผ่านผู้ดูแลระบบในฐานข้อมูล', 'error'); closeAdminAuth(); return; }
    if (data.setting_value === pwd) {
        const actionToExecute = pendingAdminAction; 
        closeAdminAuth(); 
        if (actionToExecute) actionToExecute(); 
    } else {
        customAlert('ปฏิเสธการเข้าถึง', 'รหัสผ่านไม่ถูกต้อง', 'error');
        pwdInput.value = ''; pwdInput.focus();
    }
}

// ==========================================
// 6. User Profile
// ==========================================
function loadUserProfile() {
    const savedName = localStorage.getItem('sso_user_name'); const savedSSO = localStorage.getItem('sso_user_sso');
    if (savedName && savedSSO) { currentUserProfile = { name: savedName, sso: savedSSO }; updateProfileDisplay(); } 
    else document.getElementById('profileModal').classList.remove('hidden');
}

function updateProfileDisplay() {
    document.getElementById('userProfileDisplay').innerHTML = `
        <i class="fa-solid fa-user-circle mr-1"></i> ผู้ทำรายการ: <b>${currentUserProfile.name}</b> [${currentUserProfile.sso}] 
        <button onclick="document.getElementById('profileModal').classList.remove('hidden')" class="ml-2 text-blue-200 hover:text-white px-1 rounded hover:bg-blue-800 transition" title="แก้ไขโปรไฟล์"><i class="fa-solid fa-pen text-xs"></i></button>
    `;
    document.getElementById('profNameInput').value = currentUserProfile.name;
    document.getElementById('profSSOInput').value = currentUserProfile.sso;
}

function saveUserProfile() {
    const pName = document.getElementById('profNameInput').value.trim(); const pSSO = document.getElementById('profSSOInput').value;
    if (!pName || !pSSO) { customAlert('ข้อมูลไม่ครบ', 'กรุณากรอกชื่อและเลือกสังกัดหน่วยงานให้ครบถ้วน', 'warning'); return; }
    
    localStorage.setItem('sso_user_name', pName); localStorage.setItem('sso_user_sso', pSSO);
    currentUserProfile = { name: pName, sso: pSSO };
    updateProfileDisplay(); 
    document.getElementById('profileModal').classList.add('hidden');
    
    applyRoleBasedFilters('filter');
    document.getElementById('btnClear').click(); 
}

// ==========================================
// 7. โหลดข้อมูลเริ่มต้น และ Filter
// ==========================================
async function checkSystemStatus() {
    try {
        const { data } = await supabaseClient.from('system_settings_1').select('is_active').eq('setting_name', 'is_form_open').maybeSingle();
        isSystemOpen = data ? data.is_active : false;
        const badge = document.getElementById('systemStatusBadge');
        if (!badge) return;
        if (isSystemOpen) {
            badge.innerHTML = '<i class="fa-solid fa-check-circle text-green-400"></i> ระบบเปิดรับข้อมูล';
            badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-green-900/80 text-white border border-green-700 shadow-sm flex items-center gap-2';
        } else {
            badge.innerHTML = '<i class="fa-solid fa-lock text-red-400"></i> ระบบปิดรับข้อมูล (หมดเวลา)';
            badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-red-900/80 text-white border border-red-700 shadow-sm flex items-center gap-2';
        }
        document.querySelectorAll('.btn-edit').forEach(btn => btn.disabled = !isSystemOpen);
    } catch (err) { console.error('Error:', err); }
}

async function toggleSystemStatus() {
    const newStatus = !isSystemOpen;
    const title = 'ยืนยันการตั้งค่า';
    const msg = newStatus ? 'คุณต้องการ "เปิด" ระบบรับข้อมูลใช่หรือไม่?' : 'คุณต้องการ "ปิด" ระบบรับข้อมูลใช่หรือไม่?';

    customConfirm(title, msg, async () => {
        const { data: existing } = await supabaseClient.from('system_settings_1').select('setting_name').eq('setting_name', 'is_form_open').maybeSingle();
        let error;
        if (existing) error = (await supabaseClient.from('system_settings_1').update({ is_active: newStatus }).eq('setting_name', 'is_form_open')).error;
        else error = (await supabaseClient.from('system_settings_1').insert([{ setting_name: 'is_form_open', is_active: newStatus }])).error;
            
        if(error) customAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะระบบได้: ' + error.message, 'error');
        else { 
            customAlert('สำเร็จ', `เปลี่ยนสถานะเป็น ${newStatus ? 'เปิด' : 'ปิด'}ระบบ เรียบร้อยแล้ว`, 'success'); 
            checkSystemStatus(); 
            if (!newStatus && currentlyEditingCode !== null) {
                const idx = currentSearchData.findIndex(row => row.polling_station_code == currentlyEditingCode);
                if (idx !== -1) cancelEdit(currentlyEditingCode, idx);
            }
        }
    });
}

async function loadTambolMaster() {
    let allTambols = []; let from = 0; const step = 1000; let hasMore = true;
    try {
        while (hasMore) {
            const { data, error } = await supabaseClient.from('ms_tambol').select('amphur_code, tambol_code, tambol_name, post_code').range(from, from + step - 1);
            if (error) throw error;
            if (data && data.length > 0) { allTambols = allTambols.concat(data); from += step; if (data.length < step) hasMore = false; } else hasMore = false;
        }
        tambolMapping.clear();
        allTambols.forEach(i => {
            if (i.amphur_code && i.tambol_code) {
                const aCodeStr = String(i.amphur_code); const tCodeStr = String(i.tambol_code);
                if (!tambolMapping.has(aCodeStr)) tambolMapping.set(aCodeStr, new Map());
                tambolMapping.get(aCodeStr).set(tCodeStr, { name: i.tambol_name, zip: i.post_code ? String(i.post_code) : '' });
            }
        });
    } catch (err) {}
}

async function loadFilterOptions() {
    const provSelect = document.getElementById('filterProvince');
    if(!provSelect) return;
    provSelect.innerHTML = '<option value="">-- กำลังดึงข้อมูล... --</option>'; provSelect.disabled = true;

    let allData = []; let from = 0; const step = 1000; let hasMore = true;
    try {
        while (hasMore) {
            const { data, error } = await supabaseClient.from('ms_station_1')
                .select('polling_station_code, province_code, province_name, sso_branch_code, sso_name, amphur_code, amphur_name')
                .order('province_code').order('sso_branch_code').order('amphur_code').range(from, from + step - 1);
            if (error) throw error;
            if (data && data.length > 0) { allData = allData.concat(data); from += step; if (data.length < step) hasMore = false; } else hasMore = false;
        }

        if (allData.length > 0) {
            filterMapping = allData; 
            const provMap = new Map();
            filterMapping.forEach(i => { if (i.province_code && !provMap.has(i.province_code)) provMap.set(i.province_code, `${i.province_code} - ${i.province_name}`); });
            populateDropdown('filterProvince', Array.from(provMap, ([value, text]) => ({value, text})), '-- แสดงทุกจังหวัด --');

            const ssoGlobalMap = new Map();
            filterMapping.forEach(i => { if (i.sso_branch_code && !ssoGlobalMap.has(i.sso_branch_code)) ssoGlobalMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`); });
            const profileSSOs = [{value: '1000 - ส่วนกลาง', text: '1000 - ส่วนกลาง'}];
            Array.from(ssoGlobalMap).forEach(([v, t]) => profileSSOs.push({value: t, text: t}));
            populateDropdown('profSSOInput', profileSSOs, '-- เลือกหน่วยงานต้นสังกัด --');
            
            if(currentUserProfile.sso) { 
                const ssoInput = document.getElementById('profSSOInput'); if(ssoInput) ssoInput.value = currentUserProfile.sso; 
                applyRoleBasedFilters('filter');
            } else {
                provSelect.disabled = false;
            }
        } else provSelect.innerHTML = '<option value="">-- ไม่พบข้อมูลในระบบ --</option>';
    } catch (err) {
        provSelect.innerHTML = '<option value="">-- โหลดข้อมูลล้มเหลว --</option>';
        customAlert('ดึงข้อมูลล้มเหลว', 'โปรดตรวจสอบการเชื่อมต่อฐานข้อมูล\n' + err.message, 'error');
    }
}

function populateDropdown(elementId, items, defaultText) {
    const sel = document.getElementById(elementId);
    if(!sel) return;
    sel.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(i => sel.innerHTML += `<option value="${i.value}">${i.text}</option>`);
}

function setupDropdownEvents() {
    const pSel = document.getElementById('filterProvince'); const sSel = document.getElementById('filterSSO'); const aSel = document.getElementById('filterAmphur');
    if(!pSel || !sSel || !aSel) return;

    pSel.addEventListener('change', (e) => {
        sSel.innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>'; sSel.disabled = true;
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>'; aSel.disabled = true;
        if (!e.target.value) return; 
        const sMap = new Map();
        filterMapping.filter(i => i.province_code == e.target.value).forEach(i => {
            if (i.sso_branch_code && !sMap.has(i.sso_branch_code)) sMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
        });
        populateDropdown('filterSSO', Array.from(sMap, ([value, text]) => ({value, text})), '-- แสดงทุกสำนักงาน --');
        sSel.disabled = false;
    });

    sSel.addEventListener('change', (e) => {
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>'; aSel.disabled = true;
        if (!e.target.value) return;
        const aMap = new Map();
        filterMapping.filter(i => i.province_code == pSel.value && i.sso_branch_code == e.target.value).forEach(i => {
            if (i.amphur_code && !aMap.has(i.amphur_code)) aMap.set(i.amphur_code, `${i.amphur_code} - ${i.amphur_name}`);
        });
        populateDropdown('filterAmphur', Array.from(aMap, ([value, text]) => ({value, text})), '-- แสดงทุกอำเภอ --');
        aSel.disabled = false;
    });
}

// ==========================================
// 8. ฟังก์ชันค้นหา, แบ่งหน้า (Pagination) และตาราง
// ==========================================
async function searchData() {
    currentlyEditingCode = null; 
    const tb = document.getElementById('dataTableBody');
    if(!tb) return;
    tb.innerHTML = `<tr><td colspan="9" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i><br>กำลังค้นหาข้อมูล...</td></tr>`;
    document.getElementById('paginationContainerTop').classList.add('hidden');
    document.getElementById('paginationContainerBottom').classList.add('hidden');
    
    const p = document.getElementById('filterProvince').value; 
    const s = document.getElementById('filterSSO').value;
    const a = document.getElementById('filterAmphur').value; 
    const txt = document.getElementById('searchInput').value.trim();

    let allFetchedData = [];
    let fetchFrom = 0; const fetchStep = 1000; let hasMoreData = true;
    const access = getRoleAccess(); 

    try {
        while (hasMoreData) {
            let query = supabaseClient.from('ms_station_1').select('*');
            
            // [Security] บังคับคัดกรองข้อมูลตามสิทธิ์ระดับฐานข้อมูลเสมอ
            if (access.type === 'BKK_BRANCH') query = query.eq('sso_branch_code', access.sso);
            else if (access.type === 'PROVINCE') query = query.eq('province_code', access.prov);

            if (p) query = query.eq('province_code', p);
            if (s) query = query.eq('sso_branch_code', s);
            if (a) query = query.eq('amphur_code', a);
            if (txt) {
                if (!isNaN(txt) && txt !== '') query = query.or(`polling_station_code.eq.${txt},polling_station_name.ilike.%${txt}%`);
                else query = query.ilike('polling_station_name', `%${txt}%`);
            }

            const { data, error } = await query.order('polling_station_code', { ascending: true }).range(fetchFrom, fetchFrom + fetchStep - 1);
            
            if (error) throw error;
            if (data && data.length > 0) { 
                allFetchedData = allFetchedData.concat(data); fetchFrom += fetchStep; 
                if (data.length < fetchStep) hasMoreData = false; 
            } else { hasMoreData = false; }
        }
    } catch (err) {
        tb.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-red-500">Error: ${err.message}</td></tr>`; return;
    }

    currentSearchData = allFetchedData;
    currentPage = 1;
    document.getElementById('recordCount').innerText = `พบข้อมูล ${currentSearchData.length} รายการ`;
    renderCurrentPage();
}

function renderCurrentPage() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentSearchData.slice(startIndex, endIndex);
    
    renderTable(pageData, startIndex);
    renderPagination();
}

window.goToPage = function(page) {
    const totalPages = Math.ceil(currentSearchData.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    
    if (currentlyEditingCode !== null) {
        customAlert('แจ้งเตือน', `กรุณาบันทึกหรือยกเลิกการแก้ไขให้เสร็จสิ้นก่อนเปลี่ยนหน้า`, 'warning');
        return;
    }
    
    currentPage = page;
    renderCurrentPage();
};

function renderPagination() {
    const containerTop = document.getElementById('paginationContainerTop');
    const containerBottom = document.getElementById('paginationContainerBottom');
    if (!containerTop || !containerBottom) return;
    
    const totalPages = Math.ceil(currentSearchData.length / itemsPerPage);
    
    if (currentSearchData.length === 0) {
        containerTop.classList.add('hidden'); containerBottom.classList.add('hidden'); return;
    }

    containerTop.classList.remove('hidden'); containerBottom.classList.remove('hidden');

    const startItem = ((currentPage - 1) * itemsPerPage) + 1;
    const endItem = Math.min(currentPage * itemsPerPage, currentSearchData.length);
    
    let html = `<div class="text-sm text-slate-500 mb-3 md:mb-0">แสดงผล <span class="font-bold">${startItem} - ${endItem}</span> จาก <span class="font-bold">${currentSearchData.length}</span> รายการ</div>`;
    html += `<div class="flex items-center gap-1">`;
    html += `<button onclick="goToPage(${currentPage - 1})" class="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left mr-1"></i> ก่อนหน้า</button>`;
    
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        html += `<button onclick="goToPage(1)" class="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-100 text-slate-600 transition">1</button>`;
        if (startPage > 2) html += `<span class="px-2 text-slate-400">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'bg-[#1e3a8a] text-white border-[#1e3a8a] font-bold shadow-sm' : 'border-slate-300 hover:bg-slate-100 text-slate-600';
        html += `<button onclick="goToPage(${i})" class="px-3 py-1.5 border rounded text-sm transition ${activeClass}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="px-2 text-slate-400">...</span>`;
        html += `<button onclick="goToPage(${totalPages})" class="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-100 text-slate-600 transition">${totalPages}</button>`;
    }

    html += `<button onclick="goToPage(${currentPage + 1})" class="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition" ${currentPage === totalPages ? 'disabled' : ''}>ถัดไป <i class="fa-solid fa-chevron-right ml-1"></i></button>`;
    html += `</div>`;

    containerTop.innerHTML = html; containerBottom.innerHTML = html;
}

function renderTable(data, startIndex) {
    const tb = document.getElementById('dataTableBody');
    tb.innerHTML = '';
    if (data.length === 0) { tb.innerHTML = `<tr><td colspan="9" class="text-center py-16 text-slate-400">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`; return; }

    data.forEach((row, idx) => {
        const absoluteIndex = startIndex + idx;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100 relative';
        
        const aCodeStr = String(row.amphur_code);
        let tambolOptionsHTML = `<option value="">-- เลือกตำบล --</option>`;
        if (tambolMapping.has(aCodeStr)) {
            const tMap = tambolMapping.get(aCodeStr);
            const sortedTambols = Array.from(tMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            sortedTambols.forEach(([tCode, tData]) => {
                const selected = (String(row.tambol_code) === tCode) ? 'selected' : '';
                tambolOptionsHTML += `<option value="${tCode}" ${selected}>${tCode} - ${tData.name}</option>`;
            });
        } else tambolOptionsHTML = `<option value="">-- ไม่มีข้อมูลตำบล --</option>`;

        tr.innerHTML = `
            <td class="px-3 py-3 text-slate-600 text-xs whitespace-normal break-words">${row.province_code || ''} - ${row.province_name || '-'} > ${row.amphur_name || '-'}<br><span class="font-semibold text-slate-800">${row.sso_branch_code || ''} - ${row.sso_name || '-'}</span></td>
            
            <!-- [แก้ไข] จัดให้รหัสหน่วยอยู่กึ่งกลาง เพื่อความสวยงาม -->
            <td class="px-2 py-3 font-semibold text-[#1e3a8a] whitespace-nowrap text-center">${row.polling_station_code}</td>
            
            <td class="px-2 py-2"><input type="text" id="name_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-slate-800 font-medium" value="${row.polling_station_name || ''}" disabled></td>
            <td class="px-2 py-2"><input type="text" id="loc_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-slate-800" value="${row.location_name || ''}" disabled></td>
            <td class="px-2 py-2"><input type="text" id="addr_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-slate-800" value="${row.address || ''}" disabled></td>
            <td class="px-2 py-2"><select id="tam_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-slate-800 appearance-none" disabled onchange="updateZipCode('${row.polling_station_code}', '${row.amphur_code}')">${tambolOptionsHTML}</select></td>
            <td class="px-2 py-2"><input type="text" id="zip_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-slate-500 bg-slate-100/50 text-center" value="${row.postal_code || ''}" readonly disabled></td>
            <td class="px-2 py-2"><input type="text" id="url_${row.polling_station_code}" class="w-full min-w-0 p-2 rounded editable-input text-blue-600 text-ellipsis" value="${row.location_url || ''}" disabled title="${row.location_url || ''}"></td>
            <td class="px-2 py-3 text-center align-middle bg-white">
                <button id="btn_edit_${row.polling_station_code}" onclick="enableEdit('${row.polling_station_code}')" class="btn-edit bg-orange-500 hover:bg-orange-600 text-white px-2 py-1.5 rounded shadow-sm text-xs font-bold w-full transition" ${!isSystemOpen ? 'disabled' : ''}><i class="fa-solid fa-pen"></i> แก้ไข</button>
                <div id="action_group_${row.polling_station_code}" class="hidden gap-1 justify-center">
                    <button id="btn_save_${row.polling_station_code}" onclick="prepareSaveData('${row.polling_station_code}', ${absoluteIndex})" class="btn-save bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded shadow-sm text-xs font-bold flex-1 transition" title="บันทึก"><i class="fa-solid fa-save"></i></button>
                    <button id="btn_cancel_${row.polling_station_code}" onclick="cancelEdit('${row.polling_station_code}', ${absoluteIndex})" class="btn-cancel bg-slate-500 hover:bg-slate-600 text-white px-2 py-1.5 rounded shadow-sm text-xs font-bold flex-1 transition" title="ยกเลิกการแก้ไข"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </td>
        `;
        tb.appendChild(tr);
    });
}

function updateZipCode(code, amphurCode) {
    const selectedTamCode = document.getElementById(`tam_${code}`).value; 
    const zipInput = document.getElementById(`zip_${code}`);
    const aCodeStr = String(amphurCode); 
    if (selectedTamCode && tambolMapping.has(aCodeStr)) {
        const tMap = tambolMapping.get(aCodeStr);
        if (tMap.has(selectedTamCode)) zipInput.value = tMap.get(selectedTamCode).zip; else zipInput.value = '';
    } else zipInput.value = '';
}

// ==========================================
// 9. ระบบล็อกสถานะ และแก้ไข
// ==========================================
function enableEdit(code) {
    if (!isSystemOpen) { customAlert('ไม่อนุญาต', 'ระบบปิดรับข้อมูลแล้ว ไม่สามารถแก้ไขได้', 'error'); return; }
    if (currentlyEditingCode !== null && currentlyEditingCode !== code) { customAlert('แจ้งเตือน', `กรุณาบันทึกหรือยกเลิกแถวรหัส ${currentlyEditingCode} ให้เสร็จสิ้นก่อน`, 'warning'); return; }
    currentlyEditingCode = code; 
    
    const ids = [`name_${code}`, `loc_${code}`, `addr_${code}`, `tam_${code}`, `url_${code}`]; 
    ids.forEach(id => { const el = document.getElementById(id); el.disabled = false; el.classList.add('bg-yellow-50', 'border-yellow-300'); });
    
    document.getElementById(`zip_${code}`).classList.add('bg-slate-100', 'border-yellow-300', 'text-slate-800');
    document.getElementById(`btn_edit_${code}`).classList.add('hidden');
    
    const actionGroup = document.getElementById(`action_group_${code}`); actionGroup.classList.remove('hidden'); actionGroup.classList.add('flex');
    document.getElementById(ids[0]).focus();
}

function cancelEdit(code, absoluteIndex) {
    const oldData = currentSearchData[absoluteIndex];
    document.getElementById(`name_${code}`).value = oldData.polling_station_name || '';
    document.getElementById(`loc_${code}`).value = oldData.location_name || '';
    document.getElementById(`addr_${code}`).value = oldData.address || '';
    document.getElementById(`tam_${code}`).value = oldData.tambol_code || '';
    document.getElementById(`zip_${code}`).value = oldData.postal_code || '';
    document.getElementById(`url_${code}`).value = oldData.location_url || '';

    const ids = [`name_${code}`, `loc_${code}`, `addr_${code}`, `tam_${code}`, `zip_${code}`, `url_${code}`];
    ids.forEach(id => { const el = document.getElementById(id); el.disabled = true; el.classList.remove('bg-yellow-50', 'border-yellow-300', 'bg-slate-100', 'text-slate-800'); });

    const actionGroup = document.getElementById(`action_group_${code}`); actionGroup.classList.remove('flex'); actionGroup.classList.add('hidden');
    document.getElementById(`btn_edit_${code}`).classList.remove('hidden');
    currentlyEditingCode = null; 
}

// ==========================================
// 10. ระบบตรวจสอบ และ บันทึกข้อมูล
// ==========================================
function prepareSaveData(code, absoluteIndex) {
    if (!isSystemOpen) return;
    const oldData = currentSearchData[absoluteIndex];
    const newName = document.getElementById(`name_${code}`).value.trim(); const newLoc = document.getElementById(`loc_${code}`).value.trim();
    const newAddr = document.getElementById(`addr_${code}`).value.trim(); const newTamCode = document.getElementById(`tam_${code}`).value;
    const newZip = document.getElementById(`zip_${code}`).value.trim(); const newUrl = document.getElementById(`url_${code}`).value.trim();

    let newTamName = ''; const aCodeStr = String(oldData.amphur_code);
    if (newTamCode && tambolMapping.has(aCodeStr)) {
        const tMap = tambolMapping.get(aCodeStr);
        if (tMap.has(newTamCode)) newTamName = tMap.get(newTamCode).name;
    }

    if (oldData.polling_station_name === newName && oldData.location_name === newLoc && oldData.location_url === newUrl && 
        oldData.address === newAddr && String(oldData.tambol_code || '') === newTamCode && oldData.postal_code === newZip) {
        customAlert('ข้อมูลไม่เปลี่ยนแปลง', 'คุณยังไม่ได้แก้ไขข้อมูลใดๆ ในแถวนี้', 'info'); return;
    }

    pendingSaveData = { code, index: absoluteIndex, oldData, newName, newLoc, newAddr, newTamCode, newTamName, newZip, newUrl };

    document.getElementById('confirmCodeBadge').innerText = `รหัส: ${code}`;
    setConfirmRow('Name', oldData.polling_station_name, newName); setConfirmRow('Loc', oldData.location_name, newLoc); setConfirmRow('Addr', oldData.address, newAddr);
    
    const oldTamDisplay = oldData.tambol_code ? `${oldData.tambol_code} - ${oldData.tambol_name}` : '';
    const newTamDisplay = newTamCode ? `${newTamCode} - ${newTamName}` : '';
    setConfirmRow('Tam', oldTamDisplay, newTamDisplay);
    setConfirmRow('Zip', oldData.postal_code, newZip); setConfirmRow('Url', oldData.location_url, newUrl);

    document.getElementById('confSignature').innerHTML = `<i class="fa-solid fa-user-pen mr-1 text-[#1e3a8a]"></i> บันทึกรายการโดย: <span class="font-semibold text-[#1e3a8a]">${currentUserProfile.name} [${currentUserProfile.sso}]</span>`;
    document.getElementById('confirmSaveModal').classList.remove('hidden');
}

function setConfirmRow(field, oldVal, newVal) {
    const oldEl = document.getElementById(`confOld${field}`); const newEl = document.getElementById(`confNew${field}`);
    if(!oldEl || !newEl) return;
    oldEl.innerText = oldVal || '-'; newEl.innerText = newVal || '-';
    if (oldVal !== newVal) { oldEl.classList.add('line-through', 'text-slate-400'); newEl.classList.add('highlight-change'); } 
    else { oldEl.classList.remove('line-through', 'text-slate-400'); newEl.classList.remove('highlight-change'); }
}

function closeConfirmModal() { const m = document.getElementById('confirmSaveModal'); if(m) m.classList.add('hidden'); pendingSaveData = null; }
function escapeSQL(val) { return !val ? '' : val.replace(/'/g, "''"); }

async function executeSaveData() {
    if (!pendingSaveData) return;
    const { code, index, oldData, newName, newLoc, newAddr, newTamCode, newTamName, newZip, newUrl } = pendingSaveData;
    const btnEx = document.getElementById('btnConfirmExecute');
    
    btnEx.disabled = true; btnEx.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    const tamCodeSQL = newTamCode ? newTamCode : 'NULL';
    const sqlScript = `UPDATE ms_polling_station SET polling_station_name = '${escapeSQL(newName)}', location_name = '${escapeSQL(newLoc)}', address = '${escapeSQL(newAddr)}', tambol_code = ${tamCodeSQL}, tambol_name = '${escapeSQL(newTamName)}', postal_code = '${escapeSQL(newZip)}', location_url = '${escapeSQL(newUrl)}' WHERE polling_station_code = ${code};`;
    const signature = `${currentUserProfile.name} [${currentUserProfile.sso}]`;

    const { error: updateError } = await supabaseClient.from('ms_station_1')
        .update({ polling_station_name: newName, location_name: newLoc, address: newAddr, tambol_code: newTamCode || null, tambol_name: newTamName, postal_code: newZip, location_url: newUrl })
        .eq('polling_station_code', code);

    if (updateError) { customAlert('บันทึกไม่สำเร็จ', updateError.message, 'error'); btnEx.disabled = false; btnEx.innerHTML = '<i class="fa-solid fa-save"></i> ยืนยันการบันทึก'; return; }

    await supabaseClient.from('station_update_logs').insert([{
        polling_station_code: code.toString(),
        old_station_name: oldData.polling_station_name, new_station_name: newName,
        old_location_name: oldData.location_name, new_location_name: newLoc,
        old_address: oldData.address, new_address: newAddr,
        old_tambol_code: oldData.tambol_code, new_tambol_code: newTamCode || null,
        old_tambol_name: oldData.tambol_name, new_tambol_name: newTamName,
        old_postal_code: oldData.postal_code, new_postal_code: newZip,
        old_location_url: oldData.location_url, new_location_url: newUrl,
        sql_script: sqlScript, updated_by: signature 
    }]);

    currentSearchData[index].polling_station_name = newName; currentSearchData[index].location_name = newLoc;
    currentSearchData[index].address = newAddr; currentSearchData[index].tambol_code = newTamCode;
    currentSearchData[index].tambol_name = newTamName; currentSearchData[index].postal_code = newZip; currentSearchData[index].location_url = newUrl;
    
    const ids = [`name_${code}`, `loc_${code}`, `addr_${code}`, `tam_${code}`, `zip_${code}`, `url_${code}`];
    ids.forEach(id => { const el = document.getElementById(id); el.disabled = true; el.classList.remove('bg-yellow-50', 'border-yellow-300', 'bg-slate-100', 'text-slate-800'); });

    const actionGroup = document.getElementById(`action_group_${code}`); actionGroup.classList.remove('flex'); actionGroup.classList.add('hidden');
    document.getElementById(`btn_edit_${code}`).classList.remove('hidden');

    currentlyEditingCode = null; 
    btnEx.disabled = false; btnEx.innerHTML = '<i class="fa-solid fa-save"></i> ยืนยันการบันทึก';
    closeConfirmModal(); customAlert('บันทึกสำเร็จ', 'อัปเดตข้อมูลสถานที่เลือกตั้งเรียบร้อยแล้ว', 'success');
}

// ==========================================
// 11. ระบบ Export Excel 
// ==========================================
function openExcelModalFlow() {
    const pSel = document.getElementById('excelFilterProvince');
    if(pSel && pSel.options.length <= 1 && filterMapping.length > 0) {
        const provMap = new Map();
        filterMapping.forEach(i => { if (i.province_code && !provMap.has(i.province_code)) provMap.set(i.province_code, `${i.province_code} - ${i.province_name}`); });
        populateDropdown('excelFilterProvince', Array.from(provMap, ([value, text]) => ({value, text})), '-- ทุกจังหวัด --');
    }
    
    applyRoleBasedFilters('excelFilter');

    const exPSel = document.getElementById('excelFilterProvince'); const exSSel = document.getElementById('excelFilterSSO'); const exASel = document.getElementById('excelFilterAmphur');
    if(exPSel && !exPSel.hasAttribute('data-event-bound')) {
        exPSel.addEventListener('change', (e) => {
            exSSel.innerHTML = '<option value="">-- ทุกสำนักงาน --</option>'; exSSel.disabled = true; exASel.innerHTML = '<option value="">-- ทุกอำเภอ --</option>'; exASel.disabled = true;
            if (!e.target.value) return; 
            const sMap = new Map();
            filterMapping.filter(i => i.province_code == e.target.value).forEach(i => {
                if (i.sso_branch_code && !sMap.has(i.sso_branch_code)) sMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
            });
            populateDropdown('excelFilterSSO', Array.from(sMap, ([value, text]) => ({value, text})), '-- ทุกสำนักงาน --');
            exSSel.disabled = false;
        });
        exSSel.addEventListener('change', (e) => {
            exASel.innerHTML = '<option value="">-- ทุกอำเภอ --</option>'; exASel.disabled = true;
            if (!e.target.value) return;
            const aMap = new Map();
            filterMapping.filter(i => i.province_code == exPSel.value && i.sso_branch_code == e.target.value).forEach(i => {
                if (i.amphur_code && !aMap.has(i.amphur_code)) aMap.set(i.amphur_code, `${i.amphur_code} - ${i.amphur_name}`);
            });
            populateDropdown('excelFilterAmphur', Array.from(aMap, ([value, text]) => ({value, text})), '-- ทุกอำเภอ --');
            exASel.disabled = false;
        });
        exPSel.setAttribute('data-event-bound', 'true');
    }
    document.getElementById('exportExcelModal').classList.remove('hidden');
}

async function executeExcelExport() {
    const btnEx = document.getElementById('btnExecuteExcel');
    btnEx.disabled = true; btnEx.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้างไฟล์...';

    try {
        const p = document.getElementById('excelFilterProvince').value;
        const s = document.getElementById('excelFilterSSO').value;
        const a = document.getElementById('excelFilterAmphur').value;
        const access = getRoleAccess();

        let allLogs = [];
        let logFrom = 0; const logStep = 1000; let logHasMore = true;
        while(logHasMore) {
            const { data: logs, error: errLog } = await supabaseClient.from('station_update_logs')
                .select('*').order('updated_at', { ascending: true }).range(logFrom, logFrom + logStep - 1);
            if (errLog) throw errLog;
            if (logs && logs.length > 0) { allLogs = allLogs.concat(logs); logFrom += logStep; if (logs.length < logStep) logHasMore = false; } else logHasMore = false;
        }

        const latestLogs = new Map();
        allLogs.forEach(log => { latestLogs.set(String(log.polling_station_code), log); });

        if (latestLogs.size === 0) {
            customAlert('ไม่พบข้อมูล', 'ไม่มีประวัติการแก้ไขข้อมูลสถานที่เลือกตั้งในระบบ', 'warning');
            btnEx.disabled = false; btnEx.innerHTML = '<i class="fa-solid fa-download"></i> ดาวน์โหลด Excel';
            return;
        }

        let allStations = [];
        let stFrom = 0; const stStep = 1000; let stHasMore = true;
        while (stHasMore) {
            let q = supabaseClient.from('ms_station_1').select('polling_station_code, province_code, province_name, amphur_code, amphur_name, sso_branch_code, sso_name').range(stFrom, stFrom + stStep - 1);
            
            if (access.type === 'BKK_BRANCH') q = q.eq('sso_branch_code', access.sso);
            else if (access.type === 'PROVINCE') q = q.eq('province_code', access.prov);

            if (p) q = q.eq('province_code', p);
            if (s) q = q.eq('sso_branch_code', s);
            if (a) q = q.eq('amphur_code', a);
            
            const { data: stations, error: errSt } = await q;
            if (errSt) throw errSt;
            if (stations && stations.length > 0) { allStations = allStations.concat(stations); stFrom += stStep; if (stations.length < stStep) stHasMore = false; } else stHasMore = false;
        }

        allStations.sort((a, b) => {
            const ssoA = String(a.sso_branch_code || ''); const ssoB = String(b.sso_branch_code || '');
            if (ssoA !== ssoB) return ssoA.localeCompare(ssoB);
            const provA = String(a.province_code || ''); const provB = String(b.province_code || '');
            if (provA !== provB) return provA.localeCompare(provB);
            const ampA = String(a.amphur_code || ''); const ampB = String(b.amphur_code || '');
            if (ampA !== ampB) return ampA.localeCompare(ampB);
            const pollA = Number(a.polling_station_code) || 0; const pollB = Number(b.polling_station_code) || 0;
            return pollA - pollB; 
        });

        const excelData = [];
        allStations.forEach(st => {
            const codeStr = String(st.polling_station_code);
            if (latestLogs.has(codeStr)) {
                const log = latestLogs.get(codeStr);
                const dStr = new Date(log.updated_at).toLocaleString('th-TH');
                excelData.push({
                    "จังหวัด": st.province_name || '',
                    "สำนักงาน สปส.": st.sso_name || '',
                    "อำเภอ": st.amphur_name || '',
                    "รหัสหน่วย": codeStr,
                    "[เดิม] ชื่อสถานที่เลือกตั้ง": log.old_station_name || '',
                    "[ใหม่] ชื่อสถานที่เลือกตั้ง": log.new_station_name || '',
                    "[เดิม] ที่เลือกตั้ง": log.old_location_name || '',
                    "[ใหม่] ที่เลือกตั้ง": log.new_location_name || '',
                    "[เดิม] ที่อยู่": log.old_address || '',
                    "[ใหม่] ที่อยู่": log.new_address || '',
                    "[เดิม] ตำบล (แขวง)": log.old_tambol_name || '',
                    "[ใหม่] ตำบล (แขวง)": log.new_tambol_name || '',
                    "[เดิม] รหัสไปรษณีย์": log.old_postal_code || '',
                    "[ใหม่] รหัสไปรษณีย์": log.new_postal_code || '',
                    "[เดิม] URL แผนที่": log.old_location_url || '',
                    "[ใหม่] URL แผนที่": log.new_location_url || '',
                    "ผู้แก้ไขล่าสุด": log.updated_by || '',
                    "วัน/เวลาที่แก้ไขล่าสุด": dStr
                });
            }
        });

        if (excelData.length === 0) {
            customAlert('ไม่พบข้อมูล', 'ไม่มีประวัติการแก้ไขข้อมูลสถานที่เลือกตั้งตามเงื่อนไขที่คุณเลือก', 'warning');
            btnEx.disabled = false; btnEx.innerHTML = '<i class="fa-solid fa-download"></i> ดาวน์โหลด Excel';
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const wscols = [
            {wch: 15}, {wch: 25}, {wch: 15}, {wch: 12}, 
            {wch: 30}, {wch: 30}, {wch: 25}, {wch: 25}, 
            {wch: 25}, {wch: 25}, {wch: 15}, {wch: 15}, 
            {wch: 12}, {wch: 12}, {wch: 35}, {wch: 35}, 
            {wch: 20}, {wch: 20} 
        ];
        worksheet['!cols'] = wscols;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Updated_Stations");
        
        const dateStr = new Date().toISOString().slice(0,10);
        XLSX.writeFile(workbook, `SSO_Updated_Stations_${dateStr}.xlsx`);

        document.getElementById('exportExcelModal').classList.add('hidden');
        customAlert('ดาวน์โหลดสำเร็จ', `ส่งออกข้อมูลจำนวน ${excelData.length} รายการ เรียบร้อยแล้ว`, 'success');

    } catch (err) {
        console.error(err);
        customAlert('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ Excel ได้: ' + err.message, 'error');
    } finally {
        btnEx.disabled = false; btnEx.innerHTML = '<i class="fa-solid fa-download"></i> ดาวน์โหลด Excel';
    }
}

// ==========================================
// 12. ประวัติ และ Export Script (SQL) 
// ==========================================
async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const tb = document.getElementById('historyTableBody');
    tb.innerHTML = `<tr><td colspan="4" class="text-center py-4">กำลังโหลด...</td></tr>`;

    const p = document.getElementById('filterProvince').value;
    const access = getRoleAccess();
    
    let provNameText = `ทั่วประเทศ`;
    if (access.type === 'BKK_BRANCH') provNameText = `กทม. รหัส ${access.sso}`;
    else if (access.type === 'PROVINCE') provNameText = `รหัสจังหวัด ${access.prov}`;
    else if (p) provNameText = `เฉพาะจังหวัดที่เลือก`;

    const { data, error } = await supabaseClient.from('station_update_logs').select('*').order('updated_at', { ascending: false }).limit(2000);
    if (error || !data) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">โหลดประวัติล้มเหลว</td></tr>`; return; }

    let filteredLogs = data;
    
    const codeToProv = new Map();
    const codeToSSO = new Map();
    filterMapping.forEach(item => {
        codeToProv.set(String(item.polling_station_code), String(item.province_code));
        codeToSSO.set(String(item.polling_station_code), String(item.sso_branch_code));
    });

    if (access.type === 'BKK_BRANCH') {
        filteredLogs = filteredLogs.filter(log => codeToSSO.get(String(log.polling_station_code)) === access.sso);
    } else if (access.type === 'PROVINCE') {
        filteredLogs = filteredLogs.filter(log => codeToProv.get(String(log.polling_station_code)) === access.prov);
    }

    if (p) filteredLogs = filteredLogs.filter(log => codeToProv.get(String(log.polling_station_code)) === p);

    filteredLogs = filteredLogs.slice(0, 50);
    tb.innerHTML = '';

    if (filteredLogs.length === 0) {
        tb.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-500">ไม่พบประวัติการแก้ไข (${provNameText})</td></tr>`;
        return;
    }

    filteredLogs.forEach(log => {
        const dStr = new Date(log.updated_at).toLocaleString('th-TH');
        let oldAddressFull = `${log.old_address || '-'} ต.${log.old_tambol_name || '-'} ${log.old_postal_code || '-'}`;
        if(oldAddressFull === '- ต.- -') oldAddressFull = '-';
        let newAddressFull = `${log.new_address || '-'} ต.${log.new_tambol_name || '-'} ${log.new_postal_code || '-'}`;
        if(newAddressFull === '- ต.- -') newAddressFull = '-';

        tb.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-b text-xs text-slate-500 min-w-[120px]">${dStr}<br><span class="font-semibold text-slate-700 mt-1 inline-block"><i class="fa-solid fa-user-pen mr-1"></i>${log.updated_by || 'Unknown'}</span></td>
                <td class="p-3 border-b font-semibold text-[#1e3a8a] text-center">${log.polling_station_code}</td>
                <td class="p-3 border-b text-xs text-slate-500">
                    <div class="mb-1"><span class="font-semibold">ชื่อ:</span> ${log.old_station_name || '-'}</div>
                    <div class="mb-1"><span class="font-semibold">สถานที่:</span> ${log.old_location_name || '-'}</div>
                    <div><span class="font-semibold">ที่อยู่:</span> ${oldAddressFull}</div>
                </td>
                <td class="p-3 border-b text-xs text-blue-700 bg-blue-50/30">
                    <div class="mb-1"><span class="font-semibold">ชื่อ:</span> ${log.new_station_name || '-'}</div>
                    <div class="mb-1"><span class="font-semibold">สถานที่:</span> ${log.new_location_name || '-'}</div>
                    <div><span class="font-semibold">ที่อยู่:</span> ${newAddressFull}</div>
                </td>
            </tr>
        `;
    });
}

// [Security Fix] อัปเดตฟังก์ชัน Export SQL Script ให้มีระบบจำกัดสิทธิ์ (RBAC) และการดึงข้อมูลทะลุ Limit
function openExportModalFlow() {
    requireAdminAuth(async () => {
        document.getElementById('exportModal').classList.remove('hidden');
        const txt = document.getElementById('sqlOutputArea');
        if(!txt) return;
        txt.value = '-- กำลังดึงข้อมูลและประมวลผล Script...';

        try {
            const access = getRoleAccess();
            let allLogs = [];
            let logFrom = 0; const logStep = 1000; let logHasMore = true;
            
            // Loop ดึงประวัติทั้งหมดเพื่อป้องกันการตัดจบที่ 1000 แถว
            while(logHasMore) {
                const { data: logs, error: errLog } = await supabaseClient.from('station_update_logs')
                    .select('sql_script, updated_at, polling_station_code, updated_by').order('updated_at', { ascending: true }).range(logFrom, logFrom + logStep - 1);
                
                if (errLog) throw errLog;
                if (logs && logs.length > 0) { 
                    allLogs = allLogs.concat(logs); 
                    logFrom += logStep; 
                    if (logs.length < logStep) logHasMore = false; 
                } else {
                    logHasMore = false;
                }
            }

            if (allLogs.length === 0) { txt.value = '-- ไม่มีประวัติการอัปเดตข้อมูลในระบบ'; return; }

            // [Security] คัดกรอง Log ให้ตรงตามสิทธิ์ของผู้ใช้งาน (Data Isolation)
            let filteredLogs = allLogs;
            if (access.type !== 'ADMIN') {
                const codeToProv = new Map();
                const codeToSSO = new Map();
                filterMapping.forEach(item => {
                    codeToProv.set(String(item.polling_station_code), String(item.province_code));
                    codeToSSO.set(String(item.polling_station_code), String(item.sso_branch_code));
                });

                if (access.type === 'BKK_BRANCH') {
                    filteredLogs = allLogs.filter(log => codeToSSO.get(String(log.polling_station_code)) === access.sso);
                } else if (access.type === 'PROVINCE') {
                    filteredLogs = allLogs.filter(log => codeToProv.get(String(log.polling_station_code)) === access.prov);
                }
            }

            if (filteredLogs.length === 0) { txt.value = '-- ไม่มีประวัติการอัปเดตข้อมูลในพื้นที่ของคุณ'; return; }

            // ประมวลผล Deduplication เพื่อหา Script ล่าสุดของแต่ละหน่วย
            const latestScriptsMap = new Map();
            filteredLogs.forEach(log => latestScriptsMap.set(String(log.polling_station_code), log));
            const uniqueUpdates = Array.from(latestScriptsMap.values());

            // สร้างข้อความ SQL
            let sql = `-- ==========================================\n-- SSO Polling Station Update Script (Deduplicated)\n-- Generated at: ${new Date().toLocaleString('th-TH')}\n-- Total Unique Updates: ${uniqueUpdates.length} stations (Filtered from ${filteredLogs.length} logs)\n-- ==========================================\n\n`;
            
            uniqueUpdates.forEach(log => {
                sql += `-- Update for Station: ${log.polling_station_code} (By: ${log.updated_by || 'Unknown'} on ${new Date(log.updated_at).toLocaleString('th-TH')})\n${log.sql_script}\n\n`;
            });
            txt.value = sql;

        } catch (error) {
            txt.value = '-- Error: ดึงข้อมูลล้มเหลว ' + error.message;
        }
    });
}

// ==========================================
// 13. ผูกปุ่ม Event Listener ทั้งหมด
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    
    loadUserProfile(); checkSystemStatus(); loadFilterOptions(); loadTambolMaster(); setupDropdownEvents();

    const btnSaveProfile = document.getElementById('btnSaveProfile'); if(btnSaveProfile) btnSaveProfile.addEventListener('click', saveUserProfile);
    const btnAdminVerify = document.getElementById('btnAdminVerify'); if(btnAdminVerify) btnAdminVerify.addEventListener('click', verifyAdminPassword);
    const adminPwdInput = document.getElementById('adminPasswordInput'); if(adminPwdInput) adminPwdInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyAdminPassword(); });

    const btnSearch = document.getElementById('btnSearch'); if(btnSearch) btnSearch.addEventListener('click', searchData);
    const searchInput = document.getElementById('searchInput'); if(searchInput) searchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') searchData(); });

    const btnClear = document.getElementById('btnClear');
    if(btnClear) {
        btnClear.addEventListener('click', () => {
            applyRoleBasedFilters('filter');
            
            document.getElementById('searchInput').value = '';
            document.getElementById('dataTableBody').innerHTML = `<tr><td colspan="9" class="text-center py-20 text-slate-400">กรุณาเลือกเงื่อนไขและกดค้นหา</td></tr>`;
            document.getElementById('recordCount').innerText = 'พบข้อมูล 0 รายการ';
            document.getElementById('paginationContainerTop').classList.add('hidden');
            document.getElementById('paginationContainerBottom').classList.add('hidden');
            currentSearchData = [];
            currentlyEditingCode = null; 
        });
    }

    const toggleBtn = document.getElementById('btnToggleSystem'); 
    if(toggleBtn) { 
        toggleBtn.classList.remove('hidden'); 
        toggleBtn.addEventListener('click', () => requireAdminAuth(toggleSystemStatus)); 
    }
    
    const btnHistory = document.getElementById('btnHistory'); if(btnHistory) btnHistory.addEventListener('click', openHistoryModal);
    const btnExport = document.getElementById('btnExport'); if(btnExport) btnExport.addEventListener('click', openExportModalFlow);

    const btnOpenExportExcel = document.getElementById('btnOpenExportExcel'); if(btnOpenExportExcel) btnOpenExportExcel.addEventListener('click', openExcelModalFlow);
    const btnExecuteExcel = document.getElementById('btnExecuteExcel'); if(btnExecuteExcel) btnExecuteExcel.addEventListener('click', executeExcelExport);

    const btnDownloadSQL = document.getElementById('btnDownloadSQL');
    if(btnDownloadSQL) {
        btnDownloadSQL.addEventListener('click', () => {
            const content = document.getElementById('sqlOutputArea').value;
            if (content.includes('-- ไม่มี') || content.includes('-- กำลัง')) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([content], { type: 'text/sql' }));
            a.download = `sso_update_script_${new Date().toISOString().slice(0,10)}.sql`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    }
    
    const btnConfirmExecute = document.getElementById('btnConfirmExecute'); if(btnConfirmExecute) btnConfirmExecute.addEventListener('click', executeSaveData);
});
