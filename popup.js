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

            rows.forEach(row => {
                const description = row.querySelector('._1Jw44')?.textContent?.trim() || '';
                const amount = row.querySelector('._2Llef._2g75t.LwOpS')?.textContent?.trim() || '';
                const status = row.querySelector('.vt2ni')?.textContent?.trim() || '';
                const date = row.querySelector('.UZK5K span:last-child')?.textContent?.trim() || '';

                if (status.toLowerCase().includes('success')) {
                    const amountValue = parseFloat(amount.replace('Rs ', '').replace(/,/g, '')) || 0;
                    
                    let category = 'Other';
                    const desc = description.toLowerCase();
                    if (desc.includes('metro')) {
                        category = 'Transport';
                    } else if (desc.includes('dth') || desc.includes('bill payment')) {
                        category = 'Bills';
                    } else if (desc.includes('recharge')) {
                        category = 'Recharge';
                    }

                    totalAmount += amountValue;

                    if (!categories[category]) {
                        categories[category] = {
                            total: 0,
                            count: 0
                        };
                    }
                    categories[category].total += amountValue;
                    categories[category].count += 1;

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

            // Create report container
            const container = document.createElement('div');
            container.id = 'paytm-analysis-report';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 400px;
                max-height: 80vh;
                overflow-y: auto;
                z-index: 9999;
                font-family: Arial, sans-serif;
            `;

            let html = `
                <h2 style="margin: 0 0 15px 0; color: #333;">Transaction Analysis</h2>
                <div style="margin-bottom: 15px;">
                    <strong>Total Transactions:</strong> ${transactions.length}<br>
                    <strong>Total Amount:</strong> ₹${totalAmount.toFixed(2)}
                </div>
                <h3 style="margin: 0 0 10px 0; color: #444;">Category Breakdown</h3>
            `;

            Object.entries(categories).forEach(([category, data]) => {
                const percentage = ((data.total / totalAmount) * 100).toFixed(1);
                html += `
                    <div style="margin-bottom: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                        <strong>${category}</strong><br>
                        Total: ₹${data.total.toFixed(2)} (${percentage}%)<br>
                        Transactions: ${data.count}
                    </div>
                `;
            });

            html += `
                <button id="closeReport" style="
                    margin-top: 10px;
                    padding: 8px 15px;
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                ">Close Report</button>
            `;

            container.innerHTML = html;
            document.body.appendChild(container);

            document.getElementById('closeReport').addEventListener('click', () => {
                container.remove();
            });
        }
    });
});

function displayAnalysis(transactions) {
    const analysis = analyzeTransactions(transactions);
    
    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
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

function createCategoryChart(categoryData) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const labels = Object.keys(categoryData);
    const data = labels.map(cat => categoryData[cat].total);
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function createMonthlyChart(monthData) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const sortedMonths = Object.keys(monthData).sort();
    const data = sortedMonths.map(month => monthData[month].total);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedMonths.map(month => {
                const [year, monthNum] = month.split('-');
                return new Date(year, monthNum - 1).toLocaleDateString('en-IN', {
                    month: 'short',
                    year: 'numeric'
                });
            }),
            datasets: [{
                label: 'Monthly Spending',
                data: data,
                borderColor: '#36A2EB',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => {
                            return new Intl.NumberFormat('en-IN', {
                                style: 'currency',
                                currency: 'INR',
                                maximumSignificantDigits: 3
                            }).format(value);
                        }
                    }
                }
            }
        }
    });
}

// Helper function to analyze transactions (same as in content.js)
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
