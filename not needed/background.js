// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log("Paytm Expense Tracker Extension Installed!");
});

// Listen for navigation to Paytm pages
chrome.webNavigation.onCompleted.addListener(
    async function(details) {
        // Only handle main frame navigation
        if (details.frameId !== 0) return;
        
        try {
            // Inject jQuery first
            await chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                files: ['lib/jquery-3.6.0.min.js']
            });
            
            // Then inject our content script
            await chrome.scripting.executeScript({
                target: { tabId: details.tabId },
                files: ['content.js']
            });
            
            console.log('Scripts injected successfully');
        } catch (error) {
            console.error('Error injecting scripts:', error);
        }
    },
    {
        url: [
            { hostContains: 'paytm.com' }
        ]
    }
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transactionsUpdated") {
        console.log(`Received ${message.count} transactions`);
    }
    if (message.action === "analysisUpdated") {
        console.log('Received transaction analysis');
    }
    if (message.type === 'TRANSACTIONS_EXTRACTED') {
        // Store transactions in chrome storage
        chrome.storage.local.get(['transactions'], (result) => {
            const existingTransactions = result.transactions || [];
            
            // Filter out duplicates based on order number
            const newTransactions = message.data.filter(newTx => 
                !existingTransactions.some(existingTx => 
                    existingTx.orderNumber === newTx.orderNumber
                )
            );
            
            if (newTransactions.length > 0) {
                const updatedTransactions = [...existingTransactions, ...newTransactions];
                
                chrome.storage.local.set({
                    transactions: updatedTransactions
                }, () => {
                    console.log('Transactions updated:', newTransactions.length, 'new transactions added');
                    
                    // Update badge with total transaction count
                    chrome.action.setBadgeText({
                        text: updatedTransactions.length.toString()
                    });
                });
            }
        });
    }
});
