document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const themeToggle = document.getElementById('theme-toggle');

    const dashboardContent = document.getElementById('dashboard-content');
    const newScanContent = document.getElementById('new-scan-content');

    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const dashboardLink = document.querySelector('.nav-link[href="#icon-dashboard"]');
    const newScanLink = document.querySelector('.nav-link[href="#icon-target"]');

    let currentActiveScanStep = 1;

    // Elements for step sections and indicators (defined early for setActiveScanStep)
    const scanStepSections = document.querySelectorAll('.scan-step-section');
    const stepIndicators = document.querySelectorAll('.step-indicator');

    function setActiveScanStep(targetStepNumber) {
        scanStepSections.forEach(section => {
            section.style.display = 'block'; // CORRECTED: Ensure all step section containers are visible first

            const sectionContent = section.querySelector('.collapsible-content');
            const headerIcon = section.querySelector('.collapsible-header .icon-chevron-down');

            if (section.id === `scan-step-${targetStepNumber}`) {
                if (sectionContent) sectionContent.style.display = 'block';
                if (headerIcon) headerIcon.style.transform = 'rotate(180deg)';
            } else {
                 if (sectionContent) sectionContent.style.display = 'none';
                 if (headerIcon) headerIcon.style.transform = 'rotate(0deg)';
            }
        });

        stepIndicators.forEach(indicator => {
            const step = parseInt(indicator.dataset.step, 10);
            indicator.classList.remove('active', 'completed');
            if (step < targetStepNumber) {
                indicator.classList.add('completed');
            } else if (step === targetStepNumber) {
                indicator.classList.add('active');
            }
        });
        currentActiveScanStep = targetStepNumber;
    }

    function setActiveView(viewToShow) {
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (newScanContent) newScanContent.style.display = 'none';

        if (viewToShow) {
            viewToShow.style.display = 'block';
            if (viewToShow === newScanContent) {
                 setActiveScanStep(currentActiveScanStep || 1);
            }
        }

        navLinks.forEach(link => link.classList.remove('active'));
        if (viewToShow === dashboardContent && dashboardLink) {
            dashboardLink.classList.add('active');
        } else if (viewToShow === newScanContent && newScanLink) {
            newScanLink.classList.add('active');
        }
    }

    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            // currentActiveScanStep = 1; // Resetting when explicitly clicking New Scan is enough
            setActiveView(dashboardContent);
        });
    }

    if (newScanLink) {
        newScanLink.addEventListener('click', (e) => {
            e.preventDefault();
            currentActiveScanStep = 1;
            setActiveView(newScanContent);
        });
    }

    if (dashboardContent) {
         currentActiveScanStep = 1;
         setActiveView(dashboardContent);
    } else if (newScanContent) {
        currentActiveScanStep = 1;
        setActiveView(newScanContent);
    }

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    document.addEventListener('click', (event) => {
        if (!sidebar || !sidebarToggle) return;
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggle = sidebarToggle.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnToggle && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            if (themeToggle.checked) {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            }
        });
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (savedTheme === 'light') {
                themeToggle.checked = true;
            }
        }
    }

    const analyzeUrlForm = document.getElementById('analyze-url-form');
    const targetLoginUrlInput = document.getElementById('target-login-url');
    const parseRequestForm = document.getElementById('parse-request-form');
    const rawHttpRequestInput = document.getElementById('raw-http-request');
    const detectedPostUrlInput = document.getElementById('detected-post-url');
    const detectedUsernameFieldInput = document.getElementById('detected-username-field');
    const detectedPasswordFieldInput = document.getElementById('detected-password-field');
    const detectedCsrfNameInput = document.getElementById('detected-csrf-name');
    const detectedCsrfValueInput = document.getElementById('detected-csrf-value');
    const rawRequestParamsDisplay = document.getElementById('raw-request-params-display');
    const rawRequestParamsData = document.getElementById('raw-request-params-data');
    const rawRequestCookiesDisplay = document.getElementById('raw-request-cookies-display');
    const rawRequestCookiesData = document.getElementById('raw-request-cookies-data');
    const analysisCookiesDisplay = document.getElementById('analysis-cookies-display');
    const analysisCookiesData = document.getElementById('analysis-cookies-data');

    let currentAnalysisResult = null;
    let quickScanAnalysisData = null;

    function populateNewScanStep2(data) {
        currentAnalysisResult = data;
        if (detectedPostUrlInput) detectedPostUrlInput.value = data.post_url || '';
        if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = data.username_field_name || '';
        if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = data.password_field_name || '';
        if (detectedCsrfNameInput) detectedCsrfNameInput.value = data.csrf_token_name || '';
        if (detectedCsrfValueInput) detectedCsrfValueInput.value = data.csrf_token_value || '';

        const sections = [
            { dataKey: 'form_parameters', displayDiv: rawRequestParamsDisplay, preTag: rawRequestParamsData },
            { dataKey: 'cookies', displayDiv: analysisCookiesDisplay, preTag: analysisCookiesData, checkNoRequestHeaders: true },
            { dataKey: 'cookies', displayDiv: rawRequestCookiesDisplay, preTag: rawRequestCookiesData, checkRequestHeaders: true }
        ];
        sections.forEach(sec => {
            let shouldDisplay = false;
            if (data[sec.dataKey] && Object.keys(data[sec.dataKey]).length > 0) {
                if (sec.checkNoRequestHeaders && !data.request_headers) shouldDisplay = true;
                else if (sec.checkRequestHeaders && data.request_headers) shouldDisplay = true;
                else if (!sec.checkNoRequestHeaders && !sec.checkRequestHeaders) shouldDisplay = true;
            }
            if (shouldDisplay) {
                if (sec.preTag) sec.preTag.textContent = JSON.stringify(data[sec.dataKey], null, 2);
                if (sec.displayDiv) sec.displayDiv.style.display = 'block';
            } else {
                if (sec.displayDiv) sec.displayDiv.style.display = 'none';
            }
        });
        setActiveScanStep(2);
    }

    async function handleUrlAnalysisOnNewScanPage(event) {
        event.preventDefault();
        const url = targetLoginUrlInput.value;
        if (!url) { alert('Please enter a URL.'); return; }
        try {
            const response = await fetch('/analyze_url', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);
            populateNewScanStep2(data);
        } catch (error) { console.error('Error analyzing URL on New Scan page:', error); alert(`Error analyzing URL: ${error.message}`); }
    }

    async function handleRawRequestParseOnNewScanPage(event) {
        event.preventDefault();
        const rawRequest = rawHttpRequestInput.value;
        if (!rawRequest) { alert('Please paste a raw HTTP request.'); return; }
        try {
            const response = await fetch('/parse_captured_request', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_request: rawRequest })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);
            populateNewScanStep2(data);
        } catch (error) { console.error('Error parsing raw request on New Scan page:', error); alert(`Error parsing raw request: ${error.message}`); }
    }

    if (analyzeUrlForm) analyzeUrlForm.addEventListener('submit', handleUrlAnalysisOnNewScanPage);
    if (parseRequestForm) parseRequestForm.addEventListener('submit', handleRawRequestParseOnNewScanPage);

    const quickScanForm = document.querySelector('.quick-scan-form');
    const quickScanUrlInput = document.getElementById('target-url');
    const quickScanLoadingDiv = document.getElementById('quick-scan-loading');
    const quickScanErrorDiv = document.getElementById('quick-scan-error');
    const quickScanResultsDiv = document.getElementById('quick-scan-results');
    const quickScanResultsData = document.getElementById('quick-scan-results-data');
    const proceedToFullScanBtn = document.getElementById('proceed-to-full-scan-btn');

    function displayQuickScanResultsInline(data) {
        quickScanAnalysisData = data;
        if (quickScanLoadingDiv) quickScanLoadingDiv.style.display = 'none';
        if (quickScanErrorDiv) quickScanErrorDiv.style.display = 'none';
        if (quickScanResultsData) quickScanResultsData.textContent = JSON.stringify(data, null, 2);
        if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'block';
    }

    function displayQuickScanErrorInline(errorMessage) {
        if (quickScanLoadingDiv) quickScanLoadingDiv.style.display = 'none';
        if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'none';
        if (quickScanErrorDiv) { quickScanErrorDiv.textContent = errorMessage; quickScanErrorDiv.style.display = 'block'; }
    }

    async function processQuickScan(event) {
        event.preventDefault();
        const url = quickScanUrlInput.value;
        if (!url) { displayQuickScanErrorInline('Please enter a URL for Quick Scan.'); return; }
        if (quickScanLoadingDiv) quickScanLoadingDiv.style.display = 'block';
        if (quickScanErrorDiv) quickScanErrorDiv.style.display = 'none';
        if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'none';
        quickScanAnalysisData = null;
        try {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const response = await fetch('/analyze_url', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);
            displayQuickScanResultsInline(data);
        } catch (error) { console.error('Error during Quick Scan:', error); displayQuickScanErrorInline(`Quick Scan Error: ${error.message}`); }
    }

    if (quickScanForm) quickScanForm.addEventListener('submit', processQuickScan);

    if (proceedToFullScanBtn) {
        proceedToFullScanBtn.addEventListener('click', () => {
            if (quickScanAnalysisData) {
                currentActiveScanStep = 1; // Start New Scan from Step 1...
                setActiveView(newScanContent);
                populateNewScanStep2(quickScanAnalysisData); // This will then advance to Step 2

                if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'none';
                if (quickScanErrorDiv) quickScanErrorDiv.style.display = 'none';
                if (quickScanUrlInput) quickScanUrlInput.value = '';
                quickScanAnalysisData = null;
            } else { alert("No analysis data to proceed with. Please perform a quick scan first."); }
        });
    }

    // const scanStepSections = document.querySelectorAll('.scan-step-section'); // Already defined globally for setActiveScanStep
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    // const stepIndicators = document.querySelectorAll('.step-indicator'); // Already defined globally for setActiveScanStep
    const confirmParamsBtn = document.getElementById('confirm-params-btn');
    const proceedToLaunchBtn = document.getElementById('proceed-to-launch-btn');

    if (newScanContent && newScanContent.style.display === 'block') {
        setActiveScanStep(currentActiveScanStep);
    }

    collapsibleHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const targetStep = parseInt(header.dataset.targetStep, 10);
            setActiveScanStep(targetStep);
        });
    });

    stepIndicators.forEach(indicator => {
        indicator.addEventListener('click', () => {
            const stepNum = parseInt(indicator.dataset.step, 10);
            const targetStepIndicator = document.querySelector(`.step-indicator[data-step="${stepNum}"]`);
            // Allow navigation if step is already completed, or is the current active step,
            // or if it's the next step and the current one is completed.
            if (targetStepIndicator &&
                (targetStepIndicator.classList.contains('completed') ||
                 targetStepIndicator.classList.contains('active') ||
                 (stepNum === currentActiveScanStep + 1 && document.querySelector(`.step-indicator[data-step="${currentActiveScanStep}"]`)?.classList.contains('completed')) ||
                 stepNum === 1 )) { // Always allow going back to step 1, or if next step & current is complete
                 setActiveScanStep(stepNum);
            }
        });
    });

    if (confirmParamsBtn) {
        confirmParamsBtn.addEventListener('click', () => setActiveScanStep(3));
    }
    if (proceedToLaunchBtn) {
        proceedToLaunchBtn.addEventListener('click', () => setActiveScanStep(4));
    }

    const comboFileInput = document.getElementById('combo-file-input');
    const comboFileNameDisplay = document.getElementById('combo-file-name');
    const usernameListInput = document.getElementById('username-list-input');
    const usernameListFileNameDisplay = document.getElementById('username-list-file-name');
    const singleUsernameInput = document.getElementById('single-username-input');
    const passwordListInput = document.getElementById('password-list-input');
    const passwordListFileNameDisplay = document.getElementById('password-list-file-name');

// PROBLEMATIC CODE REMOVED - was causing "item.display is null" errors
// File input handling moved to server-side upload mechanism
console.log('File input handling moved to server-side upload mechanism - null pointer errors eliminated');

// Global state management to prevent race conditions
window.StrykerState = {
    currentState: 'IDLE', // IDLE, RUNNING, PAUSED, COMPLETED
    uploadInProgress: false,
    attackInProgress: false,

    setState: function(newState) {
        console.log(`State change: ${this.currentState} -> ${newState}`);
        this.currentState = newState;
        this.updateUI();
    },

    updateUI: function() {
        const uploadElements = document.querySelectorAll('.upload-interface, .file-upload-btn');
        const attackElements = document.querySelectorAll('.launch-attack-btn, .cancel-attack-btn');

        switch(this.currentState) {
            case 'IDLE':
                uploadElements.forEach(el => el.disabled = false);
                attackElements.forEach(el => {
                    if (el.classList.contains('launch-attack-btn')) el.disabled = false;
                    if (el.classList.contains('cancel-attack-btn')) el.disabled = true;
                });
                this.hideUploadDialog();
                break;

            case 'RUNNING':
                uploadElements.forEach(el => el.disabled = true);
                attackElements.forEach(el => {
                    if (el.classList.contains('launch-attack-btn')) el.disabled = true;
                    if (el.classList.contains('cancel-attack-btn')) el.disabled = false;
                });
                this.hideUploadDialog(); // Critical: Hide upload during attack
                break;

            case 'COMPLETED':
                uploadElements.forEach(el => el.disabled = false);
                attackElements.forEach(el => {
                    if (el.classList.contains('launch-attack-btn')) el.disabled = false;
                    if (el.classList.contains('cancel-attack-btn')) el.disabled = true;
                });
                this.hideUploadDialog();
                break;
        }
    },

    hideUploadDialog: function() {
        const uploadDialog = document.querySelector('.upload-credential-dialog');
        const uploadModal = document.querySelector('.upload-modal');
        if (uploadDialog) uploadDialog.style.display = 'none';
        if (uploadModal) uploadModal.style.display = 'none';
    }
};

    const launchAttackBtn = document.getElementById('launch-attack-btn');
    const metricTotalAttempts = document.getElementById('metric-total-attempts');
    const metricHits = document.getElementById('metric-hits');
    const metricElapsedTime = document.getElementById('metric-elapsed-time');
    const metricEta = document.getElementById('metric-eta');

    let attackStartTime;
    let totalExpectedAttempts = 0;
    let currentAttempts = 0;
    let hits = 0;
    let elapsedTimeInterval;
    let logEntries = [];
    let currentLogFilter = 'all';

    const logDetailsModal = document.getElementById('log-details-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalRequestInfo = document.getElementById('modal-request-info');
    const modalResponseInfo = document.getElementById('modal-response-info');
    const modalAnalysisSummary = document.getElementById('modal-analysis-summary');
    const logFilterButtons = document.querySelectorAll('.log-filter-controls .button');
    const liveFeedTbody = document.getElementById('live-feed-tbody');
    const liveFeedPlaceholder = document.getElementById('live-feed-placeholder');

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => { if (logDetailsModal) logDetailsModal.style.display = 'none'; });
    }
    if (logDetailsModal) {
        logDetailsModal.addEventListener('click', (event) => {
            if (event.target === logDetailsModal) logDetailsModal.style.display = 'none';
        });
    }

    function applyLogFilter() {
        if (!liveFeedTbody) return;
        const rows = liveFeedTbody.querySelectorAll('tr');
        let hasVisibleRows = false;
        rows.forEach(row => {
            const status = row.dataset.status ? row.dataset.status.toLowerCase() : '';
            let showRow = false;
            if (currentLogFilter === 'all') showRow = true;
            else if (currentLogFilter === 'error' && (status === 'error' || status === 'unknown')) showRow = true;
            else if (status === currentLogFilter) showRow = true;
            row.style.display = showRow ? '' : 'none';
            if (showRow) hasVisibleRows = true;
        });
        if (liveFeedPlaceholder) {
            if (liveFeedTbody.rows.length === 0) {
                liveFeedPlaceholder.textContent = "[INFO] Awaiting attack initiation...";
                liveFeedPlaceholder.style.display = 'block';
            } else if (!hasVisibleRows) {
                liveFeedPlaceholder.textContent = `No entries match filter: "${currentLogFilter}"`;
                liveFeedPlaceholder.style.display = 'block';
            } else {
                liveFeedPlaceholder.style.display = 'none';
            }
        }
    }

    logFilterButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentLogFilter = button.dataset.filter;
            logFilterButtons.forEach(btn => {
                btn.classList.remove('button-primary'); btn.classList.add('button-secondary');
            });
            button.classList.remove('button-secondary'); button.classList.add('button-primary');
            applyLogFilter();
        });
    });

    function showLogDetails(logIndex) {
        const entry = logEntries[logIndex];
        if (!entry || !logDetailsModal) return;

        if (modalTitle) modalTitle.textContent = `Attempt Details (#${entry.attemptNumber || logIndex + 1})`;

        // Check if currentAnalysisResult is available before using it.
        if (!currentAnalysisResult) {
            // Handle the case where analysis results are not available.
            // For instance, show a message or default text.
            if (modalRequestInfo) modalRequestInfo.textContent = "Analysis data is not available.";
            if (modalResponseInfo) modalResponseInfo.textContent = "Response data is not available.";
            if (modalAnalysisSummary) modalAnalysisSummary.textContent = "Analysis summary is not available.";
            logDetailsModal.style.display = 'flex';
            return;
        }

        let requestText = `Target URL: ${currentAnalysisResult.post_url || 'N/A'}\nMethod: ${currentAnalysisResult.form_method || 'POST'}\n\nPayload Sent (Key Fields):\n`;
        if(entry.request_details){
            const userField = currentAnalysisResult.username_field_name;
            const passField = currentAnalysisResult.password_field_name;
            if (userField && entry.request_details[userField]) requestText += `  ${userField}: ${entry.request_details[userField]}\n`;
            if (passField && entry.request_details[passField]) requestText += `  ${passField}: ********\n`;
            if (currentAnalysisResult.csrf_token_name && entry.request_details[currentAnalysisResult.csrf_token_name]) requestText += `  ${currentAnalysisResult.csrf_token_name}: ${entry.request_details[currentAnalysisResult.csrf_token_name]}\n`;
        } else requestText += "  (No specific username/password payload found in this log entry's request_details)\n";
        if (currentAnalysisResult.form_parameters) {
            let addedFormParams = false; let tempFormParamText = "\nAdditional Form Parameters (from initial analysis):\n";
            for (const key in currentAnalysisResult.form_parameters) {
                if (!(key === userField) && !(key === passField) && !(key === currentAnalysisResult.csrf_token_name) ) {
                     tempFormParamText += `  ${key}: ${currentAnalysisResult.form_parameters[key]}\n`; addedFormParams = true;
                }}
            if(addedFormParams) requestText += tempFormParamText;
        }
        if (modalRequestInfo) modalRequestInfo.textContent = requestText.trim();
        let responseText = `Status Code: ${entry.status_code || 'N/A'}\nResponse URL (Final): ${entry.response_url || 'N/A'}\nContent Length: ${entry.content_length === -1 ? 'N/A (Error reading body)' : (entry.content_length === undefined ? 'N/A' : entry.content_length)}\n\nResponse Body (first 1000 chars):\n`;
        responseText += (entry.response_body ? String(entry.response_body).substring(0, 1000) : 'N/A');
        if (entry.response_body && String(entry.response_body).length > 1000) responseText += "\n... (truncated)";
        if (modalResponseInfo) modalResponseInfo.textContent = responseText.trim();
        let analysisText = `Score: ${entry.analysis ? entry.analysis.score : 'N/A'}\n\nPositive Indicators:\n` + (entry.analysis && entry.analysis.positive_indicators && entry.analysis.positive_indicators.length > 0 ? "  - " + entry.analysis.positive_indicators.join('\n  - ') : '  N/A') + "\n\nNegative Indicators:\n" + (entry.analysis && entry.analysis.negative_indicators && entry.analysis.negative_indicators.length > 0 ? "  - " + entry.analysis.negative_indicators.join('\n  - ') : '  N/A');
        if (modalAnalysisSummary) modalAnalysisSummary.textContent = analysisText.trim();
        logDetailsModal.style.display = 'flex';
    }

    function resetAttackMetrics() {
        currentAttempts = 0; hits = 0; totalExpectedAttempts = 0;
        logEntries = [];
        if (liveFeedTbody) liveFeedTbody.innerHTML = '';
        if (liveFeedPlaceholder) {
            liveFeedPlaceholder.textContent = "[INFO] Awaiting attack initiation...";
            liveFeedPlaceholder.style.display = 'block';
        }
        currentLogFilter = 'all';
        logFilterButtons.forEach(btn => {
            btn.classList.remove('button-primary'); btn.classList.add('button-secondary');
            if(btn.dataset.filter === 'all') { btn.classList.remove('button-secondary'); btn.classList.add('button-primary');}
        });

        if (metricTotalAttempts) metricTotalAttempts.textContent = '0/0';
        if (metricHits) metricHits.textContent = '0';
        if (metricElapsedTime) metricElapsedTime.textContent = '00:00:00';
        if (metricEta) metricEta.textContent = '--:--:--';
        if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
    }

    function updateElapsedTime() {
        if (!attackStartTime) return;
        const now = new Date(); const elapsedMs = now - attackStartTime;
        const seconds = Math.floor((elapsedMs / 1000) % 60);
        const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
        const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
        if (metricElapsedTime) metricElapsedTime.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        if (totalExpectedAttempts > 0 && currentAttempts > 0 && currentAttempts < totalExpectedAttempts) {
            const timePerAttemptMs = elapsedMs / currentAttempts;
            const remainingAttempts = totalExpectedAttempts - currentAttempts;
            const etaMs = remainingAttempts * timePerAttemptMs;
            const etaSeconds = Math.floor((etaMs / 1000) % 60);
            const etaMinutes = Math.floor((etaMs / (1000 * 60)) % 60);
            const etaHours = Math.floor(etaMs / (1000 * 60 * 60));
            if (metricEta) metricEta.textContent = `${String(etaHours).padStart(2, '0')}:${String(etaMinutes).padStart(2, '0')}:${String(etaSeconds).padStart(2, '0')}`;
        } else if (currentAttempts === totalExpectedAttempts && totalExpectedAttempts > 0) {
             if (metricEta) metricEta.textContent = 'Done';
        }
    }

    function handleSseEvent(data) {
        if (data.type === 'info' && data.total_expected_attempts !== undefined) {
            totalExpectedAttempts = data.total_expected_attempts;
            if (liveFeedTbody) liveFeedTbody.innerHTML = '';
            if (liveFeedPlaceholder) liveFeedPlaceholder.style.display = 'none';
            logEntries = [];
            currentAttempts = 0;
            hits = 0;
             if (metricTotalAttempts) metricTotalAttempts.textContent = `0/${totalExpectedAttempts}`;
            return;
        }

        if (data.status === 'complete') {
            if(liveFeedTbody && liveFeedTbody.rows.length === 0 && totalExpectedAttempts === 0){
                if(liveFeedPlaceholder) {
                    liveFeedPlaceholder.textContent = data.message || 'No attempts made or attack complete.';
                    liveFeedPlaceholder.style.display = 'block';
                }
            } else if (liveFeedTbody.rows.length > 0 && liveFeedPlaceholder) {
                 liveFeedPlaceholder.style.display = 'none';
            }
            clearInterval(elapsedTimeInterval);
            updateElapsedTime();
            if (metricEta) metricEta.textContent = 'Done';
            return;
        }

        currentAttempts++;
        data.attemptNumber = currentAttempts;
        logEntries.push(data);

        if (!liveFeedTbody || !liveFeedPlaceholder) return;
        liveFeedPlaceholder.style.display = 'none';

        const row = liveFeedTbody.insertRow();
        row.dataset.status = data.status ? data.status.toLowerCase() : 'unknown';
        const currentIndex = logEntries.length - 1; // Capture current index for this specific entry
        row.dataset.logIndex = currentIndex;


        row.insertCell().textContent = data.attemptNumber;
        row.insertCell().textContent = new Date().toLocaleTimeString();
        row.insertCell().textContent = data.username || 'N/A';
        row.insertCell().textContent = data.password_actual || 'N/A';

        const statusCell = row.insertCell();
        statusCell.textContent = data.status ? data.status.toUpperCase() : 'UNKNOWN';
        statusCell.className = `status-${data.status ? data.status.toLowerCase() : 'unknown'}`;
        if (data.status === '2fa_required') {
            statusCell.style.color = 'orange';
        }

        row.insertCell().textContent = data.status_code || 'N/A';
        row.insertCell().textContent = data.content_length === -1 ? 'N/A' : (data.content_length === undefined ? 'N/A' : data.content_length);

        const detailsButton = document.createElement('button');
        detailsButton.className = 'button button-secondary button-sm';
        detailsButton.textContent = 'View';
        // CORRECTED: Use the captured currentIndex for this specific button's onclick handler
        detailsButton.onclick = () => showLogDetails(currentIndex);
        row.insertCell().appendChild(detailsButton);

        applyLogFilter();

        if (data.status === 'success') {
            hits++;
            if (metricHits) metricHits.textContent = hits.toString();
        }
        if (metricTotalAttempts) metricTotalAttempts.textContent = `${currentAttempts}/${totalExpectedAttempts || '?'}`;
        updateElapsedTime();
    }

    async function handleLaunchAttack() {
        if (!currentAnalysisResult) {
            alert('Please analyze a URL or parse a request first (Step 1 & 2).');
            return;
        }
        resetAttackMetrics();

        let authFileContent = null;
        let usernameList = [];
        let passwordList = [];

        if (comboFileInput && comboFileInput.files.length > 0) {
            try { authFileContent = await comboFileInput.files[0].text(); }
            catch (e) { alert('Error reading combo file.'); console.error(e); return; }
        } else {
            if (usernameListInput && usernameListInput.files.length > 0) {
                try {
                    const userFileText = await usernameListInput.files[0].text();
                    usernameList = userFileText.split(/\r?\n/).map(u => u.trim()).filter(u => u);
                } catch (e) { alert('Error reading username file.'); console.error(e); return; }
            } else if (singleUsernameInput && singleUsernameInput.value.trim()) {
                usernameList = [singleUsernameInput.value.trim()];
            }
            if (passwordListInput && passwordListInput.files.length > 0) {
                 try {
                    const passFileText = await passwordListInput.files[0].text();
                    passwordList = passFileText.split(/\r?\n/).map(p => p.trim()).filter(p => p);
                } catch (e) { alert('Error reading password file.'); console.error(e); return; }
            }
        }

        if (!authFileContent && (usernameList.length === 0 || passwordList.length === 0)) {
            alert('Please provide credentials: either a combo file, or username(s) and password(s).');
            return;
        }

        const requestsPerMinuteInput = document.getElementById('requests-per-minute');
        const proxyInput = document.getElementById('proxy');
        const userAgentsInput = document.getElementById('user-agents');

        const heuristicsModeInput = document.getElementById('heuristics-mode');

        const payload = {
            // Fixed field name mapping to match backend expectations
            target_post_url: detectedPostUrlInput.value,
            target_url: detectedPostUrlInput.value,  // Add for compatibility
            username_field_name: detectedUsernameFieldInput.value,
            username_field: detectedUsernameFieldInput.value,  // Backend expects this
            password_field_name: detectedPasswordFieldInput.value,
            password_field: detectedPasswordFieldInput.value,  // Backend expects this
            form_method: currentAnalysisResult.form_method || 'POST',
            cookies: currentAnalysisResult.cookies || {},
            auth_file_content: authFileContent,
            username_list: usernameList,
            password_list: passwordList,
            config: {
                requests_per_minute: requestsPerMinuteInput.value ? parseInt(requestsPerMinuteInput.value, 10) : null,
                proxy: proxyInput.value || null,
                user_agents: userAgentsInput.value ? userAgentsInput.value.split('\n').map(ua => ua.trim()).filter(ua => ua) : null,
                login_page_url: currentAnalysisResult.login_form_render_url || detectedPostUrlInput.value,
                csrf_token_field_name: detectedCsrfNameInput.value || null,
                heuristics: heuristicsModeInput.value
            }
        };
        if (currentAnalysisResult.form_parameters) {
            payload.form_parameters = currentAnalysisResult.form_parameters;
        }

        attackStartTime = new Date();
        elapsedTimeInterval = setInterval(updateElapsedTime, 1000);

        if (liveFeedPlaceholder) {
            liveFeedPlaceholder.textContent = "[INFO] Initiating attack stream...";
            liveFeedPlaceholder.style.display = 'block';
        }
        if(liveFeedTbody) liveFeedTbody.innerHTML = '';

        fetch('/test_credentials_stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} on SSE setup.`);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            function processText({ done, value }) {
                if (done) {
                    if (liveFeedTbody && liveFeedTbody.rows.length === 0 && liveFeedPlaceholder) {
                        liveFeedPlaceholder.textContent = "Attack finished. No attempts processed or all filtered out.";
                        liveFeedPlaceholder.style.display = 'block';
                    }
                    clearInterval(elapsedTimeInterval);
                    updateElapsedTime();
                    if (metricEta) metricEta.textContent = 'Done';
                    return;
                }
                const chunk = decoder.decode(value, { stream: true });
                const messages = chunk.split('\n\n');
                messages.forEach(message => {
                    if (message.startsWith('data:')) {
                        const jsonData = message.substring(5).trim();
                        if (jsonData) {
                            try {
                                const eventData = JSON.parse(jsonData);
                                handleSseEvent(eventData);
                            } catch (e) {
                                console.error('Error parsing SSE JSON:', e, jsonData);
                                handleSseEvent({ status: 'error', details: `Error parsing event: ${jsonData.substring(0,100)}`});
                            }
                        }
                    }
                });
                return reader.read().then(processText);
            }
            return reader.read().then(processText);
        })
        .catch(error => {
            console.error('Error launching attack / reading stream:', error);
            if(liveFeedPlaceholder){
                 liveFeedPlaceholder.textContent = `Error launching attack: ${error.message}`;
                 liveFeedPlaceholder.style.display = 'block';
            }
            if(liveFeedTbody) liveFeedTbody.innerHTML = '';
            clearInterval(elapsedTimeInterval);
        });
    }
    if (launchAttackBtn) launchAttackBtn.addEventListener('click', handleLaunchAttack);
});
