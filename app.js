// ==========================================
// 1. ตั้งค่าการเชื่อมต่อ Supabase
// ==========================================
// นำ URL และ KEY จากเมนู Project Settings -> API มาใส่ที่นี่
const SUPABASE_URL = 'https://fkgpxagdgdubdwtdxtry.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrZ3B4YWdkZ2R1YmR3dGR4dHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NTE5MDIsImV4cCI6MjEwNTAyNzkwMn0.IosqraENXtMvgrzOdiIK01bRqxe_H8HdBNwtUt7O_e8';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ตัวแปรสถานะระบบ
let isSystemOpen = false;
let stationsData = []; // เก็บข้อมูลที่ค้นหามาแสดงผล

// ==========================================
// 2. ฟังก์ชันตรวจสอบสถานะเปิด-ปิดระบบ
// ==========================================
async function checkSystemStatus() {
    try {
        const { data, error } = await supabase
            .from('system_settings_1')
            .select('is_active')
            .eq('setting_name', 'is_form_open')
            .single();

        if (error) throw error;
        
        isSystemOpen = data.is_active;
        updateSystemUI();
    } catch (err) {
        console.error('Error checking system status:', err);
        // เพิ่มการเปลี่ยนป้ายสถานะเป็นสีแดงเมื่อเชื่อมต่อฐานข้อมูลล้มเหลว
        const badge = document.getElementById('systemStatusBadge');
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-red-400"></i> เชื่อมต่อฐานข้อมูลล้มเหลว (เช็ค RLS)';
        badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-red-900/80 text-white border border-red-700 shadow-sm flex items-center gap-2';
    }
}

function updateSystemUI() {
    const badge = document.getElementById('systemStatusBadge');
    // อัปเดตป้ายสถานะ
    if (isSystemOpen) {
        badge.innerHTML = '<i class="fa-solid fa-check-circle text-green-400"></i> ระบบเปิดรับข้อมูล';
        badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-green-900/80 text-white border border-green-700 shadow-sm flex items-center gap-2';
    } else {
        badge.innerHTML = '<i class="fa-solid fa-lock text-red-400"></i> ระบบปิดรับข้อมูล (หมดเวลา)';
        badge.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-red-900/80 text-white border border-red-700 shadow-sm flex items-center gap-2';
    }
    
    // บังคับเปิด/ปิด Input ในตารางตามสถานะระบบ
    const inputs = document.querySelectorAll('.editable-input');
    const saveBtns = document.querySelectorAll('.btn-save');
    inputs.forEach(input => input.disabled = !isSystemOpen);
    saveBtns.forEach(btn => btn.disabled = !isSystemOpen);
}

// ฟังก์ชันสำหรับ Admin สลับสถานะระบบ
async function toggleSystemStatus() {
    const newStatus = !isSystemOpen;
    const confirmMsg = newStatus ? 'คุณต้องการ "เปิด" ระบบรับข้อมูลใช่หรือไม่?' : 'คุณต้องการ "ปิด" ระบบรับข้อมูลใช่หรือไม่?';
    
    if(confirm(confirmMsg)) {
        const { error } = await supabase
            .from('system_settings_1')
            .update({ is_active: newStatus })
            .eq('setting_name', 'is_form_open');
            
        if(error) alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ');
        else {
            alert('เปลี่ยนสถานะระบบสำเร็จ');
            checkSystemStatus();
        }
    }
}

// ==========================================
// 3. ฟังก์ชันดึงข้อมูล Filter (จังหวัด, อำเภอ, สปส.)
// ==========================================
// หมายเหตุ: เพื่อความง่ายในการสอน เราดึงแบบรวบยอด แต่ถ้าข้อมูลเยอะควรทำ API แยก
async function loadFilterOptions() {
    const { data, error } = await supabase.from('ms_station_1').select('province_name, amphur_name, sso_name');
    
    // เพิ่มบล็อกดัก Error ตรงนี้
    if (error) {
        console.error('เกิดข้อผิดพลาดในการโหลดตัวกรอง:', error);
        alert('ไม่สามารถดึงข้อมูลตัวกรองได้ กรุณาตรวจสอบสิทธิ์ RLS ใน Supabase');
        return;
    }
    
    if (data) {
        const provinces = [...new Set(data.map(item => item.province_name))].sort();
        const amphurs = [...new Set(data.map(item => item.amphur_name))].sort();
        const ssos = [...new Set(data.map(item => item.sso_name))].sort();

        populateDropdown('filterProvince', provinces, '-- แสดงทุกจังหวัด --');
        populateDropdown('filterAmphur', amphurs, '-- แสดงทุกอำเภอ --');
        populateDropdown('filterSSO', ssos, '-- แสดงทุกสำนักงาน --');
    }
}

function populateDropdown(elementId, items, defaultText) {
    const select = document.getElementById(elementId);
    select.innerHTML = `<option value="">${defaultText}</option>`;
    items.forEach(item => {
        if(item) select.innerHTML += `<option value="${item}">${item}</option>`;
    });
}

// ==========================================
// 4. ฟังก์ชันค้นหาและแสดงผลตาราง
// ==========================================
async function searchData() {
    const tableBody = document.getElementById('dataTableBody');
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-blue-500 mb-2"></i><br>กำลังค้นหาข้อมูล...</td></tr>`;
    
    const prov = document.getElementById('filterProvince').value;
    const amph = document.getElementById('filterAmphur').value;
    const sso = document.getElementById('filterSSO').value;
    const searchTxt = document.getElementById('searchInput').value.trim();

    // สร้างคำสั่ง Query
    let query = supabase.from('ms_station_1').select('*');
    if (prov) query = query.eq('province_name', prov);
    if (amph) query = query.eq('amphur_name', amph);
    if (sso) query = query.eq('sso_name', sso);
    if (searchTxt) {
        // ค้นหาแบบ OR ทั้งรหัสและชื่อ
        query = query.or(`polling_station_code.ilike.%${searchTxt}%,polling_station_name.ilike.%${searchTxt}%`);
    }

    const { data, error } = await query.order('province_name').order('sso_name').limit(100); // Limit ไว้ 100 ป้องกันเบราว์เซอร์ค้าง

    if (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
        return;
    }

    stationsData = data;
    document.getElementById('recordCount').innerText = `พบข้อมูล ${data.length} รายการ (แสดงสูงสุด 100 รายการ)`;
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
                ${row.province_name || '-'} > ${row.amphur_name || '-'}<br>
                <span class="font-semibold text-slate-800">${row.sso_name || '-'}</span>
            </td>
            <td class="px-4 py-3 font-semibold text-[#1e3a8a]">${row.polling_station_code}</td>
            <td class="px-2 py-2 bg-yellow-50/50">
                <input type="text" id="name_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-slate-800" value="${row.polling_station_name || ''}" ${!isSystemOpen ? 'disabled' : ''}>
            </td>
            <td class="px-2 py-2 bg-yellow-50/50">
                <input type="text" id="loc_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-slate-800" value="${row.location_name || ''}" ${!isSystemOpen ? 'disabled' : ''}>
            </td>
            <td class="px-2 py-2 bg-yellow-50/50">
                <input type="text" id="url_${row.polling_station_code}" class="w-full p-2 rounded editable-input text-blue-600" value="${row.location_url || ''}" ${!isSystemOpen ? 'disabled' : ''}>
            </td>
            <td class="px-4 py-3 text-center">
                <button onclick="saveRowData('${row.polling_station_code}', ${index})" class="btn-save bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded shadow-sm text-xs font-bold w-full transition disabled:opacity-50 disabled:cursor-not-allowed" ${!isSystemOpen ? 'disabled' : ''}>
                    <i class="fa-solid fa-save mr-1"></i> บันทึก
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// ==========================================
// 5. ฟังก์ชันบันทึกและสร้าง SQL Script
// ==========================================
function escapeSQL(val) {
    // ป้องกัน Single Quote Error ใน SQL (แปลง ' เป็น '')
    if (!val) return '';
    return val.replace(/'/g, "''");
}

async function saveRowData(code, index) {
    if (!isSystemOpen) {
        alert('ระบบปิดรับข้อมูลแล้ว ไม่สามารถบันทึกได้');
        return;
    }

    const oldData = stationsData[index];
    const newName = document.getElementById(`name_${code}`).value.trim();
    const newLoc = document.getElementById(`loc_${code}`).value.trim();
    const newUrl = document.getElementById(`url_${code}`).value.trim();

    // เช็คว่ามีการเปลี่ยนแปลงหรือไม่
    if (oldData.polling_station_name === newName && oldData.location_name === newLoc && oldData.location_url === newUrl) {
        alert('ไม่มีการเปลี่ยนแปลงข้อมูล');
        return;
    }

    if (confirm(`ยืนยันการแก้ไขข้อมูลรหัสหน่วย: ${code} ใช่หรือไม่?`)) {
        
        // 1. สร้างคำสั่ง SQL Update (เตรียมไว้ Export เข้า Database หลัก)
        const sqlScript = `UPDATE ms_station_1 SET polling_station_name = '${escapeSQL(newName)}', location_name = '${escapeSQL(newLoc)}', location_url = '${escapeSQL(newUrl)}' WHERE polling_station_code = '${code}';`;

        // 2. อัปเดตตารางหลัก ms_station_1
        const { error: updateError } = await supabase
            .from('ms_station_1')
            .update({ 
                polling_station_name: newName, 
                location_name: newLoc, 
                location_url: newUrl 
            })
            .eq('polling_station_code', code);

        if (updateError) {
            alert('เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ' + updateError.message);
            return;
        }

        // 3. บันทึกประวัติและ Script ลงตาราง station_update_logs
        const { error: logError } = await supabase
            .from('station_update_logs')
            .insert([{
                polling_station_code: code,
                old_station_name: oldData.polling_station_name,
                new_station_name: newName,
                old_location_name: oldData.location_name,
                new_location_name: newLoc,
                old_location_url: oldData.location_url,
                new_location_url: newUrl,
                sql_script: sqlScript,
                updated_by: 'Staff User' // หากมีระบบ Login ให้ใส่ชื่อ User ตรงนี้
            }]);

        if (logError) {
            console.error('อัปเดตข้อมูลสำเร็จ แต่บันทึก Log ไม่สำเร็จ', logError);
        }

        alert('บันทึกข้อมูลเรียบร้อยแล้ว');
        
        // อัปเดตข้อมูลในตัวแปร Local ให้ตรงกับที่แก้ไข
        stationsData[index].polling_station_name = newName;
        stationsData[index].location_name = newLoc;
        stationsData[index].location_url = newUrl;
    }
}

// ==========================================
// 6. ฟังก์ชันประวัติ (History) และ Export
// ==========================================
async function openHistoryModal() {
    document.getElementById('historyModal').classList.remove('hidden');
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4">กำลังโหลด...</td></tr>`;

    // ดึงประวัติล่าสุด 50 รายการ
    const { data, error } = await supabase
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

    // ดึง Script ทั้งหมดจาก History
    const { data, error } = await supabase
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

    // สร้าง Blob file สำหรับดาวน์โหลด
    const blob = new Blob([sqlContent], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    
    // สร้างลิงก์หลอกๆ แล้วคลิกเพื่อโหลด
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
// 7. การผูก Event (Event Listeners) ทำงานตอนโหลดหน้าเว็บ
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // โหลดตั้งค่าเริ่มต้น
    checkSystemStatus();
    loadFilterOptions();

    // ปุ่มค้นหาและล้างค่า
    document.getElementById('btnSearch').addEventListener('click', searchData);
    document.getElementById('btnClear').addEventListener('click', () => {
        document.getElementById('filterProvince').value = '';
        document.getElementById('filterAmphur').value = '';
        document.getElementById('filterSSO').value = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('dataTableBody').innerHTML = `<tr><td colspan="6" class="text-center py-16 text-slate-400">กรุณาเลือกเงื่อนไขและกดค้นหา</td></tr>`;
        document.getElementById('recordCount').innerText = 'พบข้อมูล 0 รายการ';
    });

    // ปุ่ม Enter ในช่องค้นหาทำงานเหมือนกดปุ่มค้นหา
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') searchData();
    });

    // ปุ่ม Admin สลับระบบ (ตั้งใจซ่อนไว้ หากอยากเปิดให้ทดสอบ ลบคลาส hidden ใน html ได้เลย)
    document.getElementById('btnToggleSystem').addEventListener('click', toggleSystemStatus);
    
    // ปุ่มเปิด Modal
    document.getElementById('btnHistory').addEventListener('click', openHistoryModal);
    document.getElementById('btnExport').addEventListener('click', openExportModal);
    
    // ปุ่มดาวน์โหลดไฟล์
    document.getElementById('btnDownloadSQL').addEventListener('click', downloadSQLFile);
});
