// ค่าคงที่สำหรับการเชื่อมต่อ Google API
const API_KEY = 'YOUR_API_KEY'; // ต้องใส่ API Key ของคุณ
const CLIENT_ID = 'YOUR_CLIENT_ID'; // ต้องใส่ Client ID ของคุณ
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// ตั้ง ID ของ Google Spreadsheet
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // ต้องใส่ ID ของ Google Sheet ของคุณ
const SHEET_NAME = 'บันทึกเวลาทำงาน';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// เริ่มต้นการทำงานเมื่อโหลดหน้าเว็บ
document.addEventListener('DOMContentLoaded', function() {
    // เริ่มต้นโหลด Google API
    gapiLoaded();
    gisLoaded();
    
    // เพิ่ม Event Listener
    document.getElementById('saveButton').addEventListener('click', saveWorkTime);
    document.getElementById('refreshButton').addEventListener('click', loadWorkHistory);
});

// โหลด Google API Client
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// เริ่มต้น Google API Client
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

// โหลด Google Identity Services
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

// เปิดใช้งานปุ่มเมื่อโหลด API เสร็จ
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
        document.getElementById('signout_button').addEventListener('click', handleSignoutClick);
    }
}

// จัดการการล็อกอิน
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw resp;
        }
        document.getElementById('authorize_button').style.display = 'none';
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('formSection').style.display = 'block';
        document.getElementById('historySection').style.display = 'block';
        
        // โหลดประวัติการทำงาน
        await checkAndCreateSheet();
        loadWorkHistory();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

// จัดการการออกจากระบบ
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('authorize_button').style.display = 'block';
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('formSection').style.display = 'none';
        document.getElementById('historySection').style.display = 'none';
        document.getElementById('workEntries').innerHTML = '';
        document.getElementById('result').textContent = '-- ชั่วโมง -- นาที';
    }
}

// ตรวจสอบและสร้าง Sheet ถ้ายังไม่มี
async function checkAndCreateSheet() {
    try {
        // ดึงข้อมูลของ Spreadsheet
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });
        
        // ตรวจสอบว่ามีชีทที่ต้องการหรือไม่
        const sheets = response.result.sheets;
        let sheetExists = false;
        
        for (const sheet of sheets) {
            if (sheet.properties.title === SHEET_NAME) {
                sheetExists = true;
                break;
            }
        }
        
        // ถ้าไม่มีชีทที่ต้องการ ให้สร้างใหม่
        if (!sheetExists) {
            await gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                resource: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: SHEET_NAME
                                }
                            }
                        }
                    ]
                }
            });
            
            // เพิ่มหัวตาราง
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A1:G1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['ID', 'วันที่', 'ชื่อพนักงาน', 'เวลาเข้างาน', 'เวลาออกงาน', 'ชั่วโมงทำงาน', 'นาทีทำงาน']]
                }
            });
        }
    } catch (err) {
        console.error('Error checking or creating sheet:', err);
        alert('เกิดข้อผิดพลาดในการตรวจสอบหรือสร้าง Sheet: ' + err.message);
    }
}

// บันทึกเวลาทำงาน
async function saveWorkTime() {
    const workDate = document.getElementById('workDate').value;
    const employeeName = document.getElementById('employeeName').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    // ตรวจสอบข้อมูล
    if (!workDate || !employeeName || !startTime || !endTime) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }
    
    // คำนวณเวลาทำงาน
    const start = new Date(`${workDate}T${startTime}`);
    const end = new Date(`${workDate}T${endTime}`);
    
    if (end <= start) {
        alert('เวลาออกงานต้องมากกว่าเวลาเข้างาน');
        return;
    }
    
    const diffMs = end - start;
    const diffHrs = Math.floor(diffMs / 1000 / 60 / 60);
    const diffMins = Math.floor((diffMs / 1000 / 60) % 60);
    
    // แสดงผลลัพธ์
    document.getElementById('result').textContent = `${diffHrs} ชั่วโมง ${diffMins} นาที`;
    
    try {
        // สร้าง ID ที่ไม่ซ้ำกัน
        const id = Date.now().toString();
        
        // บันทึกข้อมูลลงใน Google Sheets
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A:G`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: [
                    [
                        id,
                        workDate,
                        employeeName,
                        startTime,
                        endTime,
                        diffHrs,
                        diffMins
                    ]
                ]
            }
        });
        
        alert('บันทึกข้อมูลสำเร็จ');
        
        // รีเซ็ตฟอร์ม
        document.getElementById('startTime').value = '';
        document.getElementById('endTime').value = '';
        
        // โหลดข้อมูลใหม่
        loadWorkHistory();
    } catch (err) {
        console.error('Error saving data to Google Sheets:', err);
        alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message);
    }
}

// โหลดประวัติการทำงาน
async function loadWorkHistory() {
    try {
        document.getElementById('loading-message').style.display = 'block';
        
        // ดึงข้อมูลจาก Google Sheets
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A2:G`,
        });
        
        const values = response.result.values || [];
        const tableBody = document.getElementById('workEntries');
        tableBody.innerHTML = '';
        
        if (values.length === 0) {
            document.getElementById('loading-message').textContent = 'ไม่พบข้อมูลการทำงาน';
            return;
        }
        
        // แสดงข้อมูลในตาราง (เรียงจากใหม่ไปเก่า)
        values.reverse().forEach(row => {
            // ตรวจสอบว่าข้อมูลครบถ้วนหรือไม่
            if (row.length < 7) return;
            
            const [id, date, name, startTime, endTime, hours, minutes] = row;
            
            const tableRow = document.createElement('tr');
            
            const dateCell = document.createElement('td');
            dateCell.textContent = formatDate(date);
            
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            
            const startTimeCell = document.createElement('td');
            startTimeCell.textContent = startTime;
            
            const endTimeCell = document.createElement('td');
            endTimeCell.textContent = endTime;
            
            const durationCell = document.createElement('td');
            durationCell.textContent = `${hours} ชั่วโมง ${minutes} นาที`;
            
            tableRow.appendChild(dateCell);
            tableRow.appendChild(nameCell);
            tableRow.appendChild(startTimeCell);
            tableRow.appendChild(endTimeCell);
            tableRow.appendChild(durationCell);
            
            tableBody.appendChild(tableRow);
        });
        
        document.getElementById('loading-message').style.display = 'none';
    } catch (err) {
        console.error('Error loading work history:', err);
        document.getElementById('loading-message').textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message;
    }
}

// ฟังก์ชันจัดรูปแบบวันที่
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        });
    } catch (e) {
        return dateString; // ถ้าแปลงไม่ได้ให้คืนค่าเดิม
    }
}