// Configuration for different modes
const MODES = {
    TRAILER: {
        name: 'Trailer',
        sheetUrl: "https://script.google.com/macros/s/AKfycby03RF9OBFEPxbheY0UvkGolzp63uvGMKFe8un1emFqIhNCTk8dmFRXff8A4jIEmtcL/exec?sheet=Trailer_History",
        title: 'Trailer Schedule Dashboard',
        calendarTitle: 'Trailer Schedule (Calendar View)'
    },
    CAMPER: {
        name: 'Camper',
        sheetUrl: "https://script.google.com/macros/s/AKfycby03RF9OBFEPxbheY0UvkGolzp63uvGMKFe8un1emFqIhNCTk8dmFRXff8A4jIEmtcL/exec?sheet=Camper_History",
        title: 'Camper Schedule Dashboard',
        calendarTitle: 'Camper Schedule (Calendar View)'
    }
};

let currentMode = MODES.TRAILER;
let scheduleDataCache = null;
let salesChart = null;

const ROWS_PER_PAGE = 50;
let currentPage = 1;
let filteredScheduleData = [];

// Calendar state
let calendarSelectedMonth = null;
let calendarSelectedYear = null;

// Work Day feature variables
let workDayEntries = [];
let workerList = ["Hayden", "Gavin", "Aiden", "Jayden", "Billy M", "David"];

// Daily Sales feature variables
let customSalesEntries = [];

function updateTitles() {
    document.getElementById('dashboardTitle').textContent = currentMode.title;
    document.getElementById('calendarTitle').textContent = currentMode.calendarTitle;
}

function clearCaches() {
    scheduleDataCache = null;
    filteredScheduleData = [];
    currentPage = 1;
}

async function fetchScheduleData() {
    const response = await fetch(currentMode.sheetUrl);
    if (!response.ok) throw new Error("Failed to fetch data");
    return await response.json();
}

async function fetchSalesData(sheet) {
  return await apiGet(sheet);
}

async function addSale(sheet, saleRow) {
  await apiAdd(sheet, saleRow);
  await reloadSalesTable(sheet);
}

async function updateSaleField(sheet, keyColumns, keyValues, updateColumn, updateValue) {
  await apiUpdateField(sheet, keyColumns, keyValues, updateColumn, updateValue);
  await reloadSalesTable(sheet);
}

async function updateSaleFields(sheet, keyColumns, keyValues, updates) {
  await apiUpdateFields(sheet, keyColumns, keyValues, updates);
  await reloadSalesTable(sheet);
}

async function deleteSale(sheet, keyColumns, keyValues) {
  await apiDelete(sheet, keyColumns, keyValues);
  await reloadSalesTable(sheet);
}

async function reloadSalesTable(sheet) {
  const data = await fetchSalesData(sheet);
  filteredScheduleData = filterScheduleData(data);
  renderTablePage(currentPage);
}

async function fetchWorkDays() {
  return await apiGet('WorkDays');
}

async function addWorkDay(workDayRow) {
  await apiAdd('WorkDays', workDayRow);
  await reloadWorkDays();
}

async function updateWorkDayField(keyColumns, keyValues, updateColumn, updateValue) {
  await apiUpdateField('WorkDays', keyColumns, keyValues, updateColumn, updateValue);
  await reloadWorkDays();
}

async function deleteWorkDayApi(keyColumns, keyValues) {
  await apiDelete('WorkDays', keyColumns, keyValues);
  await reloadWorkDays();
}

async function reloadWorkDays() {
  workDayEntries = await fetchWorkDays();
  renderCalendarWithPicker();
}

function parseSheetDate(dateString) {
    if (!dateString) return null;
    // Handle 'YYYY-MM-DD 0:00:00' format
    const datePart = dateString.split(' ')[0]; // Get just the date part
    const d = new Date(datePart);
    return isNaN(d) ? null : d;
}

function getDateRange() {
    const startDate = new Date('2025-06-01');
    const endDate = new Date('2025-07-12');
    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);
    return { startDate, endDate };
}

function filterScheduleData(data) {
    const { startDate, endDate } = getDateRange();
    console.log('Date range:', startDate, 'to', endDate);
    console.log('Raw fetched data:', data);
    const filtered = data.filter(item => {
        if (!item.Date) return false;
        const d = parseSheetDate(item.Date);
        if (data.indexOf(item) < 5) {
            console.log('Row:', item, 'Parsed date:', d);
        }
        return d && d >= startDate && d <= endDate;
    });
    console.log('Filtered data:', filtered);
    return filtered;
}

function formatDateMDY(dateString) {
    const date = parseSheetDate(dateString);
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatCurrencyGreen(value) {
    if (!value) return '';
    // Remove any non-numeric characters except dot and minus
    let num = Number(String(value).replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return value;
    return `$${Math.round(num).toLocaleString()}`;
}

function renderTablePage(page) {
    const tbody = document.getElementById('scheduleBody');
    tbody.innerHTML = "";
    const startIdx = (page - 1) * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    const pageData = filteredScheduleData.slice(startIdx, endIdx);
    pageData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDateMDY(item.Date)}</td>
            <td>${item.Day || ''}</td>
            <td>${item.Venue || ''}</td>
            <td><span class="status-toggle ${item.Status === 'Confirmed' ? 'status-confirmed' : 'status-tbd'}" data-row="${startIdx + index}">${item.Status || 'TBD'}</span></td>
            <td class="sales forecast-green">${formatCurrencyGreen(item.Forecast || item['Gross Sales'])}</td>
            <td class="sales gross-sales-green">${formatCurrencyGreen(item['Gross Sales'])}</td>
            <td class="sales net-sales-green">${formatCurrencyGreen(item['Net Sales'])}</td>
            <td><button class="detail-btn" onclick="showDetails(${startIdx + index})">Details</button><button class="detail-btn update-btn" onclick="openUpdateSaleModal(${startIdx + index})" style="margin-left:6px;">Update</button></td>
        `;
        tbody.appendChild(row);
    });
    updatePaginationInfo();
    enableStatusToggle();
}

window.openUpdateSaleModal = function(index) {
  const item = filteredScheduleData[index];
  if (!item) return;
  document.getElementById('updateSaleModal').style.display = 'flex';
  document.getElementById('updateSaleForm').reset();
  document.getElementById('updateSaleIndex').value = index;
  document.getElementById('updateSaleDate').value = item.Date ? item.Date.split(' ')[0] : '';
  populateVenueDropdown('updateSaleVenue').then(() => {
    document.getElementById('updateSaleVenue').value = item.Venue || '';
  });
  populateUpdateSaleWorkerDropdown(item.Workers);
  document.getElementById('updateSaleNotes').value = item.Notes || '';
};

function closeUpdateSaleModal() {
  document.getElementById('updateSaleModal').style.display = 'none';
}

function populateUpdateSaleWorkerDropdown(selectedWorkers) {
  const select = document.getElementById('updateSaleWorkers');
  select.innerHTML = '';
  workerList.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (selectedWorkers && (Array.isArray(selectedWorkers) ? selectedWorkers.includes(name) : selectedWorkers === name)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  const addOpt = document.createElement('option');
  addOpt.value = '__add_new__';
  addOpt.textContent = 'Add new worker...';
  select.appendChild(addOpt);
}

function enableStatusToggle() {
  document.querySelectorAll('.status-toggle').forEach(el => {
    el.onclick = async function() {
      const rowIdx = parseInt(this.getAttribute('data-row'), 10);
      const item = filteredScheduleData[rowIdx];
      if (!item) return;
      const newStatus = (item.Status === 'Confirmed') ? 'TBD' : 'Confirmed';
      // Determine sheet
      const sheet = currentMode === MODES.CAMPER ? 'Camper_History' : 'Trailer_History';
      await updateSaleField(sheet, ['Date', 'Venue'], [item.Date, item.Venue], 'Status', newStatus);
      await reloadSalesTable(sheet);
    };
  });
}

function updatePaginationInfo() {
    const pageInfo = document.getElementById('pageInfo');
    const totalPages = Math.ceil(filteredScheduleData.length / ROWS_PER_PAGE) || 1;
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
}

function getCurrentMonthYear() {
    // Use picker if set, else default to current
    if (calendarSelectedMonth !== null && calendarSelectedYear !== null) {
        return { month: calendarSelectedMonth, year: calendarSelectedYear };
    }
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
}

function getDaysInMonth(month, year) {
    return new Date(year, month + 1, 0).getDate();
}

// Helper to create and show the popup
function showVenueSalesPopup(venue, mouseX, mouseY) {
    // Find last 5 sales for this venue
    const allData = scheduleDataCache || [];
    const sales = allData
        .filter(item => (item.Venue || '').trim() === venue && item['Gross Sales'] && item.Date)
        .map(item => ({
            date: parseSheetDate(item.Date),
            gross: Number(String(item['Gross Sales']).replace(/[^\d.-]/g, ''))
        }))
        .filter(item => item.date && !isNaN(item.gross))
        .sort((a, b) => b.date - a.date)
        .slice(0, 5);
    // Build popup content
    let html = `<div style='font-weight:bold; margin-bottom:4px;'>Last 5 Sales</div>`;
    if (sales.length === 0) {
        html += '<div>No sales found.</div>';
    } else {
        html += sales.map(s => `<div>${s.date.toLocaleDateString()} : $${Math.round(s.gross).toLocaleString()}</div>`).join('');
    }
    let popup = document.getElementById('venueSalesPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'venueSalesPopup';
        popup.style.position = 'fixed';
        popup.style.zIndex = 9999;
        popup.style.background = 'white';
        popup.style.border = '1px solid #888';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        popup.style.padding = '10px 16px';
        popup.style.fontSize = '0.95rem';
        popup.style.pointerEvents = 'none';
        document.body.appendChild(popup);
    }
    popup.innerHTML = html;
    popup.style.display = 'block';
    popup.style.left = (mouseX + 16) + 'px';
    popup.style.top = (mouseY + 16) + 'px';
}

function hideVenueSalesPopup() {
    const popup = document.getElementById('venueSalesPopup');
    if (popup) popup.style.display = 'none';
}

// Enhance renderCalendar to show work day entries
function renderCalendar(trailerData) {
    const { month, year } = getCurrentMonthYear();
    const daysInMonth = getDaysInMonth(month, year);
    const calendar = document.createElement('table');
    calendar.className = 'calendar-table';
    const headerRow = document.createElement('tr');
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(day => {
        const th = document.createElement('th');
        th.textContent = day;
        headerRow.appendChild(th);
    });
    calendar.appendChild(headerRow);
    let row = document.createElement('tr');
    const firstDay = new Date(year, month, 1).getDay();
    for (let i = 0; i < firstDay; i++) {
        row.appendChild(document.createElement('td'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
        if ((firstDay + day - 1) % 7 === 0 && day !== 1) {
            calendar.appendChild(row);
            row = document.createElement('tr');
        }
        const cell = document.createElement('td');
        cell.className = 'calendar-cell';
        cell.innerHTML = `<div class='calendar-date'>${day}</div>`;
        // Find events for this day
        const dateStr = new Date(year, month, day).toISOString().slice(0,10);
        const events = trailerData.filter(item => {
            if (!item.Date) return false;
            const itemDate = new Date(item.Date);
            return !isNaN(itemDate) && itemDate.getFullYear() === year && itemDate.getMonth() === month && itemDate.getDate() === day;
        });
        const workDays = workDayEntries.map((wd, idx) => ({...wd, _idx: idx})).filter(wd => {
            const wdDate = new Date(wd.Date);
            return !isNaN(wdDate) && wdDate.getFullYear() === year && wdDate.getMonth() === month && wdDate.getDate() === day;
        });
        if (events.length > 0) {
            events.forEach(ev => {
                const evDiv = document.createElement('div');
                evDiv.className = 'calendar-event';
                let workerText = ev.Workers ? `<div class='calendar-workers'>${Array.isArray(ev.Workers) ? ev.Workers.join(', ') : ev.Workers}</div>` : '';
                evDiv.innerHTML = `${ev.Venue || ''}${workerText}`;
                evDiv.addEventListener('mousemove', function(e) {
                    showVenueSalesPopup(ev.Venue || '', e.clientX, e.clientY);
                });
                evDiv.addEventListener('mouseleave', function() {
                    hideVenueSalesPopup();
                });
                cell.appendChild(evDiv);
            });
        }
        if (workDays.length > 0) {
            workDays.forEach(wd => {
                const wdDiv = document.createElement('div');
                wdDiv.className = 'calendar-workday';
                wdDiv.innerHTML = `<div class='workday-actions'>
                  <button class='workday-action-btn' title='Edit' onclick='openWorkDayModal("${wd.Date}",${wd._idx})'>&#9998;</button>
                  <button class='workday-action-btn' title='Delete' onclick='deleteWorkDayApi(${wd._idx})'>&#128465;</button>
                </div><b>WORK DAY</b><br>${wd.Workers ? wd.Workers.join(', ') : ''}${wd.Time ? ' ('+wd.Time+')' : ''}${wd.Notes ? '<br>'+wd.Notes : ''}`;
                cell.appendChild(wdDiv);
            });
        }
        row.appendChild(cell);
    }
    while (row.children.length < 7) {
        row.appendChild(document.createElement('td'));
    }
    calendar.appendChild(row);
    const calendarPlaceholder = document.getElementById('calendarPlaceholder');
    calendarPlaceholder.innerHTML = '';
    calendarPlaceholder.appendChild(calendar);
}

function showDetails(index) {
    const item = filteredScheduleData[index];
    if (!item) return;
    document.getElementById('modalTitle').textContent = `${item.Venue || ''} - ${item.Date || ''}`;
    document.getElementById('modalNotes').textContent = item.Notes || item['Notes'] || '';
    document.getElementById('modalPromo').textContent = item.Promo || '';
    document.getElementById('modalPromoSend').textContent = item['Promo To Send'] || '';
    document.getElementById('modalAddress').textContent = item['Address / City'] || '';
    document.getElementById('modalContact').textContent = item.Contact || '';
    document.getElementById('modalPhone').textContent = item.Phone || '';
    document.getElementById('modalEmail').textContent = item.Email || '';
    document.getElementById('modalTimes').textContent = item.Times || '';
    document.getElementById('modalShowInfo').textContent = item['Show Info'] || '';
    document.getElementById('modalWorkers').textContent = item.Workers ? item.Workers.join(', ') : '';
    document.getElementById('detailModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('detailModal').style.display = 'none';
}

function showSpinner() {
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideSpinner() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

// Dashboard Analytics Functions
function processDataForAnalytics(data) {
    const currentYear = new Date().getFullYear();
    const monthlyData = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize all months
    monthNames.forEach((month, index) => {
        monthlyData[index] = {
            month: month,
            count: 0,
            totalSales: 0,
            forecast: 0
        };
    });
    
    // Process data - only current year
    data.forEach((item, index) => {
        if (!item.Date) return;
        const date = parseSheetDate(item.Date);
        if (!date || date.getFullYear() !== currentYear) return;
        
        const month = date.getMonth();
        monthlyData[month].count++;
        
        // Add gross sales (actual sales)
        const grossSales = Number(String(item['Gross Sales'] || '0').replace(/[^\d.-]/g, ''));
        if (!isNaN(grossSales) && grossSales > 0) {
            monthlyData[month].totalSales += grossSales;
        }
        
        // Add forecast - use the Forecast column if available
        const forecast = Number(String(item.Forecast || '0').replace(/[^\d.-]/g, ''));
        if (!isNaN(forecast) && forecast > 0) {
            monthlyData[month].forecast += forecast;
        }
    });
    
    return monthlyData;
}

function renderSalesChart2025(data) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) {
        console.error('salesChart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');
    if (window.salesChart && typeof window.salesChart.destroy === 'function') {
        window.salesChart.destroy();
    }
    // Prepare monthly data for 2025 and 2024
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const gross2025 = Array(12).fill(0);
    const gross2024 = Array(12).fill(0);
    data.forEach(item => {
        if (!item.Date) return;
        const date = parseSheetDate(item.Date);
        if (!date) return;
        const month = date.getMonth();
        const gross = Number(String(item['Gross Sales'] || '0').replace(/[^\d.-]/g, ''));
        if (date.getFullYear() === 2025 && !isNaN(gross)) gross2025[month] += gross;
        if (date.getFullYear() === 2024 && !isNaN(gross)) gross2024[month] += gross;
    });
    window.salesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthNames,
            datasets: [
                {
                    label: '2025 Gross Sales',
                    data: gross2025,
                    backgroundColor: 'rgba(40, 167, 69, 0.8)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                },
                {
                    label: '2024 Gross Sales',
                    data: gross2024,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            }
        }
    });
}

function renderSalesCountTable(monthlyData) {
    const tbody = document.getElementById('salesCountBody');
    tbody.innerHTML = '';
    
    Object.values(monthlyData).forEach(data => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${data.month}</td>
            <td>${data.count}</td>
            <td>${formatCurrencyGreen(data.totalSales)}</td>
        `;
        tbody.appendChild(row);
    });
}

function renderFutureSales(monthlyData) {
    const currentMonth = new Date().getMonth();
    const futureSalesContent = document.getElementById('futureSalesContent');
    futureSalesContent.innerHTML = '';
    
    let futureForecastTotal = 0;
    
    Object.values(monthlyData).forEach((data, index) => {
        if (index >= currentMonth && data.forecast > 0) {
            const item = document.createElement('div');
            item.className = 'future-sales-item';
            item.innerHTML = `
                <span class="future-sales-month">${data.month}</span>
                <span class="future-sales-amount">${formatCurrencyGreen(data.forecast)}</span>
            `;
            futureSalesContent.appendChild(item);
            futureForecastTotal += data.forecast;
        }
    });
    
    document.getElementById('futureForecastTotal').textContent = formatCurrencyGreen(futureForecastTotal);
}

function renderVisitCountTable2025(data) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const visitCounts = Array(12).fill(0);
    let totalForecast = 0;
    data.forEach(item => {
        if (!item.Date) return;
        const date = parseSheetDate(item.Date);
        if (!date || date.getFullYear() !== 2025) return;
        const month = date.getMonth();
        visitCounts[month]++;
        const forecast = Number(String(item.Forecast || '0').replace(/[^\d.-]/g, ''));
        if (!isNaN(forecast)) totalForecast += forecast;
    });
    // Render table
    const tbody = document.getElementById('visitCountBody');
    tbody.innerHTML = '';
    monthNames.forEach((month, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${month}</td><td>${visitCounts[i]}</td>`;
        tbody.appendChild(row);
    });
    // Render total forecast
    document.getElementById('totalForecast2025').textContent = `$${Math.round(totalForecast).toLocaleString()}`;
}

// Update updateDashboardAnalytics to call this
function updateDashboardAnalytics() {
    if (!scheduleDataCache) return;
    renderSalesChart2025(scheduleDataCache);
    renderVisitCountTable2025(scheduleDataCache);
    // Calculate YTD gross sales for 2025
    const now = new Date();
    let ytdTotal = 0;
    let monthlyTotals2025 = Array(12).fill(0);
    let monthlyTotals2024 = Array(12).fill(0);
    scheduleDataCache.forEach(item => {
        if (!item.Date) return;
        const date = parseSheetDate(item.Date);
        if (!date) return;
        const month = date.getMonth();
        const gross = Number(String(item['Gross Sales'] || '0').replace(/[^\d.-]/g, ''));
        if (date.getFullYear() === 2025) {
            if (date > now) return; // Only include up to today for YTD
            ytdTotal += !isNaN(gross) ? gross : 0;
            if (month < now.getMonth()) {
                // Only include months before the current month for average
                monthlyTotals2025[month] += !isNaN(gross) ? gross : 0;
            }
        }
        if (date.getFullYear() === 2024) {
            monthlyTotals2024[month] += !isNaN(gross) ? gross : 0;
        }
    });
    // 2025 average per month (only months before current month)
    const prevMonth = now.getMonth();
    const monthsWithData2025 = monthlyTotals2025.slice(0, prevMonth).filter(val => val > 0).length || 1;
    const avg2025 = prevMonth > 0 ? Math.round(monthlyTotals2025.slice(0, prevMonth).reduce((a, b) => a + b, 0) / monthsWithData2025) : 0;
    // 2024 average per month (all 12 months)
    const monthsWithData2024 = monthlyTotals2024.filter(val => val > 0).length || 1;
    const avg2024 = Math.round(monthlyTotals2024.reduce((a, b) => a + b, 0) / monthsWithData2024);
    // Update DOM
    const ytdElem = document.getElementById('ytdValue');
    if (ytdElem) ytdElem.textContent = `$${Math.round(ytdTotal).toLocaleString()}`;
    const avg2025Elem = document.getElementById('avgPerMonth2025');
    if (avg2025Elem) avg2025Elem.textContent = `$${avg2025.toLocaleString()}`;
    const avg2024Elem = document.getElementById('avgPerMonth2024');
    if (avg2024Elem) avg2024Elem.textContent = `$${avg2024.toLocaleString()}`;
}

// Navigation Functions
function setActiveNavButton(activeId) {
    ['dailySalesBtn', 'calendarBtn', 'dashboardBtn', 'averageSaleBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
    if (activeId) {
        const btn = document.getElementById(activeId);
        if (btn) btn.classList.add('active');
    }
}

function showDailySales() {
    document.getElementById('dailySalesView').style.display = 'block';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('averageSaleView').style.display = 'none';
    setActiveNavButton('dailySalesBtn');
}

function showCalendarOnly() {
    document.getElementById('dailySalesView').style.display = 'none';
    document.getElementById('calendarView').style.display = '';
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('averageSaleView').style.display = 'none';
    document.getElementById('dailySalesBtn').classList.remove('active');
    document.getElementById('dashboardBtn').classList.remove('active');
    document.getElementById('averageSaleBtn').classList.remove('active');
    renderCalendarWithPicker();
}

function showCalendarScreen() {
    document.getElementById('calendarView').style.display = '';
    document.getElementById('dailySalesView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('averageSaleView').style.display = 'none';
    setActiveNavButton('calendarBtn');
    renderCalendarWithPicker();
}

function showDashboard() {
    document.getElementById('dailySalesView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('averageSaleView').style.display = 'none';
    setActiveNavButton('dashboardBtn');
    updateDashboardAnalytics();
}

function showAverageSale() {
    document.getElementById('dailySalesView').style.display = 'none';
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('averageSaleView').style.display = 'block';
    setActiveNavButton('averageSaleBtn');
    renderAverageSaleTable(scheduleDataCache || []);
}

function renderAverageSaleTable(data) {
    // Group by venue name
    const venueMap = {};
    data.forEach(item => {
        const venue = (item.Venue || '').trim();
        if (!venue) return;
        const gross = Number(String(item['Gross Sales'] || '0').replace(/[^\d.-]/g, ''));
        if (!venueMap[venue]) {
            venueMap[venue] = { count: 0, totalGross: 0, grossList: [] };
        }
        venueMap[venue].count++;
        if (!isNaN(gross)) {
            venueMap[venue].totalGross += gross;
            venueMap[venue].grossList.push(gross);
        }
    });
    // Prepare array with median for sorting
    const venues = Object.keys(venueMap).map(venue => {
        const { count, totalGross, grossList } = venueMap[venue];
        // Calculate median
        let median = 0;
        if (grossList.length > 0) {
            const sorted = grossList.slice().sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 0) {
                median = (sorted[mid - 1] + sorted[mid]) / 2;
            } else {
                median = sorted[mid];
            }
        }
        // Round down to the next $100
        const medianRounded = Math.floor(median / 100) * 100;
        return { venue, count, totalGross, medianRounded };
    });
    // Sort by medianRounded descending
    venues.sort((a, b) => b.medianRounded - a.medianRounded);
    const tbody = document.getElementById('averageSaleBody');
    tbody.innerHTML = '';
    venues.forEach(({ venue, count, totalGross, medianRounded }) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${venue}</td>
            <td>${count}</td>
            <td>$${Math.round(totalGross).toLocaleString()}</td>
            <td>$${medianRounded.toLocaleString()}</td>
        `;
        tbody.appendChild(row);
    });
}

async function switchMode() {
    const isCamper = document.getElementById('modeToggle').checked;
    currentMode = isCamper ? MODES.CAMPER : MODES.TRAILER;
    updateTitles();
    clearCaches();
    // Reset view to table
    document.getElementById('calendarView').style.display = 'none';
    document.getElementById('tableView').style.display = '';
    // Reload data
    showSpinner();
    try {
        scheduleDataCache = await fetchScheduleData();
        filteredScheduleData = filterScheduleData(scheduleDataCache);
        currentPage = 1;
        renderTablePage(currentPage);
    } catch (err) {
        alert("Failed to load schedule data: " + err.message);
    }
    hideSpinner();
}

function populateCalendarPickers() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthSelect = document.getElementById('calendarMonth');
    const yearSelect = document.getElementById('calendarYear');
    // Populate months
    monthSelect.innerHTML = '';
    monthNames.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = m;
        monthSelect.appendChild(opt);
    });
    // Populate years (from 2022 to current year + 2)
    const now = new Date();
    const minYear = 2022;
    const maxYear = now.getFullYear() + 2;
    yearSelect.innerHTML = '';
    for (let y = minYear; y <= maxYear; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
    // Set default to current month/year
    calendarSelectedMonth = now.getMonth();
    calendarSelectedYear = now.getFullYear();
    monthSelect.value = calendarSelectedMonth;
    yearSelect.value = calendarSelectedYear;
    // Add event listeners
    monthSelect.addEventListener('change', function() {
        calendarSelectedMonth = parseInt(monthSelect.value, 10);
        renderCalendarWithPicker();
    });
    yearSelect.addEventListener('change', function() {
        calendarSelectedYear = parseInt(yearSelect.value, 10);
        renderCalendarWithPicker();
    });
}

function renderCalendarWithPicker() {
    // Use trailerDataCache or scheduleDataCache for events
    const data = scheduleDataCache || [];
    renderCalendar(data);
}

function openWorkDayModal(dateStr, editIndex = null) {
    document.getElementById('workDayModal').style.display = 'flex';
    document.getElementById('workDayForm').reset();
    document.getElementById('newWorkerInput').style.display = 'none';
    document.getElementById('workDayEditIndex').value = editIndex !== null ? editIndex : '';
    populateWorkerDropdown();
    document.getElementById('workDayModalTitle').textContent = editIndex !== null ? 'Edit Work Day' : 'Add Work Day';
    if (editIndex !== null) {
        const wd = workDayEntries[editIndex];
        document.getElementById('workDayDate').value = wd.Date;
        document.getElementById('workDayTime').value = wd.Time;
        document.getElementById('workDayNotes').value = wd.Notes;
        // Set selected workers
        const select = document.getElementById('workDayWorker');
        Array.from(select.options).forEach(opt => {
            opt.selected = wd.Workers && wd.Workers.includes(opt.value);
        });
    } else if (dateStr) {
        document.getElementById('workDayDate').value = dateStr;
    }
}
function closeWorkDayModal() {
    document.getElementById('workDayModal').style.display = 'none';
}
function populateWorkerDropdown() {
    const select = document.getElementById('workDayWorker');
    select.innerHTML = '';
    workerList.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    const addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = 'Add new worker...';
    select.appendChild(addOpt);
}
function updateWorkDayOfWeek() {
    const dateStr = document.getElementById('workDayDate').value;
    if (dateStr) {
        const date = new Date(dateStr);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        document.getElementById('workDayDay').value = days[date.getDay()];
    } else {
        document.getElementById('workDayDay').value = '';
    }
}

function openSaleModal(editIndex = null) {
    document.getElementById('saleModal').style.display = 'flex';
    document.getElementById('saleForm').reset();
    document.getElementById('newSaleWorkerInput').style.display = 'none';
    document.getElementById('saleEditIndex').value = editIndex !== null ? editIndex : '';
    populateSaleWorkerDropdown();
    document.getElementById('saleModalTitle').textContent = editIndex !== null ? 'Edit Sale' : 'Add Sale';
    if (editIndex !== null) {
        const sale = customSalesEntries[editIndex];
        document.getElementById('saleDate').value = sale.Date;
        document.getElementById('saleDay').value = sale.Day;
        document.getElementById('saleVenue').value = sale.Venue;
        document.getElementById('saleStatus').value = sale.Status;
        document.getElementById('saleForecast').value = sale.Forecast;
        document.getElementById('saleGross').value = sale['Gross Sales'];
        document.getElementById('saleNet').value = sale['Net Sales'];
        document.getElementById('saleNotes').value = sale.Notes;
        // Set selected workers
        const select = document.getElementById('saleWorkers');
        Array.from(select.options).forEach(opt => {
            opt.selected = sale.Workers && sale.Workers.includes(opt.value);
        });
    }
}
function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
}
function populateSaleWorkerDropdown() {
    const select = document.getElementById('saleWorkers');
    select.innerHTML = '';
    workerList.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    const addOpt = document.createElement('option');
    addOpt.value = '__add_new__';
    addOpt.textContent = 'Add new worker...';
    select.appendChild(addOpt);
}
function updateSaleDayOfWeek() {
    const dateStr = document.getElementById('saleDate').value;
    if (dateStr) {
        const date = new Date(dateStr);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        document.getElementById('saleDay').value = days[date.getDay()];
    } else {
        document.getElementById('saleDay').value = '';
    }
}
function deleteSale(index) {
    if (confirm('Delete this sale entry?')) {
        customSalesEntries.splice(index, 1);
        renderTablePage(currentPage);
    }
}

// --- Google Sheets API Integration Helpers ---
const SHEETS_API_BASE = 'https://script.google.com/macros/s/AKfycbwcZXKt-ylcIf4-aU08DbDj58E-NisAHtNf9ID5CelpelWFcm0KECs-oTq6dI8rNFMX/exec';

async function apiGet(sheet) {
  const res = await fetch(`${SHEETS_API_BASE}?sheet=${sheet}`);
  if (!res.ok) throw new Error('Failed to fetch data');
  return await res.json();
}

async function apiAdd(sheet, row) {
  const res = await fetch(`${SHEETS_API_BASE}?sheet=${sheet}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', row })
  });
  return await res.json();
}

async function apiUpdateField(sheet, keyColumns, keyValues, updateColumn, updateValue) {
  const res = await fetch(`${SHEETS_API_BASE}?sheet=${sheet}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateField',
      keyColumns,
      keyValues,
      updateColumn,
      updateValue
    })
  });
  return await res.json();
}

async function apiUpdateFields(sheet, keyColumns, keyValues, updates) {
  const res = await fetch(`${SHEETS_API_BASE}?sheet=${sheet}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateFields',
      keyColumns,
      keyValues,
      updates
    })
  });
  return await res.json();
}

async function apiDelete(sheet, keyColumns, keyValues) {
  const res = await fetch(`${SHEETS_API_BASE}?sheet=${sheet}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete',
      keyColumns,
      keyValues
    })
  });
  return await res.json();
}

async function populateVenueDropdown(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '';
  try {
    const venues = await apiGet('Venues');
    venues.forEach(v => {
      if (v.Venue) {
        const opt = document.createElement('option');
        opt.value = v.Venue;
        opt.textContent = v.Venue;
        select.appendChild(opt);
      }
    });
  } catch (err) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Error loading venues';
    select.appendChild(opt);
  }
}

async function addVenue(newVenue) {
  await apiAdd('Venues', [newVenue]);
  await updateAllVenueDropdowns();
}

async function editVenue(oldVenue, newVenue) {
  await apiUpdateField('Venues', ['Venue'], [oldVenue], 'Venue', newVenue);
  await updateAllVenueDropdowns();
}

async function deleteVenue(venue) {
  await apiDelete('Venues', ['Venue'], [venue]);
  await updateAllVenueDropdowns();
}

async function updateAllVenueDropdowns() {
  // Add all select IDs that use venues here
  await populateVenueDropdown('saleVenue');
  await populateVenueDropdown('updateSaleVenue'); // Added for update modal
  // Add more as needed
}

async function reloadAllData() {
  // Reload venues and update dropdowns
  await updateAllVenueDropdowns();
  // Reload sales for current mode
  const sheet = currentMode === MODES.CAMPER ? 'Camper_History' : 'Trailer_History';
  await reloadSalesTable(sheet);
  // Reload work days
  await reloadWorkDays();
}

// Double-click in calendar to add worker
function setupCalendarDoubleClick() {
  document.getElementById('calendarPlaceholder').addEventListener('dblclick', function(e) {
    // Find the cell
    let cell = e.target.closest('.calendar-cell');
    if (!cell) return;
    // Get the date from the cell
    let dateDiv = cell.querySelector('.calendar-date');
    if (!dateDiv) return;
    let day = dateDiv.textContent;
    const { month, year } = getCurrentMonthYear();
    let dateStr = new Date(year, month, parseInt(day, 10)).toISOString().slice(0,10);
    openWorkDayModal(dateStr);
  });
}

function enableInlineEditing() {
  const tbody = document.getElementById('scheduleBody');
  tbody.addEventListener('dblclick', async function(e) {
    const cell = e.target.closest('td');
    if (!cell) return;
    const row = cell.parentElement;
    const colIdx = Array.from(row.children).indexOf(cell);
    // Only allow editing for Gross Sales (5), Net Sales (6)
    if (![5, 6].includes(colIdx)) return;
    const originalValue = cell.textContent;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = originalValue.replace(/[$,]/g, '');
    input.style.width = '90%';
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        saveEdit();
      } else if (ev.key === 'Escape') {
        cell.textContent = originalValue;
      }
    });
    async function saveEdit() {
      const newValue = input.value;
      if (newValue === originalValue) {
        cell.textContent = originalValue;
        return;
      }
      // Find the data row
      const rowIdx = row.rowIndex - 1 + (currentPage - 1) * ROWS_PER_PAGE;
      const item = filteredScheduleData[rowIdx];
      if (!item) return;
      // Determine sheet
      const sheet = currentMode === MODES.CAMPER ? 'Camper_History' : 'Trailer_History';
      let updateCol;
      if (colIdx === 5) updateCol = 'Gross Sales';
      if (colIdx === 6) updateCol = 'Net Sales';
      // Use Date + Venue as key
      await updateSaleField(sheet, ['Date', 'Venue'], [item.Date, item.Venue], updateCol, newValue);
      await reloadSalesTable(sheet);
    }
  });
}

document.addEventListener('DOMContentLoaded', async function() {
    const showCalendarBtn = document.getElementById('showCalendarBtn');
    const calendarView = document.getElementById('calendarView');
    const tableView = document.getElementById('tableView');
    let calendarVisible = false;

    // Initialize with Trailer mode
    updateTitles();
    
    showSpinner();
    try {
        scheduleDataCache = await fetchScheduleData();
        filteredScheduleData = filterScheduleData(scheduleDataCache);
        currentPage = 1;
        renderTablePage(currentPage);
    } catch (err) {
        alert("Failed to load schedule data: " + err.message);
    }
    hideSpinner();

    // Mode toggle event listener
    document.getElementById('modeToggle').addEventListener('change', switchMode);
    
    // Navigation event listeners
    document.getElementById('dailySalesBtn').addEventListener('click', showDailySales);
    document.getElementById('dashboardBtn').addEventListener('click', showDashboard);
    document.getElementById('averageSaleBtn').addEventListener('click', showAverageSale);
    document.getElementById('calendarBtn').addEventListener('click', showCalendarScreen);

    document.getElementById('prevPageBtn').addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderTablePage(currentPage);
        }
    });
    
    document.getElementById('nextPageBtn').addEventListener('click', function() {
        const totalPages = Math.ceil(filteredScheduleData.length / ROWS_PER_PAGE) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderTablePage(currentPage);
        }
    });

    document.querySelector('.close').addEventListener('click', closeModal);
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('detailModal');
        if (event.target === modal) {
            closeModal();
        }
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    populateCalendarPickers();
    document.getElementById('printCalendarBtn').addEventListener('click', function() {
        window.print();
    });

    document.getElementById('addWorkDayBtn').addEventListener('click', function() {
        openWorkDayModal();
    });
    document.getElementById('closeWorkDayModal').addEventListener('click', closeWorkDayModal);
    document.getElementById('workDayDate').addEventListener('change', updateWorkDayOfWeek);
    document.getElementById('workDayWorker').addEventListener('change', function(e) {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        if (selected.includes('__add_new__')) {
            document.getElementById('newWorkerInput').style.display = '';
        } else {
            document.getElementById('newWorkerInput').style.display = 'none';
        }
    });
    document.getElementById('addWorkerBtn').addEventListener('click', function() {
        const newName = document.getElementById('newWorkerInput').value.trim();
        if (newName && !workerList.includes(newName)) {
            workerList.push(newName);
            populateWorkerDropdown();
            // Select the new worker
            const select = document.getElementById('workDayWorker');
            Array.from(select.options).forEach(opt => {
                opt.selected = opt.value === newName;
            });
            document.getElementById('newWorkerInput').value = '';
            document.getElementById('newWorkerInput').style.display = 'none';
        }
    });
    document.getElementById('workDayForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('workDayDate').value;
        let workers = Array.from(document.getElementById('workDayWorker').selectedOptions).map(opt => opt.value).filter(v => v !== '__add_new__');
        // Add new worker if needed
        if (workers.includes('__add_new__')) {
            const newWorker = document.getElementById('newWorkerInput').value.trim();
            if (newWorker && !workerList.includes(newWorker)) {
                workerList.push(newWorker);
                workers = workers.filter(w => w !== '__add_new__').concat(newWorker);
            }
        }
        const time = document.getElementById('workDayTime').value;
        const notes = document.getElementById('workDayNotes').value;
        const editIndex = document.getElementById('workDayEditIndex').value;
        if (date && workers.length > 0) {
            if (editIndex !== '') {
                workDayEntries[editIndex] = { Date: date, Workers: workers, Time: time, Notes: notes };
            } else {
                workDayEntries.push({ Date: date, Workers: workers, Time: time, Notes: notes });
            }
            closeWorkDayModal();
            renderCalendarWithPicker();
        }
    });

    document.getElementById('addSaleBtn').addEventListener('click', function() {
        openSaleModal();
    });
    document.getElementById('closeSaleModal').addEventListener('click', closeSaleModal);
    document.getElementById('exitSaleModalBtn').addEventListener('click', closeSaleModal);
    document.getElementById('saleDate').addEventListener('change', updateSaleDayOfWeek);
    document.getElementById('saleWorkers').addEventListener('change', function(e) {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        if (selected.includes('__add_new__')) {
            document.getElementById('newSaleWorkerInput').style.display = '';
        } else {
            document.getElementById('newSaleWorkerInput').style.display = 'none';
        }
    });
    document.getElementById('addSaleWorkerBtn').addEventListener('click', function() {
        const newName = document.getElementById('newSaleWorkerInput').value.trim();
        if (newName && !workerList.includes(newName)) {
            workerList.push(newName);
            populateSaleWorkerDropdown();
            // Select the new worker
            const select = document.getElementById('saleWorkers');
            Array.from(select.options).forEach(opt => {
                opt.selected = opt.value === newName;
            });
            document.getElementById('newSaleWorkerInput').value = '';
            document.getElementById('newSaleWorkerInput').style.display = 'none';
        }
    });
    document.getElementById('saleForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const date = document.getElementById('saleDate').value;
        const day = document.getElementById('saleDay').value;
        const venue = document.getElementById('saleVenue').value;
        const status = document.getElementById('saleStatus').value;
        const forecast = document.getElementById('saleForecast').value;
        const gross = document.getElementById('saleGross').value;
        const net = document.getElementById('saleNet').value;
        const notes = document.getElementById('saleNotes').value;
        let workers = Array.from(document.getElementById('saleWorkers').selectedOptions).map(opt => opt.value).filter(v => v !== '__add_new__');
        // Add new worker if needed
        if (workers.includes('__add_new__')) {
            const newWorker = document.getElementById('newSaleWorkerInput').value.trim();
            if (newWorker && !workerList.includes(newWorker)) {
                workerList.push(newWorker);
                workers = workers.filter(w => w !== '__add_new__').concat(newWorker);
            }
        }
        const editIndex = document.getElementById('saleEditIndex').value;
        const saleObj = {
            Date: date,
            Day: day,
            Venue: venue,
            Status: status,
            Forecast: forecast,
            'Gross Sales': gross,
            'Net Sales': net,
            Notes: notes,
            Workers: workers
        };
        if (editIndex !== '') {
            customSalesEntries[editIndex] = saleObj;
        } else {
            customSalesEntries.push(saleObj);
        }
        closeSaleModal();
        renderTablePage(currentPage);
    });
    setupCalendarDoubleClick();
    enableInlineEditing();
}); 