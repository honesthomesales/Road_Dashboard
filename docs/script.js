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
    const dashboardTitle = document.getElementById('dashboardTitle');
    const calendarTitle = document.getElementById('calendarTitle');
    if (dashboardTitle) dashboardTitle.textContent = currentMode.title;
    if (calendarTitle) calendarTitle.textContent = currentMode.calendarTitle;
}

function clearCaches() {
    scheduleDataCache = null;
    filteredScheduleData = [];
    currentPage = 1;
}

async function fetchScheduleData() {
    try {
        const response = await fetch(currentMode.sheetUrl);
        if (!response.ok) throw new Error("Failed to fetch data");
        return await response.json();
    } catch (err) {
        showMessage('Error loading data. Please try again later.');
        throw err;
    }
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
    // Dynamic: current month
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
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
    if (!filteredScheduleData || filteredScheduleData.length === 0) {
        showMessage('No sales data available for this period.');
        updatePaginationInfo();
        return;
    }
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
            <td><button class="detail-btn" onclick="showDetails(${startIdx + index})" tabindex="0" aria-label="Show details for row ${startIdx + index}">Details</button><button class="detail-btn update-btn" onclick="openUpdateSaleModal(${startIdx + index})" style="margin-left:6px;" tabindex="0" aria-label="Update sale for row ${startIdx + index}">Update</button></td>
        `;
        tbody.appendChild(row);
    });
    updatePaginationInfo();
    enableStatusToggle();
}

function openUpdateSaleModal(index) {
  const sale = filteredScheduleData[index];
  const updateSaleIndex = document.getElementById('updateSaleIndex');
  const updateSaleDate = document.getElementById('updateSaleDate');
  const updateSaleVenue = document.getElementById('updateSaleVenue');
  const updateSaleWorkers = document.getElementById('updateSaleWorkers');
  const updateSaleStatus = document.getElementById('updateSaleStatus');
  const updateSaleForecast = document.getElementById('updateSaleForecast');
  const updateSaleGross = document.getElementById('updateSaleGross');
  const updateSaleNet = document.getElementById('updateSaleNet');
  const updateSaleNotes = document.getElementById('updateSaleNotes');
  const updateSalePromo = document.getElementById('updateSalePromo');
  const updateSalePromoSend = document.getElementById('updateSalePromoSend');
  const updateSaleAddress = document.getElementById('updateSaleAddress');
  const updateSaleContact = document.getElementById('updateSaleContact');
  const updateSalePhone = document.getElementById('updateSalePhone');
  const updateSaleEmail = document.getElementById('updateSaleEmail');
  const updateSaleTimes = document.getElementById('updateSaleTimes');
  const updateSaleShowInfo = document.getElementById('updateSaleShowInfo');
  const updateSaleModal = document.getElementById('updateSaleModal');

  if (updateSaleIndex) updateSaleIndex.value = index;
  if (updateSaleDate) updateSaleDate.value = sale.Date || '';
  if (updateSaleVenue) populateVenueDropdown('updateSaleVenue', sale.Venue);
  if (updateSaleWorkers) populateUpdateSaleWorkerDropdown(sale.Workers);
  if (updateSaleStatus) updateSaleStatus.value = sale.Status || 'Confirmed';
  if (updateSaleForecast) updateSaleForecast.value = sale.Forecast || '';
  if (updateSaleGross) updateSaleGross.value = sale['Gross Sales'] || '';
  if (updateSaleNet) updateSaleNet.value = sale['Net Sales'] || '';
  if (updateSaleNotes) updateSaleNotes.value = sale.Notes || '';
  if (updateSalePromo) updateSalePromo.value = sale.Promo || '';
  if (updateSalePromoSend) updateSalePromoSend.value = sale['Promo To Send'] || '';
  if (updateSaleAddress) updateSaleAddress.value = sale['Address / City'] || '';
  if (updateSaleContact) updateSaleContact.value = sale.Contact || '';
  if (updateSalePhone) updateSalePhone.value = sale.Phone || '';
  if (updateSaleEmail) updateSaleEmail.value = sale.Email || '';
  if (updateSaleTimes) updateSaleTimes.value = sale.Times || '';
  if (updateSaleShowInfo) updateSaleShowInfo.value = sale['Show Info'] || '';
  if (updateSaleModal) updateSaleModal.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', function() {
  var updateSaleForm = document.getElementById('updateSaleForm');
  if (updateSaleForm) {
    updateSaleForm.onsubmit = async function(e) {
      e.preventDefault();
      const index = document.getElementById('updateSaleIndex').value;
      const updatedSale = {
        Date: document.getElementById('updateSaleDate').value,
        Venue: document.getElementById('updateSaleVenue').value,
        Workers: Array.from(document.getElementById('updateSaleWorkers').selectedOptions).map(opt => opt.value),
        Status: document.getElementById('updateSaleStatus') ? document.getElementById('updateSaleStatus').value : '',
        Forecast: document.getElementById('updateSaleForecast') ? document.getElementById('updateSaleForecast').value : '',
        'Gross Sales': document.getElementById('updateSaleGross') ? document.getElementById('updateSaleGross').value : '',
        'Net Sales': document.getElementById('updateSaleNet') ? document.getElementById('updateSaleNet').value : '',
        Notes: document.getElementById('updateSaleNotes').value,
        Promo: document.getElementById('updateSalePromo') ? document.getElementById('updateSalePromo').value : '',
        'Promo To Send': document.getElementById('updateSalePromoSend') ? document.getElementById('updateSalePromoSend').value : '',
        'Address / City': document.getElementById('updateSaleAddress') ? document.getElementById('updateSaleAddress').value : '',
        Contact: document.getElementById('updateSaleContact') ? document.getElementById('updateSaleContact').value : '',
        Phone: document.getElementById('updateSalePhone') ? document.getElementById('updateSalePhone').value : '',
        Email: document.getElementById('updateSaleEmail') ? document.getElementById('updateSaleEmail').value : '',
        Times: document.getElementById('updateSaleTimes') ? document.getElementById('updateSaleTimes').value : '',
        'Show Info': document.getElementById('updateSaleShowInfo') ? document.getElementById('updateSaleShowInfo').value : ''
      };
      await updateSaleApi(index, updatedSale);
      document.getElementById('updateSaleModal').style.display = 'none';
      await refreshScheduleData();
    };
  }
  var exitUpdateSaleModalBtn = document.getElementById('exitUpdateSaleModalBtn');
  if (exitUpdateSaleModalBtn) {
    exitUpdateSaleModalBtn.onclick = function() {
      document.getElementById('updateSaleModal').style.display = 'none';
    };
  }
});

function closeUpdateSaleModal() {
  const updateSaleModal = document.getElementById('updateSaleModal');
  if (updateSaleModal) updateSaleModal.style.display = 'none';
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
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
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
            events.forEach((ev, i) => {
                const evDiv = document.createElement('div');
                evDiv.className = 'calendar-event calendar-venue-visit';
                let workerText = ev.Workers ? `<div class='calendar-workers'>${Array.isArray(ev.Workers) ? ev.Workers.join(', ') : ev.Workers}</div>` : '';
                evDiv.innerHTML = `${ev.Venue || ''}${workerText}`;
                evDiv.addEventListener('dblclick', function(e) {
                  openUpdateSaleModal(filteredScheduleData.findIndex(row => row.Date === ev.Date && row.Venue === ev.Venue));
                  e.stopPropagation();
                });
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
                wdDiv.className = 'calendar-workday calendar-workday-entry';
                wdDiv.innerHTML = `<div class='workday-actions'>
                  <button class='workday-action-btn' title='Edit' onclick='openWorkDayModal("${wd.Date}",${wd._idx})'>&#9998;</button>
                  <button class='workday-action-btn' title='Delete' onclick='deleteWorkDayApi(${wd._idx})'>&#128465;</button>
                </div><b>WORK DAY</b><br>${wd.Workers ? wd.Workers.join(', ') : ''}${wd.Time ? ' ('+wd.Time+')' : ''}${wd.Notes ? '<br>'+wd.Notes : ''}`;
                wdDiv.addEventListener('dblclick', function(e) {
                  openWorkDayModal(wd.Date, wd._idx);
                  e.stopPropagation();
                });
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
    const modalTitle = document.getElementById('modalTitle');
    const modalNotes = document.getElementById('modalNotes');
    const modalPromo = document.getElementById('modalPromo');
    const modalPromoSend = document.getElementById('modalPromoSend');
    const modalAddress = document.getElementById('modalAddress');
    const modalContact = document.getElementById('modalContact');
    const modalPhone = document.getElementById('modalPhone');
    const modalEmail = document.getElementById('modalEmail');
    const modalTimes = document.getElementById('modalTimes');
    const modalShowInfo = document.getElementById('modalShowInfo');
    const modalWorkers = document.getElementById('modalWorkers');
    const detailModal = document.getElementById('detailModal');

    if (modalTitle) modalTitle.textContent = `${item.Venue || ''} - ${item.Date || ''}`;
    if (modalNotes) modalNotes.textContent = item.Notes || item['Notes'] || '';
    if (modalPromo) modalPromo.textContent = item.Promo || '';
    if (modalPromoSend) modalPromoSend.textContent = item['Promo To Send'] || '';
    if (modalAddress) modalAddress.textContent = item['Address / City'] || '';
    if (modalContact) modalContact.textContent = item.Contact || '';
    if (modalPhone) modalPhone.textContent = item.Phone || '';
    if (modalEmail) modalEmail.textContent = item.Email || '';
    if (modalTimes) modalTimes.textContent = item.Times || '';
    if (modalShowInfo) modalShowInfo.textContent = item['Show Info'] || '';
    if (modalWorkers) modalWorkers.textContent = item.Workers ? item.Workers.join(', ') : '';
    if (detailModal) detailModal.style.display = 'block';
}

function closeModal() {
    const detailModal = document.getElementById('detailModal');
    if (detailModal) detailModal.style.display = 'none';
}

function showSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'flex';
}

function hideSpinner() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) loadingSpinner.style.display = 'none';
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
    
    const futureForecastTotalElem = document.getElementById('futureForecastTotal');
    if (futureForecastTotalElem) futureForecastTotalElem.textContent = formatCurrencyGreen(futureForecastTotal);
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
    const totalForecast2025Elem = document.getElementById('totalForecast2025');
    if (totalForecast2025Elem) totalForecast2025Elem.textContent = `$${Math.round(totalForecast).toLocaleString()}`;
}

// Update updateDashboardAnalytics to call this
function updateDashboardAnalytics() {
    if (!scheduleDataCache || !scheduleDataCache.length) {
        showMessage('No dashboard analytics data available.', 'visitCountBody', 2);
        const ytdValue = document.getElementById('ytdValue');
        if (ytdValue) ytdValue.textContent = '$0';
        const avgPerMonth2025 = document.getElementById('avgPerMonth2025');
        if (avgPerMonth2025) avgPerMonth2025.textContent = '$0';
        const avgPerMonth2024 = document.getElementById('avgPerMonth2024');
        if (avgPerMonth2024) avgPerMonth2024.textContent = '$0';
        const totalForecast2025 = document.getElementById('totalForecast2025');
        if (totalForecast2025) totalForecast2025.textContent = '$0';
        if (salesChart) salesChart.destroy();
        return;
    }
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
    const dailySalesBtn = document.getElementById('dailySalesBtn');
    const calendarBtn = document.getElementById('calendarBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const averageSaleBtn = document.getElementById('averageSaleBtn');

    if (dailySalesBtn) dailySalesBtn.classList.remove('active');
    if (calendarBtn) calendarBtn.classList.remove('active');
    if (dashboardBtn) dashboardBtn.classList.remove('active');
    if (averageSaleBtn) averageSaleBtn.classList.remove('active');

    if (activeId) {
        const btn = document.getElementById(activeId);
        if (btn) btn.classList.add('active');
    }
}

function showDailySales() {
    const dailySalesView = document.getElementById('dailySalesView');
    const calendarView = document.getElementById('calendarView');
    const dashboardView = document.getElementById('dashboardView');
    const averageSaleView = document.getElementById('averageSaleView');

    if (dailySalesView) dailySalesView.style.display = 'block';
    if (calendarView) calendarView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';
    if (averageSaleView) averageSaleView.style.display = 'none';
    setActiveNavButton('dailySalesBtn');
}

function showCalendarOnly() {
    const dailySalesView = document.getElementById('dailySalesView');
    const calendarView = document.getElementById('calendarView');
    const dashboardView = document.getElementById('dashboardView');
    const averageSaleView = document.getElementById('averageSaleView');

    if (dailySalesView) dailySalesView.style.display = 'none';
    if (calendarView) calendarView.style.display = '';
    if (dashboardView) dashboardView.style.display = 'none';
    if (averageSaleView) averageSaleView.style.display = 'none';
    if (document.getElementById('dailySalesBtn')) document.getElementById('dailySalesBtn').classList.remove('active');
    if (document.getElementById('dashboardBtn')) document.getElementById('dashboardBtn').classList.remove('active');
    if (document.getElementById('averageSaleBtn')) document.getElementById('averageSaleBtn').classList.remove('active');
    renderCalendarWithPicker();
}

function showCalendarScreen() {
    const calendarView = document.getElementById('calendarView');
    const dailySalesView = document.getElementById('dailySalesView');
    const dashboardView = document.getElementById('dashboardView');
    const averageSaleView = document.getElementById('averageSaleView');

    if (calendarView) calendarView.style.display = '';
    if (dailySalesView) dailySalesView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';
    if (averageSaleView) averageSaleView.style.display = 'none';
    setActiveNavButton('calendarBtn');
    renderCalendarWithPicker();
}

function showDashboard() {
    const dailySalesView = document.getElementById('dailySalesView');
    const calendarView = document.getElementById('calendarView');
    const dashboardView = document.getElementById('dashboardView');
    const averageSaleView = document.getElementById('averageSaleView');

    if (dailySalesView) dailySalesView.style.display = 'none';
    if (calendarView) calendarView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';
    if (averageSaleView) averageSaleView.style.display = 'none';
    setActiveNavButton('dashboardBtn');
    updateDashboardAnalytics();
}

function showAverageSale() {
    const dailySalesView = document.getElementById('dailySalesView');
    const calendarView = document.getElementById('calendarView');
    const dashboardView = document.getElementById('dashboardView');
    const averageSaleView = document.getElementById('averageSaleView');

    if (dailySalesView) dailySalesView.style.display = 'none';
    if (calendarView) calendarView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'none';
    if (averageSaleView) averageSaleView.style.display = 'block';
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
    if (!venues.length) {
        showMessage('No venue sales data available.', 'averageSaleBody', 4);
        return;
    }
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
    const isCamper = document.getElementById('modeToggle');
    if (!isCamper) return;
    const isCamperChecked = isCamper.checked;
    currentMode = isCamperChecked ? MODES.CAMPER : MODES.TRAILER;
    updateTitles();
    clearCaches();
    // Reset view to table
    const calendarView = document.getElementById('calendarView');
    const tableView = document.getElementById('tableView');
    if (calendarView) calendarView.style.display = 'none';
    if (tableView) tableView.style.display = '';
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
    if (monthSelect) {
        monthSelect.innerHTML = '';
        monthNames.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = m;
            monthSelect.appendChild(opt);
        });
    }
    // Populate years (from 2022 to current year + 2)
    const now = new Date();
    const minYear = 2022;
    const maxYear = now.getFullYear() + 2;
    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let y = minYear; y <= maxYear; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelect.appendChild(opt);
        }
    }
    // Set default to current month/year
    calendarSelectedMonth = now.getMonth();
    calendarSelectedYear = now.getFullYear();
    if (monthSelect) monthSelect.value = calendarSelectedMonth;
    if (yearSelect) yearSelect.value = calendarSelectedYear;
    // Add event listeners
    if (monthSelect) monthSelect.addEventListener('change', function() {
        calendarSelectedMonth = parseInt(monthSelect.value, 10);
        renderCalendarWithPicker();
    });
    if (yearSelect) yearSelect.addEventListener('change', function() {
        calendarSelectedYear = parseInt(yearSelect.value, 10);
        renderCalendarWithPicker();
    });
}

function renderCalendarWithPicker() {
    // Use trailerDataCache or scheduleDataCache for events
    const data = scheduleDataCache || [];
    const calendarPlaceholder = document.getElementById('calendarPlaceholder');
    if (!calendarPlaceholder) return;

    if (!data.length) {
        showMessage('No calendar data available for this period.', 'calendarPlaceholder', 1);
        return;
    }
    renderCalendar(data);
}

function openWorkDayModal(dateStr, editIndex = null) {
    const workDayModal = document.getElementById('workDayModal');
    const workDayForm = document.getElementById('workDayForm');
    const newWorkerInput = document.getElementById('newWorkerInput');
    const workDayEditIndex = document.getElementById('workDayEditIndex');
    const workDayModalTitle = document.getElementById('workDayModalTitle');
    const workDayDate = document.getElementById('workDayDate');
    const workDayTime = document.getElementById('workDayTime');
    const workDayNotes = document.getElementById('workDayNotes');
    const workDayWorker = document.getElementById('workDayWorker');

    if (workDayModal) workDayModal.style.display = 'flex';
    if (workDayForm) workDayForm.reset();
    if (newWorkerInput) newWorkerInput.style.display = 'none';
    if (workDayEditIndex) workDayEditIndex.value = editIndex !== null ? editIndex : '';
    populateWorkerDropdown();
    if (workDayModalTitle) workDayModalTitle.textContent = editIndex !== null ? 'Edit Work Day' : 'Add Work Day';
    if (editIndex !== null) {
        const wd = workDayEntries[editIndex];
        if (workDayDate) workDayDate.value = wd.Date;
        if (workDayTime) workDayTime.value = wd.Time;
        if (workDayNotes) workDayNotes.value = wd.Notes;
        // Set selected workers
        if (workDayWorker) populateUpdateSaleWorkerDropdown(wd.Workers);
    } else if (dateStr) {
        if (workDayDate) workDayDate.value = dateStr;
    }
}
function closeWorkDayModal() {
    const workDayModal = document.getElementById('workDayModal');
    if (workDayModal) workDayModal.style.display = 'none';
}
function populateWorkerDropdown() {
    const select = document.getElementById('workDayWorker');
    if (!select) return;
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
        const workDayDay = document.getElementById('workDayDay');
        if (workDayDay) workDayDay.value = days[date.getDay()];
    } else {
        const workDayDay = document.getElementById('workDayDay');
        if (workDayDay) workDayDay.value = '';
    }
}

function openSaleModal(editIndex = null) {
    const saleModal = document.getElementById('saleModal');
    const saleForm = document.getElementById('saleForm');
    const newSaleWorkerInput = document.getElementById('newSaleWorkerInput');
    const saleEditIndex = document.getElementById('saleEditIndex');
    const saleDate = document.getElementById('saleDate');
    const saleDay = document.getElementById('saleDay');
    const saleVenue = document.getElementById('saleVenue');
    const saleStatus = document.getElementById('saleStatus');
    const saleForecast = document.getElementById('saleForecast');
    const saleGross = document.getElementById('saleGross');
    const saleNet = document.getElementById('saleNet');
    const saleNotes = document.getElementById('saleNotes');
    const saleWorkers = document.getElementById('saleWorkers');

    if (saleModal) saleModal.style.display = 'flex';
    if (saleForm) saleForm.reset();
    if (newSaleWorkerInput) newSaleWorkerInput.style.display = 'none';
    if (saleEditIndex) saleEditIndex.value = editIndex !== null ? editIndex : '';
    populateSaleWorkerDropdown();
    if (saleModal) saleModal.style.display = 'flex';
    if (saleModalTitle) saleModalTitle.textContent = editIndex !== null ? 'Edit Sale' : 'Add Sale';
    if (editIndex !== null) {
        const sale = customSalesEntries[editIndex];
        if (saleDate) saleDate.value = sale.Date;
        if (saleDay) saleDay.value = sale.Day;
        if (saleVenue) populateVenueDropdown('saleVenue', sale.Venue);
        if (saleStatus) saleStatus.value = sale.Status;
        if (saleForecast) saleForecast.value = sale.Forecast;
        if (saleGross) saleGross.value = sale['Gross Sales'];
        if (saleNet) saleNet.value = sale['Net Sales'];
        if (saleNotes) saleNotes.value = sale.Notes;
        // Set selected workers
        if (saleWorkers) populateSaleWorkerDropdown(sale.Workers);
    }
}
function closeSaleModal() {
    const saleModal = document.getElementById('saleModal');
    if (saleModal) saleModal.style.display = 'none';
}
function populateSaleWorkerDropdown() {
    const select = document.getElementById('saleWorkers');
    if (!select) return;
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
        const saleDay = document.getElementById('saleDay');
        if (saleDay) saleDay.value = days[date.getDay()];
    } else {
        const saleDay = document.getElementById('saleDay');
        if (saleDay) saleDay.value = '';
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

async function populateVenueDropdown(selectId, currentVenue = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
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
    if (currentVenue) {
      select.value = currentVenue;
    }
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
  const calendarPlaceholder = document.getElementById('calendarPlaceholder');
  if (!calendarPlaceholder) return;
  calendarPlaceholder.addEventListener('dblclick', function(e) {
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

// Utility: Show error or empty state messages
const showMessage = (msg, targetId = 'scheduleBody', colspan = 8) => {
    const tbody = document.getElementById(targetId);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#e74c3c; font-weight:600;">${msg}</td></tr>`;
    }
};

document.addEventListener('DOMContentLoaded', async function() {
    // Accessibility: Add ARIA and tabindex to nav buttons
    const dailySalesBtn = document.getElementById('dailySalesBtn');
    const calendarBtn = document.getElementById('calendarBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const averageSaleBtn = document.getElementById('averageSaleBtn');

    if (dailySalesBtn) {
        dailySalesBtn.setAttribute('tabindex', '0');
        dailySalesBtn.setAttribute('role', 'button');
        dailySalesBtn.setAttribute('aria-pressed', dailySalesBtn.classList.contains('active') ? 'true' : 'false');
        dailySalesBtn.setAttribute('aria-label', dailySalesBtn.textContent);
        dailySalesBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') dailySalesBtn.click();
        });
    }
    if (calendarBtn) {
        calendarBtn.setAttribute('tabindex', '0');
        calendarBtn.setAttribute('role', 'button');
        calendarBtn.setAttribute('aria-pressed', calendarBtn.classList.contains('active') ? 'true' : 'false');
        calendarBtn.setAttribute('aria-label', calendarBtn.textContent);
        calendarBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') calendarBtn.click();
        });
    }
    if (dashboardBtn) {
        dashboardBtn.setAttribute('tabindex', '0');
        dashboardBtn.setAttribute('role', 'button');
        dashboardBtn.setAttribute('aria-pressed', dashboardBtn.classList.contains('active') ? 'true' : 'false');
        dashboardBtn.setAttribute('aria-label', dashboardBtn.textContent);
        dashboardBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') dashboardBtn.click();
        });
    }
    if (averageSaleBtn) {
        averageSaleBtn.setAttribute('tabindex', '0');
        averageSaleBtn.setAttribute('role', 'button');
        averageSaleBtn.setAttribute('aria-pressed', averageSaleBtn.classList.contains('active') ? 'true' : 'false');
        averageSaleBtn.setAttribute('aria-label', averageSaleBtn.textContent);
        averageSaleBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') averageSaleBtn.click();
        });
    }

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
    const modeToggle = document.getElementById('modeToggle');
    if (modeToggle) modeToggle.addEventListener('change', switchMode);
    
    // Navigation event listeners
    const dailySalesBtnElement = document.getElementById('dailySalesBtn');
    if (dailySalesBtnElement) dailySalesBtnElement.addEventListener('click', showDailySales);
    const dashboardBtnElement = document.getElementById('dashboardBtn');
    if (dashboardBtnElement) dashboardBtnElement.addEventListener('click', showDashboard);
    const averageSaleBtnElement = document.getElementById('averageSaleBtn');
    if (averageSaleBtnElement) averageSaleBtnElement.addEventListener('click', showAverageSale);
    const calendarBtnElement = document.getElementById('calendarBtn');
    if (calendarBtnElement) calendarBtnElement.addEventListener('click', showCalendarScreen);

    const prevPageBtn = document.getElementById('prevPageBtn');
    if (prevPageBtn) prevPageBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderTablePage(currentPage);
        }
    });
    
    const nextPageBtn = document.getElementById('nextPageBtn');
    if (nextPageBtn) nextPageBtn.addEventListener('click', function() {
        const totalPages = Math.ceil(filteredScheduleData.length / ROWS_PER_PAGE) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderTablePage(currentPage);
        }
    });

    const detailModal = document.getElementById('detailModal');
    if (detailModal) {
        detailModal.querySelector('.close').addEventListener('click', closeModal);
        window.addEventListener('click', function(event) {
            if (event.target === detailModal) {
                closeModal();
            }
        });
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeModal();
            }
        });
    }

    populateCalendarPickers();
    const printCalendarBtn = document.getElementById('printCalendarBtn');
    if (printCalendarBtn) printCalendarBtn.addEventListener('click', function() {
        window.print();
    });

    const addWorkDayBtn = document.getElementById('addWorkDayBtn');
    if (addWorkDayBtn) addWorkDayBtn.addEventListener('click', function() {
        openWorkDayModal();
    });
    const closeWorkDayModalBtn = document.getElementById('closeWorkDayModal');
    if (closeWorkDayModalBtn) closeWorkDayModalBtn.addEventListener('click', closeWorkDayModal);
    const workDayDate = document.getElementById('workDayDate');
    if (workDayDate) workDayDate.addEventListener('change', updateWorkDayOfWeek);
    const workDayWorker = document.getElementById('workDayWorker');
    if (workDayWorker) workDayWorker.addEventListener('change', function(e) {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        if (selected.includes('__add_new__')) {
            const newWorkerInput = document.getElementById('newWorkerInput');
            if (newWorkerInput) newWorkerInput.style.display = '';
        } else {
            const newWorkerInput = document.getElementById('newWorkerInput');
            if (newWorkerInput) newWorkerInput.style.display = 'none';
        }
    });
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    if (addWorkerBtn) addWorkerBtn.addEventListener('click', function() {
        const newName = document.getElementById('newWorkerInput').value.trim();
        if (newName && !workerList.includes(newName)) {
            workerList.push(newName);
            populateWorkerDropdown();
            // Select the new worker
            const select = document.getElementById('workDayWorker');
            if (select) Array.from(select.options).forEach(opt => {
                opt.selected = opt.value === newName;
            });
            const newWorkerInput = document.getElementById('newWorkerInput');
            if (newWorkerInput) newWorkerInput.value = '';
            const newWorkerInputDiv = document.getElementById('newWorkerInput');
            if (newWorkerInputDiv) newWorkerInputDiv.style.display = 'none';
        }
    });
    const workDayForm = document.getElementById('workDayForm');
    if (workDayForm) workDayForm.addEventListener('submit', function(e) {
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

    const addSaleBtn = document.getElementById('addSaleBtn');
    if (addSaleBtn) addSaleBtn.addEventListener('click', function() {
        openSaleModal();
    });
    const closeSaleModalBtn = document.getElementById('closeSaleModal');
    if (closeSaleModalBtn) closeSaleModalBtn.addEventListener('click', closeSaleModal);
    const exitSaleModalBtn = document.getElementById('exitSaleModalBtn');
    if (exitSaleModalBtn) exitSaleModalBtn.addEventListener('click', closeSaleModal);
    const saleDate = document.getElementById('saleDate');
    if (saleDate) saleDate.addEventListener('change', updateSaleDayOfWeek);
    const saleWorkers = document.getElementById('saleWorkers');
    if (saleWorkers) saleWorkers.addEventListener('change', function(e) {
        const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
        if (selected.includes('__add_new__')) {
            const newSaleWorkerInput = document.getElementById('newSaleWorkerInput');
            if (newSaleWorkerInput) newSaleWorkerInput.style.display = '';
        } else {
            const newSaleWorkerInput = document.getElementById('newSaleWorkerInput');
            if (newSaleWorkerInput) newSaleWorkerInput.style.display = 'none';
        }
    });
    const addSaleWorkerBtn = document.getElementById('addSaleWorkerBtn');
    if (addSaleWorkerBtn) addSaleWorkerBtn.addEventListener('click', function() {
        const newName = document.getElementById('newSaleWorkerInput').value.trim();
        if (newName && !workerList.includes(newName)) {
            workerList.push(newName);
            populateSaleWorkerDropdown();
            // Select the new worker
            const select = document.getElementById('saleWorkers');
            if (select) Array.from(select.options).forEach(opt => {
                opt.selected = opt.value === newName;
            });
            const newSaleWorkerInput = document.getElementById('newSaleWorkerInput');
            if (newSaleWorkerInput) newSaleWorkerInput.value = '';
            const newSaleWorkerInputDiv = document.getElementById('newSaleWorkerInput');
            if (newSaleWorkerInputDiv) newSaleWorkerInputDiv.style.display = 'none';
        }
    });
    const saleForm = document.getElementById('saleForm');
    if (saleForm) saleForm.addEventListener('submit', function(e) {
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
    const closeUpdateSaleModal = document.getElementById('closeUpdateSaleModal');
    if (closeUpdateSaleModal) closeUpdateSaleModal.onclick = closeUpdateSaleModal;
    const exitUpdateSaleModalBtn = document.getElementById('exitUpdateSaleModalBtn');
    if (exitUpdateSaleModalBtn) exitUpdateSaleModalBtn.onclick = closeUpdateSaleModal;
}); 