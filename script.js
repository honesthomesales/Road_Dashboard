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
            <td><span class="status ${item.Status ? item.Status.toLowerCase() : ''}">${item.Status || ''}</span></td>
            <td class="sales forecast-green">${formatCurrencyGreen(item.Forecast || item['Gross Sales'])}</td>
            <td class="sales gross-sales-green">${formatCurrencyGreen(item['Gross Sales'])}</td>
            <td class="sales net-sales-green">${formatCurrencyGreen(item['Net Sales'])}</td>
            <td><button class="detail-btn" onclick="showDetails(${startIdx + index})">Details</button></td>
        `;
        tbody.appendChild(row);
    });
    updatePaginationInfo();
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

// Enhance renderCalendar to add hover events
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
        const dateStr = new Date(year, month, day).toLocaleDateString('en-CA');
        const events = trailerData.filter(item => {
            if (!item.Date) return false;
            // Accept both YYYY-MM-DD and MM/DD/YYYY
            const itemDate = new Date(item.Date);
            return !isNaN(itemDate) && itemDate.getFullYear() === year && itemDate.getMonth() === month && itemDate.getDate() === day;
        });
        if (events.length > 0) {
            events.forEach(ev => {
                const evDiv = document.createElement('div');
                evDiv.className = 'calendar-event';
                evDiv.textContent = ev.Venue || '';
                // Add hover events for popup
                evDiv.addEventListener('mousemove', function(e) {
                    showVenueSalesPopup(ev.Venue || '', e.clientX, e.clientY);
                });
                evDiv.addEventListener('mouseleave', function() {
                    hideVenueSalesPopup();
                });
                cell.appendChild(evDiv);
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
}); 