// Prevent multiple injections
if (window.hasRun) {
    console.log('Content script already injected, skipping...');
    return;
}
window.hasRun = true;

// Function to extract amount from text
function extractAmount(text) {
    if (!text) return 0;
    const match = text.match(/Rs\s*([\d,]+(\.\d{1,2})?)/);
    return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
}

// Function to extract date from text
function extractDate(text) {
    if (!text) return null;
    const match = text.match(/(\d{1,2}\s+[A-Za-z]+\s+'\d{2}\s+\d{1,2}:\d{2}\s+[ap]m)/i);
    return match ? new Date(match[1].replace("'", "20")) : null;
}

// Function to extract transactions
function extractTransactions() {
    const transactions = [];
    const transactionElements = document.querySelectorAll('._2PmH5');

    transactionElements.forEach(element => {
        const description = element.querySelector('._1Jw44')?.textContent?.trim() || '';
        const status = element.querySelector('.vt2ni')?.textContent?.trim() || '';
        const priceElement = element.querySelector('._2Llef._2g75t.LwOpS');
        const price = priceElement ? priceElement.textContent.trim() : '';
        const orderInfo = element.querySelector('.UZK5K');
        const orderNumber = orderInfo?.querySelector('span:first-child')?.textContent?.trim() || '';
        const timestamp = orderInfo?.querySelector('span:last-child')?.textContent?.trim() || '';

        // Extract amount from price string
        const amount = extractAmount(price);
        const date = extractDate(timestamp);

        // Determine category based on description
        let category = 'Other';
        if (description.toLowerCase().includes('metro')) {
            category = 'Transport';
        } else if (description.toLowerCase().includes('dth') || description.toLowerCase().includes('bill payment')) {
            category = 'Bills';
        } else if (description.toLowerCase().includes('recharge')) {
            category = 'Recharge';
        }

        // Create transaction object
        const transaction = {
            description,
            status,
            amount,
            orderNumber,
            timestamp: date ? date.toISOString() : timestamp,
            category,
            source: 'Paytm'
        };

        if (status.toLowerCase().includes('success')) {
            transactions.push(transaction);
        }
    });

    // Send data to background script
    chrome.runtime.sendMessage({
        type: 'TRANSACTIONS_EXTRACTED',
        data: transactions
    });
}

// Function to analyze visible transactions
function analyzeVisibleTransactions() {
    const transactions = [];
    let totalAmount = 0;
    const categories = {};

    // Find all transaction rows
    const rows = document.querySelectorAll('._2PmH5');
    
    rows.forEach(row => {
        // Get transaction details
        const description = row.querySelector('._1Jw44')?.textContent?.trim() || '';
        const amount = row.querySelector('._2Llef._2g75t.LwOpS')?.textContent?.trim() || '';
        const status = row.querySelector('.vt2ni')?.textContent?.trim() || '';
        const date = row.querySelector('.UZK5K span:last-child')?.textContent?.trim() || '';

        // Only process successful transactions
        if (status.toLowerCase().includes('success')) {
            // Extract amount (remove 'Rs ' and commas)
            const amountValue = parseFloat(amount.replace('Rs ', '').replace(/,/g, '')) || 0;
            
            // Determine category
            let category = 'Other';
            const desc = description.toLowerCase();
            if (desc.includes('metro')) {
                category = 'Transport';
            } else if (desc.includes('dth') || desc.includes('bill payment')) {
                category = 'Bills';
            } else if (desc.includes('recharge')) {
                category = 'Recharge';
            }

            // Add to total
            totalAmount += amountValue;

            // Update category totals
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

            // Add to transactions array
            transactions.push({
                description,
                amount: amountValue,
                date,
                category
            });
        }
    });

    // Create analysis report
    const report = {
        totalTransactions: transactions.length,
        totalAmount: totalAmount,
        categories: categories,
        transactions: transactions
    };

    // Add report to the page
    displayReport(report);
}

// Function to display the report on the page
function displayReport(report) {
    // Create report container
    const container = document.createElement('div');
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

    // Create report content
    let html = `
        <h2 style="margin: 0 0 15px 0; color: #333;">Transaction Analysis</h2>
        <div style="margin-bottom: 15px;">
            <strong>Total Transactions:</strong> ${report.totalTransactions}<br>
            <strong>Total Amount:</strong> ₹${report.totalAmount.toFixed(2)}
        </div>
        <h3 style="margin: 0 0 10px 0; color: #444;">Category Breakdown</h3>
    `;

    // Add category details
    Object.entries(report.categories).forEach(([category, data]) => {
        const percentage = ((data.total / report.totalAmount) * 100).toFixed(1);
        html += `
            <div style="margin-bottom: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                <strong>${category}</strong><br>
                Total: ₹${data.total.toFixed(2)} (${percentage}%)<br>
                Transactions: ${data.count}
            </div>
        `;
    });

    // Add close button
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

    // Add close button functionality
    document.getElementById('closeReport').addEventListener('click', () => {
        container.remove();
    });
}

// Run when page is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        extractTransactions();
        analyzeVisibleTransactions();
    });
} else {
    extractTransactions();
    analyzeVisibleTransactions();
}

// Listen for dynamic content changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            extractTransactions();
            break;
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Add a button to trigger analysis
const analyzeButton = document.createElement('button');
analyzeButton.textContent = 'Analyze Transactions';
analyzeButton.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 10px 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    z-index: 9999;
`;
analyzeButton.addEventListener('click', analyzeVisibleTransactions);
document.body.appendChild(analyzeButton);
