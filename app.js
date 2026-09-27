// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ Supabase
// ==========================================
const SUPABASE_URL = 'https://fkgpxagdgdubdwtdxtry.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZ3B4YWdkZ2R1YmR3dGR4dHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTE5MDIsImV4cCI6MjEwNTAyNzkwMn0.IosqraENXtMvgrzOdiIK01bRqxe_H8HdBNwtUt7O_e8';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isSystemOpen = false;
let stationsData = []; 
let filterMapping = []; 

// ==========================================
// 2. ฟังก์ชันตรวจสอบสถานะเปิด-ปิดระบบ
// ==========================================
async function checkSystemStatus() {
    try {
        const { data, error } = await supabaseClient
            .from('system_settings_1')
            .select('is_active')
            .eq('setting_name', 'is_form_open')
            .maybeSingle();

        if (error) throw error;
        
        isSystemOpen = data ? data.is_active : false;
        updateSystemUI();
    } catch (err) {
        console.error('Error checking system status:', err);
        const badge = document.getElementById('systemStatusBadge');
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-400"></i> เชื่อมต่อฐานข้อมูลล้มเหลว';
        badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-red-900/80 text-white border border-red-700 shadow-sm flex items-center gap-2';
    }
}

function updateSystemUI() {
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
}

async function toggleSystemStatus() {
    const newStatus = !isSystemOpen;
    const confirmMsg = newStatus ? 'คุณต้องการ "เปิด" ระบบรับข้อมูลใช่หรือไม่?' : 'คุณต้องการ "ปิด" ระบบรับข้อมูลใช่หรือไม่?';
    
    if(confirm(confirmMsg)) {
        const { data: existing } = await supabaseClient.from('system_settings_1').select('setting_name').eq('setting_name', 'is_form_open').maybeSingle();
        
        let error;
        if (existing) {
            const res = await supabaseClient.from('system_settings_1').update({ is_active: newStatus }).eq('setting_name', 'is_form_open');
            error = res.error;
        } else {
            const res = await supabaseClient.from('system_settings_1').insert([{ setting_name: 'is_form_open', is_active: newStatus }]);
            error = res.error;
        }
            
        if(error) alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
        else {
            alert('เปลี่ยนสถานะระบบสำเร็จ');
            checkSystemStatus();
        }
    }
}

// ==========================================
// 3. ฟังก์ชันโหลดตัวกรอง (Group by CODE ด้วย Map)
// ==========================================
async function loadFilterOptions() {
    const provSelect = document.getElementById('filterProvince');
    provSelect.innerHTML = '<option value="">-- กำลังดึงข้อมูล... --</option>';
    provSelect.disabled = true;

    let allData = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    // วนลูปดึงข้อมูลจนครบเพื่อไม่ให้ติด Limit
    while (hasMore) {
        const { data, error } = await supabaseClient
            .from('ms_station_1')
            .select('province_code, province_name, sso_branch_code, sso_name, amphur_code, amphur_name')
            .order('province_code', { ascending: true })
            .order('sso_branch_code', { ascending: true })
            .order('amphur_code', { ascending: true })
            .range(from, from + step - 1);
        
        if (error) {
            console.error('เกิดข้อผิดพลาดในการโหลดตัวกรอง:', error);
            provSelect.innerHTML = '<option value="">-- โหลดข้อมูลล้มเหลว --</option>';
            return;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    if (allData.length > 0) {
        filterMapping = allData; 
        
        // กรอง "จังหวัด" ด้วย province_code
        const provinceMap = new Map();
        filterMapping.forEach(item => {
            if (item.province_code && !provinceMap.has(item.province_code)) {
                provinceMap.set(item.province_code, `${item.province_code} - ${item.province_name}`);
            }
        });
        
        // แปลง Map เป็น Array เพื่อไปสร้าง Dropdown
        const provinces = Array.from(provinceMap, ([value, text]) => ({ value, text }));
        populateDropdown('filterProvince', provinces, '-- แสดงทุกจังหวัด --');
        
        provSelect.disabled = false;
        document.getElementById('filterSSO').disabled = true;
        document.getElementById('filterAmphur').disabled = true;
    }
}

// ฟังก์ชันสร้างตัวเลือก (รองรับข้อมูลแบบ {value, text})
function populateDropdown(elementId, items, defaultText) {
    const select = document.getElementById(elementId);
    select.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(item => {
        select.innerHTML += `<option value="${item.value}">${item.text}</option>`;
    });
}

function setupDropdownEvents() {
    const provSelect = document.getElementById('filterProvince');
    const ssoSelect = document.getElementById('filterSSO');
    const amphSelect = document.getElementById('filterAmphur');

    // เมื่อเปลี่ยน "จังหวัด"
    provSelect.addEventListener('change', (e) => {
        const selectedProvCode = e.target.value; // ค่าที่ได้จะเป็นตัวเลข Code
        
        ssoSelect.innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>';
        ssoSelect.disabled = true;
        amphSelect.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>';
        amphSelect.disabled = true;

        if (!selectedProvCode) return; 

        // กรอง "สปส." ด้วย sso_branch_code (ภายใต้จังหวัดที่เลือก)
        const ssoMap = new Map();
        filterMapping.filter(item => item.province_code == selectedProvCode).forEach(item => {
            if (item.sso_branch_code && !ssoMap.has(item.sso_branch_code)) {
                ssoMap.set(item.sso_branch_code, `${item.sso_branch_code} - ${item.sso_name}`);
            }
        });

        const ssos = Array.from(ssoMap, ([value, text]) => ({ value, text }));
        populateDropdown('filterSSO', ssos, '-- แสดงทุกสำนักงาน --');
        ssoSelect.disabled = false;
    });

    // เมื่อเปลี่ยน "สปส."
    ssoSelect.addEventListener('change', (e) => {
        const selectedProvCode = provSelect.value;
        const selectedSSOCode = e.target.value; // ค่าที่ได้จะเป็นตัวเลข Code

        amphSelect.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>';
        amphSelect.disabled = true;

        if (!selectedSSOCode) return;

        // กรอง "อำเภอ" ด้วย amphur_code (ภายใต้ สปส. ที่เลือก)
        const amphurMap = new Map();
        filterMapping.filter(item => item.province_code == selectedProvCode && item.sso_branch_code == selectedSSOCode).forEach(item => {
            if (item.amphur_code && !amphurMap.has(item.amphur_code)) {
                amphurMap.set(item.amphur_code, `${item.amphur_code} - ${item.amphur_name}`);
            }
        });

        const amphurs = Array.from(amphurMap, ([value, text]) => ({ value, text }));
        populateDropdown('filterAmphur', amphurs, '-- แสดงทุกอำเภอ --');
        amphSelect.disabled = false;
    });
}

// ==========================================
// 4. ฟังก์ชันค้นหาและแสดงผลตาราง
// ==========================================
async function searchData() {
    const tableBody = document.getElementById('dataTableBody');
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i><br>กำลังค้นหาข้อมูล...</td></tr>`;
    
    const provCode = document.getElementById('filterProvince').value;
    const ssoCode = document.getElementById('filterSSO').value;
    const amphCode = document.getElementById('filterAmphur').value;
    const searchTxt = document.getElementById('searchInput').value.trim();

    let query = supabaseClient.from('ms_station_1').select('*');
    
    // ค้นหาด้วยฟิลด์ Code ทั้งหมด (ลอจิกใหม่ที่มีประสิทธิภาพกว่าชื่อ text)
    if (provCode) query = query.eq('province_code', provCode);
    if (ssoCode) query = query.eq('sso_branch_code', ssoCode);
    if (amphCode) query = query.eq('amphur_code', amphCode);
    
    if (searchTxt) {
        if (!isNaN(searchTxt) && searchTxt !== '') {
            query = query.or(`polling_station_code.eq.${searchTxt},polling_station_name.ilike.%${searchTxt}%`);
        } else {
            query = query.ilike('polling_station_name', `%${searchTxt}%`);
        }
    }

    // เรียงตาม polling_station_code ตามที่ต้องการ
    const { data, error } = await query
        .order('polling_station_code', { ascending: true })
        .limit(300);

    if (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}</td></tr>`;
        return;
    }

    stationsData = data;
    document.getElementById('recordCount').innerText = `พบข้อมูล ${data.length} รายการ`;
    renderTable(data);
}

function renderTable(data) {
    const tableBody = document.getElementById('dataTableBody');
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-slate-400">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;
        return;
    }

    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
        tr.innerHTML = `
            <td class="px-4 py-3 text-slate-600 text-xs whitespace-normal min-w-[200px]">
                ${row.province_code || ''} - ${row.province_name || '-'} > ${row.amphur_name || '-'}<br>
                <span class="font-semibold text-slate-800">${row.sso_name || '-'}</span>
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

            <td class="px-4 py-3 text-center w-24">
                <button id="btn_edit_${row.polling_station_code}" onclick="enableEdit('${row.polling_station_code}')" class="btn-edit bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded shadow-sm text-xs font-bold w-full transition" ${!isSystemOpen ? 'disabled' : ''}>
                    <i class="fa-solid fa-pen mr-1"></i> แก้ไข
                </button>
                <button id="btn_save_${row.polling_station_code}" onclick="saveRowData('${row.polling_station_code}', ${index})" class="hidden btn-save bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded shadow-sm text-xs font-bold w-full transition">
                    <i class="fa-solid fa-save mr-1"></i> บันทึก
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// ฟังก์ชันปลดล็อกช่องพิมพ์
function enableEdit(code) {
    if (!isSystemOpen) {
        alert('ระบบปิดรับข้อมูลแล้ว ไม่สามารถแก้ไขได้');
        return;
    }
    
    const nameInput = document.getElementById(`name_${code}`);
    const locInput = document.getElementById(`loc_${code}`);
    const urlInput = document.getElementById(`url_${code}`);

    nameInput.disabled = false;
    locInput.disabled = false;
    urlInput.disabled = false;

    nameInput.classList.add('bg-yellow-50', 'border-yellow-300');
    locInput.classList.add('bg-yellow-50', 'border-yellow-300');
    urlInput.classList.add('bg-yellow-50', 'border-yellow-300');

    document.getElementById(`btn_edit_${code}`).classList.add('hidden');
    document.getElementById(`btn_save_${code}`).classList.remove('hidden');

    nameInput.focus();
}

function escapeSQL(val) {
    if (!val) return '';
    return val.replace(/'/g, "''");
}

async function saveRowData(code, index) {
    if (!isSystemOpen) {
        alert('ระบบปิดรับข้อมูลแล้ว ไม่สามารถบันทึกได้');
        return;
    }

    const oldData = stationsData[index];
    const nameInput = document.getElementById(`name_${code}`);
    const locInput = document.getElementById(`loc_${code}`);
    const urlInput = document.getElementById(`url_${code}`);
    
    const newName = nameInput.value.trim();
    const newLoc = locInput.value.trim();
    const newUrl = urlInput.value.trim();

    if (oldData.polling_station_name === newName && oldData.location_name === newLoc && oldData.location_url === newUrl) {
        alert('ไม่มีการเปลี่ยนแปลงข้อมูล');
        return;
    }

    if (confirm(`ยืนยันการบันทึกข้อมูลรหัสหน่วย: ${code} ใช่หรือไม่?`)) {
        
        const saveBtn = document.getElementById(`btn_save_${code}`);
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>...';
        
        const sqlScript = `UPDATE ms_station_1 SET polling_station_name = '${escapeSQL(newName)}', location_name = '${escapeSQL(newLoc)}', location_url = '${escapeSQL(newUrl)}' WHERE polling_station_code = '${code}';`;

        const { error: updateError } = await supabaseClient
            .from('ms_station_1')
            .update({ 
                polling_station_name: newName, 
                location_name: newLoc, 
                location_url: newUrl 
            })
            .eq('polling_station_code', code);

        if (updateError) {
            alert('เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ' + updateError.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> บันทึก';
            return;
        }

        const { error: logError } = await supabaseClient
            .from('station_update_logs')
            .insert([{
                polling_station_code: code.toString(),
                old_station_name: oldData.polling_station_name,
                new_station_name: newName,
                old_location_name: oldData.location_name,
                new_location_name: newLoc,
                old_location_url: oldData.location_url,
                new_location_url: newUrl,
                sql_script: sqlScript,
                updated_by: 'Staff User' 
            }]);

        if (logError) console.error('บันทึก Log ไม่สำเร็จ', logError);

        alert('บันทึกข้อมูลเรียบร้อยแล้ว');
        
        stationsData[index].polling_station_name = newName;
        stationsData[index].location_name = newLoc;
        stationsData[index].location_url = newUrl;
        
        // ล็อกกลับให้เป็นสถานะปกติ
        nameInput.disabled = true;
        locInput.disabled = true;
        urlInput.disabled = true;
        nameInput.classList.remove('bg-yellow-50', 'border-yellow-300');
        locInput.classList.remove('bg-yellow-50', 'border-yellow-300');
        urlInput.classList.remove('bg-yellow-50', 'border-yellow-300');

        saveBtn.classList.add('hidden');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> บันทึก';
        
        const editBtn = document.getElementById(`btn_edit_${code}`);
        editBtn.classList.remove('hidden');
    }
}

async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4">กำลังโหลด...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('station_update_logs')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error || !data) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">โหลดประวัติล้มเหลว</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    data.forEach(log => {
        const dateStr = new Date(log.updated_at).toLocaleString('th-TH');
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 border-b text-xs text-slate-500">${dateStr}<br>โดย: ${log.updated_by}</td>
                <td class="p-3 border-b font-semibold text-[#1e3a8a]">${log.polling_station_code}</td>
                <td class="p-3 border-b text-xs text-slate-500">
                    ชื่อ: ${log.old_station_name || '-'}<br>
                    สถานที่: ${log.old_location_name || '-'}
                </td>
                <td class="p-3 border-b text-xs text-blue-700 bg-blue-50/30">
                    ชื่อ: ${log.new_station_name || '-'}<br>
                    สถานที่: ${log.new_location_name || '-'}
                </td>
            </tr>
        `;
    });
}

async function openExportModal() {
    document.getElementById('exportModal').classList.remove('hidden');
    const textArea = document.getElementById('sqlOutputArea');
    textArea.value = '-- กำลังดึงข้อมูล SQL Script...';

    const { data, error } = await supabaseClient
        .from('station_update_logs')
        .select('sql_script, updated_at, polling_station_code')
        .order('updated_at', { ascending: true });

    if (error || !data) {
        textArea.value = '-- เกิดข้อผิดพลาดในการดึง Script';
        return;
    }

    if (data.length === 0) {
        textArea.value = '-- ไม่มีประวัติการอัปเดตข้อมูลในระบบ';
        return;
    }

    let fullScript = `-- ==========================================\n`;
    fullScript += `-- SSO Polling Station Update Script\n`;
    fullScript += `-- Generated at: ${new Date().toLocaleString('th-TH')}\n`;
    fullScript += `-- Total Updates: ${data.length} records\n`;
    fullScript += `-- ==========================================\n\n`;

    data.forEach(log => {
        fullScript += `-- Update for Station: ${log.polling_station_code} (${new Date(log.updated_at).toLocaleString('th-TH')})\n`;
        fullScript += `${log.sql_script}\n\n`;
    });

    textArea.value = fullScript;
}

function downloadSQLFile() {
    const sqlContent = document.getElementById('sqlOutputArea').value;
    if (sqlContent.includes('-- ไม่มีประวัติ') || sqlContent.includes('-- กำลังดึงข้อมูล')) return;

    const blob = new Blob([sqlContent], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `sso_update_script_${dateStr}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================
// 7. การผูก Event
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    checkSystemStatus();
    loadFilterOptions();
    setupDropdownEvents();

    document.getElementById('btnSearch').addEventListener('click', searchData);
    
    document.getElementById('btnClear').addEventListener('click', () => {
        const provSelect = document.getElementById('filterProvince');
        const ssoSelect = document.getElementById('filterSSO');
        const amphSelect = document.getElementById('filterAmphur');

        provSelect.value = '';
        ssoSelect.innerHTML = '<option value="">-- แสดงทุกสำนักงาน --</option>';
        ssoSelect.disabled = true;
        amphSelect.innerHTML = '<option value="">-- แสดงทุกอำเภอ --</option>';
        amphSelect.disabled = true;

        document.getElementById('searchInput').value = '';
        document.getElementById('dataTableBody').innerHTML = `<tr><td colspan="6" class="text-center py-16 text-slate-400">กรุณาเลือกเงื่อนไขและกดค้นหา</td></tr>`;
        document.getElementById('recordCount').innerText = 'พบข้อมูล 0 รายการ';
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') searchData();
    });

    const toggleBtn = document.getElementById('btnToggleSystem');
    if(toggleBtn) {
        toggleBtn.classList.remove('hidden'); 
        toggleBtn.addEventListener('click', toggleSystemStatus);
    }
    
    document.getElementById('btnHistory').addEventListener('click', openHistoryModal);
    document.getElementById('btnExport').addEventListener('click', openExportModal);
    document.getElementById('btnDownloadSQL').addEventListener('click', downloadSQLFile);
});
