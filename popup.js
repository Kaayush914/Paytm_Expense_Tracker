document.addEventListener('DOMContentLoaded', () => {
    // Get stored transactions and display analysis
    chrome.storage.local.get(['transactions'], (result) => {
        const transactions = result.transactions || [];
        if (transactions.length > 0) {
            displayAnalysis(transactions);
        } else {
            document.getElementById('content').innerHTML = `
                <div class="no-data">
                    <p>No transactions found yet.</p>
                    <p>Visit <a href="https://paytm.com/myorders" target="_blank">Paytm Orders</a> to start tracking.</p>
                </div>
            `;
        }
    });
});

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transactionsUpdated") {
        chrome.storage.local.get(['transactions'], (result) => {
            displayAnalysis(result.transactions || []);
        });
    }
});

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('paytm.com')) {
        alert('Please navigate to Paytm orders page first.');
        return;
    }

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
            // Find all transaction rows
            const rows = document.querySelectorAll('._2PmH5');
            
            if (rows.length === 0) {
                alert('No transactions found. Please make sure you are on the Paytm orders page.');
                return;
            }

            const transactions = [];
            let totalAmount = 0;
            const categories = {};
            const dailyData = {};
            const hourlyData = {};

            rows.forEach(row => {
                const description = row.querySelector('._1Jw44')?.textContent?.trim() || '';
                const amount = row.querySelector('._2Llef._2g75t.LwOpS')?.textContent?.trim() || '';
                const status = row.querySelector('.vt2ni')?.textContent?.trim() || '';
                const date = row.querySelector('.UZK5K span:last-child')?.textContent?.trim() || '';

                if (status.toLowerCase().includes('success')) {
                    const amountValue = parseFloat(amount.replace('Rs ', '').replace(/,/g, '')) || 0;
                    
                    // Enhanced categorization
                    let category = 'Other';
                    const desc = description.toLowerCase();
                    if (desc.includes('metro') || desc.includes('taxi') || desc.includes('uber') || desc.includes('ola')) {
                        category = 'Transport';
                    } else if (desc.includes('dth') || desc.includes('bill payment') || desc.includes('electricity') || desc.includes('gas')) {
                        category = 'Bills';
                    } else if (desc.includes('recharge') || desc.includes('mobile') || desc.includes('airtel') || desc.includes('jio')) {
                        category = 'Recharge';
                    } else if (desc.includes('food') || desc.includes('restaurant') || desc.includes('zomato') || desc.includes('swiggy')) {
                        category = 'Food';
                    } else if (desc.includes('movie') || desc.includes('entertainment') || desc.includes('bookmyshow')) {
                        category = 'Entertainment';
                    } else if (desc.includes('shopping') || desc.includes('amazon') || desc.includes('flipkart')) {
                        category = 'Shopping';
                    } else if (desc.includes('medicine') || desc.includes('pharmacy') || desc.includes('hospital')) {
                        category = 'Healthcare';
                    }

                    totalAmount += amountValue;

                    // Category aggregation
                    if (!categories[category]) {
                        categories[category] = {
                            total: 0,
                            count: 0,
                            transactions: []
                        };
                    }
                    categories[category].total += amountValue;
                    categories[category].count += 1;
                    categories[category].transactions.push({
                        description,
                        amount: amountValue,
                        date
                    });

                    // Daily aggregation - Fixed date parsing
                    const transDate = new Date(date);
                    const dayKey = transDate.toISOString().split('T')[0];
                    if (!dailyData[dayKey]) {
                        dailyData[dayKey] = {
                            total: 0,
                            count: 0,
                            date: transDate.toLocaleDateString('en-IN', { 
                                month: 'short', 
                                day: 'numeric' 
                            })
                        };
                    }
                    dailyData[dayKey].total += amountValue;
                    dailyData[dayKey].count += 1;

                    // Hourly aggregation (assuming current time for demo)
                    const hour = transDate.getHours();
                    if (!hourlyData[hour]) {
                        hourlyData[hour] = {
                            total: 0,
                            count: 0
                        };
                    }
                    hourlyData[hour].total += amountValue;
                    hourlyData[hour].count += 1;

                    transactions.push({
                        description,
                        amount: amountValue,
                        date,
                        category
                    });
                }
            });

            // Remove existing report if any
            const existingReport = document.querySelector('#paytm-analysis-report');
            if (existingReport) {
                existingReport.remove();
            }

            // Create comprehensive report container
            const container = document.createElement('div');
            container.id = 'paytm-analysis-report';
            container.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                border: 1px solid #e1e5e9;
            `;

            // Calculate insights
            const avgTransaction = totalAmount / transactions.length;
            const topCategory = Object.entries(categories).sort((a, b) => b[1].total - a[1].total)[0];
            const recentTransactions = transactions.slice(0, 5);

            let html = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1a202c; font-size: 24px;">Expense Analysis</h2>
                    <button id="closeReport" style="
                        padding: 8px 12px;
                        background: #e53e3e;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Close</button>
                </div>

                <!-- Summary Cards -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 25px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold;">Rs ${totalAmount.toFixed(0)}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Total Spent</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold;">${transactions.length}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Transactions</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 24px; font-weight: bold;">Rs ${avgTransaction.toFixed(0)}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Average</div>
                    </div>
                    <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 18px; font-weight: bold;">${topCategory ? topCategory[0] : 'N/A'}</div>
                        <div style="font-size: 12px; opacity: 0.9;">Top Category</div>
                    </div>
                </div>

                <!-- Charts Section -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 18px;">Visual Analytics</h3>
                    
                    <!-- Category Pie Chart -->
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #4a5568;">Category Distribution</h4>
                        <canvas id="categoryChart" width="500" height="300"></canvas>
                    </div>

                   <!-- Daily Spending Chart -->
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 15px 0; color: #4a5568; font-size: 16px;">Daily Spending Trend</h4>
                        <div style="position: relative; height: 250px; overflow: hidden;">
                            <canvas id="dailyChart" width="550" height="250" style="max-width: 100%; height: auto;"></canvas>
                        </div>
                    </div>

                    <!-- Spending Pattern Chart -->
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
                        <h4 style="margin: 0 0 10px 0; color: #4a5568;">Spending Patterns</h4>
                        <canvas id="patternChart" width="500" height="200"></canvas>
                    </div>
                </div>

                <!-- Category Breakdown -->
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 18px;">Category Breakdown</h3>
                    <div style="display: grid; gap: 10px;">
            `;

            // Add category cards
            Object.entries(categories)
                .sort((a, b) => b[1].total - a[1].total)
                .forEach(([category, data]) => {
                    const percentage = ((data.total / totalAmount) * 100).toFixed(1);
                    
                    html += `
                        <div style="background: white; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div>
                                    <div style="font-weight: 600; color: #2d3748;">${category}</div>
                                    <div style="font-size: 12px; color: #718096;">${data.count} transactions</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 600; color: #2d3748;">Rs ${data.total.toFixed(2)}</div>
                                <div style="font-size: 12px; color: #718096;">${percentage}%</div>
                            </div>
                        </div>
                    `;
                });

            html += `
                    </div>
                </div>

                <!-- Recent Transactions -->
                <div>
                    <h3 style="margin: 0 0 15px 0; color: #2d3748; font-size: 18px;">Recent Transactions</h3>
                    <div style="background: #f8fafc; border-radius: 8px; overflow: hidden;">
            `;

            recentTransactions.forEach((trans, index) => {
                html += `
                    <div style="padding: 12px; border-bottom: ${index < recentTransactions.length - 1 ? '1px solid #e2e8f0' : 'none'}; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500; color: #2d3748; font-size: 14px;">${trans.description}</div>
                            <div style="font-size: 12px; color: #718096;">${trans.date} on ${trans.category}</div>
                        </div>
                        <div style="font-weight: 600; color: #e53e3e;">Rs ${trans.amount.toFixed(2)}</div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;

            container.innerHTML = html;
            document.body.appendChild(container);

            // Create charts after DOM is ready
            setTimeout(() => {
                createCategoryChart(categories);
                createDailyChart(dailyData);
                createPatternChart(categories);
            }, 100);

            // Close button handler
            document.getElementById('closeReport').addEventListener('click', () => {
                container.remove();
            });

            // Chart creation functions
            function createCategoryChart(categories) {
                const canvas = document.getElementById('categoryChart');
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                const labels = Object.keys(categories);
                const data = labels.map(cat => categories[cat].total);
                
                // Simple pie chart
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
                
                const total = data.reduce((sum, val) => sum + val, 0);
                let currentAngle = 0;
                
                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const radius = Math.min(centerX, centerY) - 20;
                
                data.forEach((value, index) => {
                    const sliceAngle = (value / total) * 2 * Math.PI;
                    
                    // Draw slice
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
                    ctx.lineTo(centerX, centerY);
                    ctx.fillStyle = colors[index % colors.length];
                    ctx.fill();
                    
                    // Draw label
                    const labelAngle = currentAngle + sliceAngle / 2;
                    const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
                    const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
                    
                    ctx.fillStyle = 'white';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(labels[index], labelX, labelY);
                    
                    currentAngle += sliceAngle;
                });
            }
            
            function createDailyChart(dailyData) {
            const canvas = document.getElementById('dailyChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const sortedDays = Object.keys(dailyData).sort();
            const values = sortedDays.map(day => dailyData[day].total);
            const dateLabels = sortedDays.map(day => dailyData[day].date);
            
            if (values.length === 0) return;
            
            // Limit the number of bars to prevent cluttering
            const maxBars = 15;
            let displayData = values;
            let displayLabels = dateLabels;
            
            // If we have too many data points, show only the most recent ones
            if (values.length > maxBars) {
                displayData = values.slice(-maxBars);
                displayLabels = dateLabels.slice(-maxBars);
            }
            
            const maxValue = Math.max(...displayData);
            const padding = 50;
            const chartWidth = canvas.width - padding * 2;
            const chartHeight = canvas.height - padding * 2;
            
            // Calculate bar width with minimum width constraint
            const minBarWidth = 20;
            const idealBarWidth = Math.max(minBarWidth, (chartWidth - (displayData.length - 1) * 5) / displayData.length);
            const barSpacing = 5;
            
            // Draw background grid
            ctx.strokeStyle = '#f0f4f8';
            ctx.lineWidth = 1;
            
            // Horizontal grid lines
            for (let i = 0; i <= 5; i++) {
                const y = padding + (chartHeight / 5) * i;
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(canvas.width - padding, y);
                ctx.stroke();
                
                // Add value labels on Y-axis
                const value = maxValue - (maxValue / 5) * i;
                ctx.fillStyle = '#718096';
                ctx.font = '11px Arial';
                ctx.textAlign = 'right';
                ctx.fillText('Rs ' + value.toFixed(0), padding - 5, y + 4);
            }
            
            // Draw main axes
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            // Calculate total width needed
            const totalWidth = displayData.length * idealBarWidth + (displayData.length - 1) * barSpacing;
            const startX = padding + (chartWidth - totalWidth) / 2;
            
            // Draw bars with gradient
            displayData.forEach((value, index) => {
                const barHeight = (value / maxValue) * chartHeight;
                const x = startX + index * (idealBarWidth + barSpacing);
                const y = canvas.height - padding - barHeight;
                
                // Create gradient
                const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
                gradient.addColorStop(0, '#4ECDC4');
                gradient.addColorStop(1, '#44A08D');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, idealBarWidth, barHeight);
                
                // Add subtle border
                ctx.strokeStyle = '#3A9B9A';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, idealBarWidth, barHeight);
                
                // Add value labels on top of bars
                ctx.fillStyle = '#2d3748';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Rs ' + value.toFixed(0), x + idealBarWidth / 2, y - 5);
                
                // Add date labels at bottom (rotated if needed)
                ctx.save();
                ctx.translate(x + idealBarWidth / 2, canvas.height - padding + 15);
                
                // Rotate labels if bars are too narrow
                if (idealBarWidth < 40) {
                    ctx.rotate(-Math.PI / 4);
                }
                
                ctx.fillStyle = '#4a5568';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(displayLabels[index], 0, 0);
                ctx.restore();
            });
            
            // Add chart title
            ctx.fillStyle = '#2d3748';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Daily Spending Trend', canvas.width / 2, 20);
            
            // Add summary info if data was truncated
            if (values.length > maxBars) {
                ctx.fillStyle = '#718096';
                ctx.font = '11px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Showing last ${maxBars} days of ${values.length} total days`, canvas.width / 2, canvas.height - 5);
            }
}

            
            function createPatternChart(categories) {
                const canvas = document.getElementById('patternChart');
                if (!canvas) return;
                
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const categoryNames = Object.keys(categories);
                const categoryTotals = categoryNames.map(name => categories[name].total);
                
                if (categoryTotals.length === 0) return;
                
                const maxValue = Math.max(...categoryTotals);
                const padding = 60;
                const chartWidth = canvas.width - padding * 2;
                const chartHeight = canvas.height - padding * 2;
                
                // Draw horizontal bars
                const barHeight = chartHeight / categoryNames.length;
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
                
                categoryNames.forEach((category, index) => {
                    const value = categoryTotals[index];
                    const barWidth = (value / maxValue) * chartWidth;
                    const y = padding + index * barHeight + barHeight * 0.1;
                    
                    // Draw bar
                    ctx.fillStyle = colors[index % colors.length];
                    ctx.fillRect(padding, y, barWidth, barHeight * 0.8);
                    
                    // Draw category label
                    ctx.fillStyle = '#2d3748';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(category, 5, y + barHeight * 0.5);
                    
                    // Draw value label
                    ctx.textAlign = 'right';
                    ctx.fillText('Rs ' + value.toFixed(0), canvas.width - 5, y + barHeight * 0.5);
                });
            }
        }
    });
});

function displayAnalysis(transactions) {
    const analysis = analyzeTransactions(transactions);
    
    // Format currency
    const formatCurrency = (amount) => {
        return 'Rs ' + amount.toFixed(2);
    };
    
    // Format date
    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };
    
    // Create HTML content
    let html = `
        <div class="summary">
            <div class="stat">
                <h3>Total Spent</h3>
                <p class="amount">${formatCurrency(analysis.total)}</p>
            </div>
            <div class="stat">
                <h3>Average per Transaction</h3>
                <p class="amount">${formatCurrency(analysis.average)}</p>
            </div>
            <div class="stat">
                <h3>Total Transactions</h3>
                <p class="count">${analysis.count}</p>
            </div>
        </div>
        
        <div class="charts">
            <div class="chart-container">
                <h3>Spending by Category</h3>
                <canvas id="categoryChart"></canvas>
            </div>
            <div class="chart-container">
                <h3>Monthly Spending</h3>
                <canvas id="monthlyChart"></canvas>
            </div>
        </div>
        
        <div class="recent-transactions">
            <h3>Recent Transactions</h3>
            <div class="transaction-list">
                ${analysis.recent.map(trans => `
                    <div class="transaction">
                        <div class="trans-info">
                            <p class="trans-desc">${trans.description}</p>
                            <p class="trans-date">${formatDate(trans.date)}</p>
                        </div>
                        <p class="trans-amount">${formatCurrency(trans.amount)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('content').innerHTML = html;
    
    // Create charts
    createCategoryChart(analysis.byCategory);
    createMonthlyChart(analysis.byMonth);
}

// Helper function to analyze transactions
function analyzeTransactions(transactions) {
    const analysis = {
        total: 0,
        count: transactions.length,
        average: 0,
        byMonth: {},
        byCategory: {},
        recent: transactions.slice(0, 5)
    };
    
    transactions.forEach(trans => {
        // Calculate total
        analysis.total += trans.amount;
        
        // Group by month
        const date = new Date(trans.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        if (!analysis.byMonth[monthKey]) {
            analysis.byMonth[monthKey] = {
                total: 0,
                count: 0,
                transactions: []
            };
        }
        analysis.byMonth[monthKey].total += trans.amount;
        analysis.byMonth[monthKey].count++;
        analysis.byMonth[monthKey].transactions.push(trans);
        
        // Try to categorize based on description
        let category = 'Other';
        const desc = trans.description.toLowerCase();
        if (desc.includes('recharge') || desc.includes('mobile')) category = 'Mobile';
        else if (desc.includes('food') || desc.includes('restaurant')) category = 'Food';
        else if (desc.includes('movie') || desc.includes('entertainment')) category = 'Entertainment';
        else if (desc.includes('travel') || desc.includes('taxi') || desc.includes('uber')) category = 'Travel';
        else if (desc.includes('bill') || desc.includes('utility')) category = 'Bills';
        
        if (!analysis.byCategory[category]) {
            analysis.byCategory[category] = {
                total: 0,
                count: 0
            };
        }
        analysis.byCategory[category].total += trans.amount;
        analysis.byCategory[category].count++;
    });
    
    // Calculate average
    analysis.average = analysis.total / analysis.count;
    
    return analysis;
}

// Chart creation functions for the popup
function createCategoryChart(categories) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(categories);
    const data = labels.map(cat => categories[cat].total);
    
    // Simple pie chart
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    
    const total = data.reduce((sum, val) => sum + val, 0);
    let currentAngle = 0;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    data.forEach((value, index) => {
        const sliceAngle = (value / total) * 2 * Math.PI;
        
        // Draw slice
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = colors[index % colors.length];
        ctx.fill();
        
        // Draw label
        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);
        
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(labels[index], labelX, labelY);
        
        currentAngle += sliceAngle;
    });
}

function createMonthlyChart(monthlyData) {
    const canvas = document.getElementById('monthlyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const sortedMonths = Object.keys(monthlyData).sort();
    const values = sortedMonths.map(month => monthlyData[month].total);
    const monthLabels = sortedMonths.map(month => {
        const [year, monthNum] = month.split('-');
        return new Date(year, monthNum - 1).toLocaleDateString('en-IN', { 
            month: 'short', 
            year: '2-digit' 
        });
    });
    
    if (values.length === 0) return;
    
    const maxValue = Math.max(...values);
    const padding = 40;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;
    
    // Draw axes
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw bars
    const barWidth = chartWidth / values.length;
    ctx.fillStyle = '#667eea';
    
    values.forEach((value, index) => {
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + index * barWidth + barWidth * 0.1;
        const y = canvas.height - padding - barHeight;
        
        ctx.fillRect(x, y, barWidth * 0.8, barHeight);
        
        // Add value labels on top
        ctx.fillStyle = '#2d3748';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Rs ' + value.toFixed(0), x + barWidth * 0.4, y - 5);
        
        // Add month labels at bottom
        ctx.fillText(monthLabels[index], x + barWidth * 0.4, canvas.height - padding + 15);
        
        ctx.fillStyle = '#667eea';
    });
}
