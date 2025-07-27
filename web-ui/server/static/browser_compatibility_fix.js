// Browser Compatibility and Security Fixes for Stryker Tool

// 1. Disable SES (Secure EcmaScript) interference
if (typeof lockdown !== 'undefined') {
    console.log('SES detected, applying compatibility fixes...');
    // Override problematic SES configurations
    try {
        lockdown({
            dateTaming: 'unsafe',
            mathTaming: 'unsafe',
            errorTaming: 'unsafe',
            stackFiltering: 'verbose'
        });
    } catch (e) {
        console.warn('Could not configure SES:', e);
    }
}

// 2. Enhanced error handling for network requests
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    if (event.reason && event.reason.message && event.reason.message.includes('NetworkError')) {
        console.log('Network error detected, this may be due to browser security settings');
        console.log('Recommendations:');
        console.log('1. Disable Enhanced Tracking Protection for this site');
        console.log('2. Allow third-party requests for this domain');
        console.log('3. Check browser extensions that might block requests');
    }
});

// 3. CORS preflight handling
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const [url, options = {}] = args;

    // Add CORS headers for all requests
    const enhancedOptions = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            ...options.headers
        },
        mode: 'cors',
        credentials: 'same-origin'
    };

    return originalFetch(url, enhancedOptions)
        .catch(error => {
            if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
                console.error('Network/CORS error detected:', error);
                console.log('This may be caused by browser security settings');
                throw new Error(`Network request failed. This may be due to browser security settings blocking the request. Original error: ${error.message}`);
            }
            throw error;
        });
};

// 4. Enhanced DOM safety checks
function safeElementAccess(elementId, callback) {
    const element = document.getElementById(elementId);
    if (element && callback) {
        try {
            callback(element);
        } catch (error) {
            console.error(`Error accessing element ${elementId}:`, error);
        }
    }
}

// 5. Browser compatibility detection
function detectBrowserIssues() {
    const issues = [];

    // Check for Enhanced Tracking Protection
    if (navigator.userAgent.includes('Firefox')) {
        issues.push('Firefox Enhanced Tracking Protection may block requests');
    }

    // Check for SES
    if (typeof lockdown !== 'undefined') {
        issues.push('SES (Secure EcmaScript) extension detected');
    }

    // Check for ad blockers
    const testElement = document.createElement('div');
    testElement.innerHTML = '&nbsp;';
    testElement.className = 'adsbox';
    document.body.appendChild(testElement);
    setTimeout(() => {
        if (testElement.offsetHeight === 0) {
            issues.push('Ad blocker may be interfering with requests');
        }
        document.body.removeChild(testElement);
    }, 100);

    if (issues.length > 0) {
        console.warn('Potential browser compatibility issues detected:', issues);
    }

    return issues;
}

// 6. Initialize compatibility fixes
document.addEventListener('DOMContentLoaded', function() {
    console.log('Applying browser compatibility fixes...');
    detectBrowserIssues();

    // Add visual indicator for browser issues
    const issues = detectBrowserIssues();
    if (issues.length > 0) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff9800;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
            font-size: 12px;
        `;
        warningDiv.innerHTML = `
            <strong>Browser Compatibility Notice:</strong><br>
            ${issues.join('<br>')}
            <br><small>Click to dismiss</small>
        `;
        warningDiv.onclick = () => warningDiv.remove();
        document.body.appendChild(warningDiv);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.remove();
            }
        }, 10000);
    }
});

console.log('Browser compatibility fixes loaded');
