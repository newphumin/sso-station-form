// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ Supabase
// ==========================================
const SUPABASE_URL = 'https://fkgpxagdgdubdwtdxtry.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZ3B4YWdkZ2R1YmR3dGR4dHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTE5MDIsImV4cCI6MjEwNTAyNzkwMn0.IosqraENXtMvgrzOdiIK01bRqxe_H8HdBNwtUt7O_e8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isSystemOpen = false;
let stationsData = []; 
let filterMapping = []; 

// ระบบ Profile และ State Management
let currentUserProfile = { name: '', sso: '' };
let pendingSaveData = null; 
let currentlyEditingCode = null; // ตัวแปรล็อกสถานะการแก้ไข (ให้ทำได้ทีละ 1 แถว)

// ==========================================
// 2. ระบบ User Profile (Local Storage)
// ==========================================
function loadUserProfile() {
    const savedName = localStorage.getItem('sso_user_name');
    const savedSSO = localStorage.getItem('sso_user_sso');
    
    if (savedName && savedSSO) {
        currentUserProfile = { name: savedName, sso: savedSSO };
        updateProfileDisplay();
    } else {
        document.getElementById('profileModal').classList.remove('hidden');
    }
}

function updateProfileDisplay() {
    const display = document.getElementById('userProfileDisplay');
    display.innerHTML = `
        <i class="fa-solid fa-user-circle mr-1"></i> ผู้ทำรายการ: <b>${currentUserProfile.name}</b> [${currentUserProfile.sso}] 
        <button onclick="document.getElementById('profileModal').classList.remove('hidden')" class="ml-2 text-blue-200 hover:text-white px-1 rounded hover:bg-blue-800 transition" title="แก้ไขโปรไฟล์">
            <i class="fa-solid fa-pen text-xs"></i>
        </button>
    `;
    document.getElementById('profNameInput').value = currentUserProfile.name;
    document.getElementById('profSSOInput').value = currentUserProfile.sso;
}

document.getElementById('btnSaveProfile').addEventListener('click', () => {
    const pName = document.getElementById('profNameInput').value.trim();
    const pSSO = document.getElementById('profSSOInput').value;

    if (!pName || !pSSO) {
        alert('กรุณากรอกชื่อและเลือกสังกัดหน่วยงานให้ครบถ้วน');
        return;
    }

    localStorage.setItem('sso_user_name', pName);
    localStorage.setItem('sso_user_sso', pSSO);
    currentUserProfile = { name: pName, sso: pSSO };
    
    updateProfileDisplay();
    document.getElementById('profileModal').classList.add('hidden');
});

// ==========================================
// 3. ฟังก์ชันระบบ (เปิดปิดฟอร์ม และ ตัวกรอง)
// ==========================================
async function checkSystemStatus() {
    try {
        const { data, error } = await supabaseClient.from('system_settings_1').select('is_active').eq('setting_name', 'is_form_open').maybeSingle();
        if (error) throw error;
        
        isSystemOpen = data ? data.is_active : false;
        
        const badge = document.getElementById('systemStatusBadge');
        if (isSystemOpen) {
            badge.innerHTML = '<i class="fa-solid fa-check-circle text-green-400"></i> ระบบเปิดรับข้อมูล';
            badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-green-900/80 text-white border border-green-700 shadow-sm flex items-center gap-2';
        } else {
            badge.innerHTML = '<i class="fa-solid fa-lock text-red-400"></i> ระบบปิดรับข้อมูล (หมดเวลา)';
            badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-red-900/80 text-white border border-red-700 shadow-sm flex items-center gap-2';
        }
        
        const editBtns = document.querySelectorAll('.btn-edit');
        editBtns.forEach(btn => btn.disabled = !isSystemOpen);
    } catch (err) {
        console.error('Error status:', err);
    }
}

async function toggleSystemStatus() {
    const newStatus = !isSystemOpen;
    if(confirm(newStatus ? 'เปิดระบบรับข้อมูล?' : 'ปิดระบบรับข้อมูล?')) {
        const { data: existing } = await supabaseClient.from('system_settings_1').select('setting_name').eq('setting_name', 'is_form_open').maybeSingle();
        let error;
        if (existing) error = (await supabaseClient.from('system_settings_1').update({ is_active: newStatus }).eq('setting_name', 'is_form_open')).error;
        else error = (await supabaseClient.from('system_settings_1').insert([{ setting_name: 'is_form_open', is_active: newStatus }])).error;
            
        if(error) alert('Error'); else { alert('สำเร็จ'); checkSystemStatus(); }
    }
}

async function loadFilterOptions() {
    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabaseClient
            .from('ms_station_1')
            .select('province_code, province_name, sso_branch_code, sso_name, amphur_code, amphur_name')
            .order('province_code').order('sso_branch_code').order('amphur_code')
            .range(from, from + step - 1);
        
        if (error) return;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += step;
            if (data.length < step) hasMore = false;
        } else hasMore = false;
    }

    if (allData.length > 0) {
        filterMapping = allData; 
        
        const provMap = new Map();
        filterMapping.forEach(i => {
            if (i.province_code && !provMap.has(i.province_code)) provMap.set(i.province_code, `${i.province_code} - ${i.province_name}`);
        });
        populateDropdown('filterProvince', Array.from(provMap, ([value, text]) => ({value, text})), '-- แสดงทุกจังหวัด --');
        document.getElementById('filterProvince').disabled = false;

        const ssoGlobalMap = new Map();
        filterMapping.forEach(i => {
            if (i.sso_branch_code && !ssoGlobalMap.has(i.sso_branch_code)) ssoGlobalMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
        });
        const profileSSOs = [{value: '1000 - ส่วนกลาง', text: '1000 - ส่วนกลาง'}];
        Array.from(ssoGlobalMap).forEach(([v, t]) => profileSSOs.push({value: t, text: t}));
        populateDropdown('profSSOInput', profileSSOs, '-- เลือกหน่วยงานต้นสังกัด --');
        
        if(currentUserProfile.sso) document.getElementById('profSSOInput').value = currentUserProfile.sso;
    }
}

function populateDropdown(elementId, items, defaultText) {
    const sel = document.getElementById(elementId);
    sel.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(i => sel.innerHTML += `<option value="${i.value}">${i.text}</option>`);
}

function setupDropdownEvents() {
    const pSel = document.getElementById('filterProvince');
    const sSel = document.getElementById('filterSSO');
    const aSel = document.getElementById('filterAmphur');

    pSel.addEventListener('change', (e) => {
        const val = e.target.value;
        sSel.innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>'; sSel.disabled = true;
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>'; aSel.disabled = true;
        if (!val) return; 

        const sMap = new Map();
        filterMapping.filter(i => i.province_code == val).forEach(i => {
            if (i.sso_branch_code && !sMap.has(i.sso_branch_code)) sMap.set(i.sso_branch_code, `${i.sso_branch_code} - ${i.sso_name}`);
        });
        populateDropdown('filterSSO', Array.from(sMap, ([value, text]) => ({value, text})), '-- แสดงทุกสำนักงาน --');
        sSel.disabled = false;
    });

    sSel.addEventListener('change', (e) => {
        const pVal = pSel.value;
        const val = e.target.value;
        aSel.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>'; aSel.disabled = true;
        if (!val) return;

        const aMap = new Map();
        filterMapping.filter(i => i.province_code == pVal && i.sso_branch_code == val).forEach(i => {
            if (i.amphur_code && !aMap.has(i.amphur_code)) aMap.set(i.amphur_code, `${i.amphur_code} - ${i.amphur_name}`);
        });
        populateDropdown('filterAmphur', Array.from(aMap, ([value, text]) => ({value, text})), '-- แสดงทุกอำเภอ --');
        aSel.disabled = false;
    });
}

// ==========================================
// 4. ฟังก์ชันค้นหา / ตารางข้อมูล
// ==========================================
async function searchData() {
    // ล้างสถานะการแก้ไข เมื่อทำการค้นหาใหม่
    currentlyEditingCode = null; 

    const tb = document.getElementById('dataTableBody');
    tb.innerHTML = `<tr><td colspan="6" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i><br>กำลังค้นหาข้อมูล...</td></tr>`;
    
    const p = document.getElementById('filterProvince').value;
    const s = document.getElementById('filterSSO').value;
    const a = document.getElementById('filterAmphur').value;
    const txt = document.getElementById('searchInput').value.trim();

    let query = supabaseClient.from('ms_station_1').select('*');
    if (p) query = query.eq('province_code', p);
    if (s) query = query.eq('sso_branch_code', s);
    if (a) query = query.eq('amphur_code', a);
    
    if (txt) {
        if (!isNaN(txt) && txt !== '') query = query.or(`polling_station_code.eq.${txt},polling_station_name.ilike.%${txt}%`);
        else query = query.ilike('polling_station_name', `%${txt}%`);
    }

    const { data, error } = await query.order('polling_station_code', { ascending: true }).limit(300);

    if (error) { tb.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">Error: ${error.message}</td></tr>`; return; }

    stationsData = data;
    document.getElementById('recordCount').innerText = `พบข้อมูล ${data.length} รายการ`;
    renderTable(data);
}

function renderTable(data) {
    const tb = document.getElementById('dataTableBody');
    tb.innerHTML = '';
    if (data.length === 0) { tb.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-slate-400">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`; return; }

    data.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        tr.innerHTML = `
            <td class="px-4 py-3 text-slate-600 text-xs whitespace-normal min-w-[200px]">
                ${row.province_code || ''} - ${row.province_name || '-'} > ${row.amphur_name || '-'}<br>
                <span class="font-semibold text-slate-800">${row.sso_branch_code || ''} - ${row.sso_name || '-'}</span>
            </td>
            <td class="px-4 py-3 font-semibold text-[#1e3a8a]">${row.polling_station_code}</td>
            <td class="px-2 py-2">
                <input type="text" id="name_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-slate-800 font-medium" value="${row.polling_station_name || ''}" disabled>
            </td>
            <td class="px-2 py-2">
                <input type="text" id="loc_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-slate-800" value="${row.location_name || ''}" disabled>
            </td>
            <td class="px-2 py-2">
                <input type="text" id="url_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-blue-600" value="${row.location_url || ''}" disabled>
            </td>
            <td class="px-3 py-3 text-center min-w-[130px]">
                <!-- ปุ่มแก้ไขปกติ -->
                <button id="btn_edit_${row.polling_station_code}" onclick="enableEdit('${row.polling_station_code}')" class="btn-edit bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded shadow-sm text-xs font-bold w-full transition" ${!isSystemOpen ? 'disabled' : ''}>
                    <i class="fa-solid fa-pen mr-1"></i> แก้ไข
                </button>
                
                <!-- กลุ่มปุ่ม บันทึก & ยกเลิก (ซ่อนไว้ตอนแรก) -->
                <div id="action_group_${row.polling_station_code}" class="hidden gap-1 justify-between">
                    <button id="btn_save_${row.polling_station_code}" onclick="prepareSaveData('${row.polling_station_code}', ${idx})" class="btn-save bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded shadow-sm text-xs font-bold flex-1 transition" title="บันทึก">
                        <i class="fa-solid fa-save"></i>
                    </button>
                    <button id="btn_cancel_${row.polling_station_code}" onclick="cancelEdit('${row.polling_station_code}', ${idx})" class="btn-cancel bg-slate-500 hover:bg-slate-600 text-white px-2 py-1.5 rounded shadow-sm text-xs font-bold flex-1 transition" title="ยกเลิกการแก้ไข">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </td>
        `;
        tb.appendChild(tr);
    });
}

// ----------------------------------------------------
// ระบบล็อคการแก้ไข (State Locking)
// ----------------------------------------------------
function enableEdit(code) {
    if (!isSystemOpen) { alert('ระบบปิดรับข้อมูลแล้ว ไม่สามารถแก้ไขได้'); return; }
    
    // ตรวจสอบว่ามีการแก้ไขค้างไว้อยู่หรือไม่
    if (currentlyEditingCode !== null && currentlyEditingCode !== code) {
        alert(`กรุณา "บันทึก" หรือ "ยกเลิก" ข้อมูลที่กำลังแก้ไขอยู่ให้เสร็จสิ้นก่อน (รหัส: ${currentlyEditingCode})`);
        return;
    }
    
    currentlyEditingCode = code; // ล็อกเป้าหมาย
    
    const ids = [`name_${code}`, `loc_${code}`, `url_${code}`];
    ids.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = false;
        el.classList.add('bg-yellow-50', 'border-yellow-300');
    });
    
    document.getElementById(`btn_edit_${code}`).classList.add('hidden');
    
    const actionGroup = document.getElementById(`action_group_${code}`);
    actionGroup.classList.remove('hidden');
    actionGroup.classList.add('flex');
    
    document.getElementById(ids[0]).focus();
}

function cancelEdit(code, index) {
    const oldData = stationsData[index];
    
    // คืนค่าเดิมจากตัวแปร Local
    document.getElementById(`name_${code}`).value = oldData.polling_station_name || '';
    document.getElementById(`loc_${code}`).value = oldData.location_name || '';
    document.getElementById(`url_${code}`).value = oldData.location_url || '';

    // ล็อกช่อง Input กลับคืน
    const ids = [`name_${code}`, `loc_${code}`, `url_${code}`];
    ids.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = true;
        el.classList.remove('bg-yellow-50', 'border-yellow-300');
    });

    // สลับปุ่มกลับเป็น "แก้ไข"
    const actionGroup = document.getElementById(`action_group_${code}`);
    actionGroup.classList.remove('flex');
    actionGroup.classList.add('hidden');
    document.getElementById(`btn_edit_${code}`).classList.remove('hidden');

    currentlyEditingCode = null; // ปลดล็อกเป้าหมาย ให้ไปแก้บรรทัดอื่นต่อได้
}


// ==========================================
// 5. ระบบตรวจสอบและบันทึกข้อมูล (Confirmation Modal)
// ==========================================
function prepareSaveData(code, index) {
    if (!isSystemOpen) return;
    const oldData = stationsData[index];
    const newName = document.getElementById(`name_${code}`).value.trim();
    const newLoc = document.getElementById(`loc_${code}`).value.trim();
    const newUrl = document.getElementById(`url_${code}`).value.trim();

    if (oldData.polling_station_name === newName && oldData.location_name === newLoc && oldData.location_url === newUrl) {
        alert('ไม่มีการเปลี่ยนแปลงข้อมูล');
        return;
    }

    pendingSaveData = { code, index, oldData, newName, newLoc, newUrl };

    document.getElementById('confirmCodeBadge').innerText = `รหัส: ${code}`;
    setConfirmRow('Name', oldData.polling_station_name, newName);
    setConfirmRow('Loc', oldData.location_name, newLoc);
    setConfirmRow('Url', oldData.location_url, newUrl);

    const signatureText = `${currentUserProfile.name} [${currentUserProfile.sso}]`;
    document.getElementById('confSignature').innerHTML = `<i class="fa-solid fa-user-pen mr-1 text-[#1e3a8a]"></i> บันทึกรายการโดย: <span class="font-semibold text-[#1e3a8a]">${signatureText}</span>`;

    document.getElementById('confirmSaveModal').classList.remove('hidden');
}

function setConfirmRow(field, oldVal, newVal) {
    const oldEl = document.getElementById(`confOld${field}`);
    const newEl = document.getElementById(`confNew${field}`);
    oldEl.innerText = oldVal || '-';
    newEl.innerText = newVal || '-';
    
    if (oldVal !== newVal) {
        oldEl.classList.add('line-through', 'text-slate-400');
        newEl.classList.add('highlight-change');
    } else {
        oldEl.classList.remove('line-through', 'text-slate-400');
        newEl.classList.remove('highlight-change');
    }
}

function closeConfirmModal() {
    document.getElementById('confirmSaveModal').classList.add('hidden');
    pendingSaveData = null;
    // หากกดยกเลิกจาก Modal ข้อมูลหน้าตารางจะยังคงอยู่ในสถานะพิมพ์ค้างไว้ให้แก้ไขต่อได้ (ไม่คืนค่า)
}

document.getElementById('btnConfirmExecute').addEventListener('click', async () => {
    if (!pendingSaveData) return;
    const { code, index, oldData, newName, newLoc, newUrl } = pendingSaveData;
    const btnEx = document.getElementById('btnConfirmExecute');
    
    btnEx.disabled = true;
    btnEx.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';

    const sqlScript = `UPDATE ms_station_1 SET polling_station_name = '${escapeSQL(newName)}', location_name = '${escapeSQL(newLoc)}', location_url = '${escapeSQL(newUrl)}' WHERE polling_station_code = '${code}';`;
    const signature = `${currentUserProfile.name} [${currentUserProfile.sso}]`;

    const { error: updateError } = await supabaseClient.from('ms_station_1')
        .update({ polling_station_name: newName, location_name: newLoc, location_url: newUrl })
        .eq('polling_station_code', code);

    if (updateError) {
        alert('Error: ' + updateError.message);
        btnEx.disabled = false;
        btnEx.innerHTML = '<i class="fa-solid fa-save"></i> ยืนยันการบันทึก';
        return;
    }

    await supabaseClient.from('station_update_logs').insert([{
        polling_station_code: code.toString(),
        old_station_name: oldData.polling_station_name,
        new_station_name: newName,
        old_location_name: oldData.location_name,
        new_location_name: newLoc,
        old_location_url: oldData.location_url,
        new_location_url: newUrl,
        sql_script: sqlScript,
        updated_by: signature 
    }]);

    // สำเร็จ! อัปเดตข้อมูล Local ให้ตรงกับฐานข้อมูล
    stationsData[index].polling_station_name = newName;
    stationsData[index].location_name = newLoc;
    stationsData[index].location_url = newUrl;
    
    const ids = [`name_${code}`, `loc_${code}`, `url_${code}`];
    ids.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = true;
        el.classList.remove('bg-yellow-50', 'border-yellow-300');
    });

    // ปรับ UI ปุ่มกลับเป็นสถานะปกติ
    const actionGroup = document.getElementById(`action_group_${code}`);
    actionGroup.classList.remove('flex');
    actionGroup.classList.add('hidden');
    document.getElementById(`btn_edit_${code}`).classList.remove('hidden');

    currentlyEditingCode = null; // ปลดล็อกเป้าหมาย ให้แก้บรรทัดอื่นต่อได้
    
    btnEx.disabled = false;
    btnEx.innerHTML = '<i class="fa-solid fa-save"></i> ยืนยันการบันทึก';
    closeConfirmModal();
});

function escapeSQL(val) { return !val ? '' : val.replace(/'/g, "''"); }


// ==========================================
// 6. ประวัติ (History) และ Export (Script Deduplication)
// ==========================================
async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const tb = document.getElementById('historyTableBody');
    tb.innerHTML = `<tr><td colspan="4" class="text-center py-4">กำลังโหลด...</td></tr>`;

    const { data, error } = await supabaseClient.from('station_update_logs').select('*').order('updated_at', { ascending: false }).limit(50);
    if (error || !data) { tb.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">โหลดประวัติล้มเหลว</td></tr>`; return; }

    tb.innerHTML = '';
    data.forEach(log => {
        const dStr = new Date(log.updated_at).toLocaleString('th-TH');
        tb.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-b text-xs text-slate-500">${dStr}<br><span class="font-semibold text-slate-700"><i class="fa-solid fa-user-pen mr-1"></i>${log.updated_by || 'Unknown'}</span></td>
                <td class="p-3 border-b font-semibold text-[#1e3a8a]">${log.polling_station_code}</td>
                <td class="p-3 border-b text-xs text-slate-500">ชื่อ: ${log.old_station_name || '-'}<br>สถานที่: ${log.old_location_name || '-'}</td>
                <td class="p-3 border-b text-xs text-blue-700 bg-blue-50/30">ชื่อ: ${log.new_station_name || '-'}<br>สถานที่: ${log.new_location_name || '-'}</td>
            </tr>
        `;
    });
}

// ระบบดึง Export Script (ใช้ Map กรองเอาเฉพาะข้อมูลล่าสุดของรหัสนั้นๆ ป้องกัน Script ซ้ำซ้อน)
async function openExportModal() {
    document.getElementById('exportModal').classList.remove('hidden');
    const txt = document.getElementById('sqlOutputArea');
    txt.value = '-- กำลังดึงข้อมูล...';

    // ดึงเรียงตามเวลา เก่า -> ใหม่
    const { data, error } = await supabaseClient
        .from('station_update_logs')
        .select('sql_script, updated_at, polling_station_code, updated_by')
        .order('updated_at', { ascending: true });
        
    if (error || !data) { txt.value = '-- Error: ดึงข้อมูลล้มเหลว'; return; }
    if (data.length === 0) { txt.value = '-- ไม่มีประวัติการอัปเดตข้อมูลในระบบ'; return; }

    // ตะแกรงกรอง (Script Deduplication): 
    // พอเจอข้อมูลใหม่กว่าของรหัสเดิม Map จะถูกบันทึกทับ (Overwrite) ทำให้เหลือแต่คำสั่งล่าสุดจริงๆ
    const latestScriptsMap = new Map();
    data.forEach(log => {
        latestScriptsMap.set(log.polling_station_code, log);
    });

    const uniqueUpdates = Array.from(latestScriptsMap.values());

    let sql = `-- ==========================================\n`;
    sql += `-- SSO Polling Station Update Script (Deduplicated)\n`;
    sql += `-- Generated at: ${new Date().toLocaleString('th-TH')}\n`;
    sql += `-- Total Unique Updates: ${uniqueUpdates.length} stations (Filtered from ${data.length} logs)\n`;
    sql += `-- ==========================================\n\n`;

    uniqueUpdates.forEach(log => {
        sql += `-- Update for Station: ${log.polling_station_code} (By: ${log.updated_by || 'Unknown'} on ${new Date(log.updated_at).toLocaleString('th-TH')})\n`;
        sql += `${log.sql_script}\n\n`;
    });

    txt.value = sql;
}

document.getElementById('btnDownloadSQL').addEventListener('click', () => {
    const content = document.getElementById('sqlOutputArea').value;
    if (content.includes('-- ไม่มี') || content.includes('-- กำลัง')) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/sql' }));
    a.download = `sso_update_script_${new Date().toISOString().slice(0,10)}.sql`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
});

// ==========================================
// 7. Initial Events
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    checkSystemStatus();
    loadFilterOptions();
    setupDropdownEvents();

    document.getElementById('btnSearch').addEventListener('click', searchData);
    document.getElementById('searchInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') searchData(); });

    document.getElementById('btnClear').addEventListener('click', () => {
        document.getElementById('filterProvince').value = '';
        document.getElementById('filterSSO').innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>'; document.getElementById('filterSSO').disabled = true;
        document.getElementById('filterAmphur').innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>'; document.getElementById('filterAmphur').disabled = true;
        document.getElementById('searchInput').value = '';
        document.getElementById('dataTableBody').innerHTML = `<tr><td colspan="6" class="text-center py-16 text-slate-400">กรุณาเลือกเงื่อนไขและกดค้นหา</td></tr>`;
        document.getElementById('recordCount').innerText = 'พบข้อมูล 0 รายการ';
        
        currentlyEditingCode = null; // ปลดล็อกการแก้ไข
    });

    const toggleBtn = document.getElementById('btnToggleSystem');
    if(toggleBtn) { toggleBtn.classList.remove('hidden'); toggleBtn.addEventListener('click', toggleSystemStatus); }
    
    document.getElementById('btnHistory').addEventListener('click', openHistoryModal);
    document.getElementById('btnExport').addEventListener('click', openExportModal);
});
