document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const themeToggle = document.getElementById('theme-toggle');

    const dashboardContent = document.getElementById('dashboard-content');
    const newScanContent = document.getElementById('new-scan-content');

    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const dashboardLink = document.querySelector('.nav-link[href="#icon-dashboard"]'); // Assuming href points to icon id
    const newScanLink = document.querySelector('.nav-link[href="#icon-target"]');


    function setActiveView(viewToShow) {
        // Hide all views
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (newScanContent) newScanContent.style.display = 'none';

        // Show the selected view
        if (viewToShow) viewToShow.style.display = 'block';

        // Update active class on nav links
        navLinks.forEach(link => link.classList.remove('active'));
        if (viewToShow === dashboardContent && dashboardLink) {
            dashboardLink.classList.add('active');
        } else if (viewToShow === newScanContent && newScanLink) {
            newScanLink.classList.add('active');
            // If other sections like History, Settings are added, they'd need similar handling
        }
    }

    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveView(dashboardContent);
        });
    }

    if (newScanLink) {
        newScanLink.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveView(newScanContent);
        });
    }

    // Initialize with dashboard view
    if (dashboardContent) {
         setActiveView(dashboardContent);
    } else if (newScanContent) { // Fallback if dashboard isn't there for some reason
        setActiveView(newScanContent);
    }


    // --- SIDEBAR TOGGLE FOR MOBILE ---
    if (sidebarToggle && sidebar) { // Ensure elements exist
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // Close sidebar when clicking outside of it on mobile
    document.addEventListener('click', (event) => {
        if (!sidebar || !sidebarToggle) return; // Ensure elements exist

        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggle = sidebarToggle.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnToggle && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    // --- DARK/LIGHT MODE TOGGLE ---
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

        // Check for saved theme in localStorage and apply it
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            if (savedTheme === 'light') {
                themeToggle.checked = true;
            }
        }
    }

    // --- NEW SCAN PAGE LOGIC (and elements shared with Quick Scan) ---
    const analyzeUrlForm = document.getElementById('analyze-url-form'); // On New Scan Page
    const targetLoginUrlInput = document.getElementById('target-login-url'); // On New Scan Page
    const parseRequestForm = document.getElementById('parse-request-form');
    const rawHttpRequestInput = document.getElementById('raw-http-request');

    // Step 2 - Detected Parameters Form Fields
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


    // Store analysis results globally for Step 3 and for Quick Scan -> Full Scan transition
    let currentAnalysisResult = null;
    let quickScanAnalysisData = null; // To hold data from quick scan specifically

    // Populates the Step 2 ("Review & Configure") on the "New Scan" page
    function populateNewScanStep2(data) {
        currentAnalysisResult = data; // Also set this for the main scan workflow

        if (detectedPostUrlInput) detectedPostUrlInput.value = data.post_url || '';
        if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = data.username_field_name || '';
        if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = data.password_field_name || '';
        if (detectedCsrfNameInput) detectedCsrfNameInput.value = data.csrf_token_name || '';
        if (detectedCsrfValueInput) detectedCsrfValueInput.value = data.csrf_token_value || '';

        // Show/hide and populate sections for additional parameters and cookies
        const sections = [
            { dataKey: 'form_parameters', displayDiv: rawRequestParamsDisplay, preTag: rawRequestParamsData },
            { dataKey: 'cookies', displayDiv: analysisCookiesDisplay, preTag: analysisCookiesData, checkNoRequestHeaders: true }, // For URL Analysis cookies
            { dataKey: 'cookies', displayDiv: rawRequestCookiesDisplay, preTag: rawRequestCookiesData, checkRequestHeaders: true } // For Raw Request cookies
        ];

        sections.forEach(sec => {
            let shouldDisplay = false;
            if (data[sec.dataKey]) {
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

        const reviewSection = document.getElementById('review-parameters-section');
        if(reviewSection) reviewSection.style.display = 'block';
    }


    async function handleUrlAnalysisOnNewScanPage(event) { // For "New Scan" page's own analyze form
        event.preventDefault();
        const url = targetLoginUrlInput.value;
        if (!url) {
            alert('Please enter a URL.');
            return;
        }
        // Add a loading indicator here if desired (specific to New Scan page)
        try {
            const response = await fetch('/analyze_url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            populateNewScanStep2(data);
        } catch (error) {
            console.error('Error analyzing URL on New Scan page:', error);
            alert(`Error analyzing URL: ${error.message}`);
        }
    }

    async function handleRawRequestParseOnNewScanPage(event) { // For "New Scan" page's own raw request form
        event.preventDefault();
        const rawRequest = rawHttpRequestInput.value;
        if (!rawRequest) {
            alert('Please paste a raw HTTP request.');
            return;
        }
        // Add a loading indicator here if desired (specific to New Scan page)
        try {
            const response = await fetch('/parse_captured_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_request: rawRequest })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            populateNewScanStep2(data);
        } catch (error) {
            console.error('Error parsing raw request on New Scan page:', error);
            alert(`Error parsing raw request: ${error.message}`);
        }
    }

    if (analyzeUrlForm) analyzeUrlForm.addEventListener('submit', handleUrlAnalysisOnNewScanPage);
    if (parseRequestForm) parseRequestForm.addEventListener('submit', handleRawRequestParseOnNewScanPage);


    // --- QUICK SCAN CARD LOGIC (on Dashboard) ---
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

        if (quickScanErrorDiv) {
            quickScanErrorDiv.textContent = errorMessage;
            quickScanErrorDiv.style.display = 'block';
        }
    }

    async function processQuickScan(event) {
        event.preventDefault();
        const url = quickScanUrlInput.value;
        if (!url) {
            displayQuickScanErrorInline('Please enter a URL for Quick Scan.');
            return;
        }

        if (quickScanLoadingDiv) quickScanLoadingDiv.style.display = 'block';
        if (quickScanErrorDiv) quickScanErrorDiv.style.display = 'none';
        if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'none';
        quickScanAnalysisData = null;

        try {
            const response = await fetch('/analyze_url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            displayQuickScanResultsInline(data);
        } catch (error) {
            console.error('Error during Quick Scan:', error);
            displayQuickScanErrorInline(`Quick Scan Error: ${error.message}`);
        }
    }

    if (quickScanForm) {
        quickScanForm.addEventListener('submit', processQuickScan);
    }

    if (proceedToFullScanBtn) {
        proceedToFullScanBtn.addEventListener('click', () => {
            if (quickScanAnalysisData) {
                setActiveView(newScanContent);
                populateNewScanStep2(quickScanAnalysisData); // Populate Step 2 on "New Scan" page

                if (quickScanResultsDiv) quickScanResultsDiv.style.display = 'none';
                if (quickScanErrorDiv) quickScanErrorDiv.style.display = 'none';
                if (quickScanUrlInput) quickScanUrlInput.value = '';
                quickScanAnalysisData = null;
            } else {
                alert("No analysis data to proceed with. Please perform a quick scan first.");
            }
        });
    }

    // --- Step 3: Credentials (on New Scan Page) ---
    const comboFileInput = document.getElementById('combo-file-input');
    const comboFileNameDisplay = document.getElementById('combo-file-name');
    const usernameListInput = document.getElementById('username-list-input');
    const usernameListFileNameDisplay = document.getElementById('username-list-file-name');
    const singleUsernameInput = document.getElementById('single-username-input');
    const passwordListInput = document.getElementById('password-list-input');
    const passwordListFileNameDisplay = document.getElementById('password-list-file-name');

    // File input change listeners to display selected file names
    [
        { input: comboFileInput, display: comboFileNameDisplay },
        { input: usernameListInput, display: usernameListFileNameDisplay },
        { input: passwordListInput, display: passwordListFileNameDisplay }
    ].forEach(item => {
        if (item.input) {
            item.input.addEventListener('change', () => {
                if (item.input.files.length > 0) {
                    item.display.textContent = item.input.files[0].name;
                } else {
                    item.display.textContent = '';
                }
            });
        }
    });

    // --- Step 4: Launch & Monitor ---
    const launchAttackBtn = document.getElementById('launch-attack-btn');
    const liveFeedContainer = document.getElementById('live-feed-container');
    const metricTotalAttempts = document.getElementById('metric-total-attempts');
    const metricHits = document.getElementById('metric-hits');
    const metricElapsedTime = document.getElementById('metric-elapsed-time');
    const metricEta = document.getElementById('metric-eta');
    let eventSource = null;
    let attackStartTime;
    let totalExpectedAttempts = 0;
    let currentAttempts = 0;
    let hits = 0;

    function appendToLiveFeed(message, type = 'info') {
        if (!liveFeedContainer) return;
        const p = document.createElement('p');
        const typeSpan = document.createElement('span');
        typeSpan.className = `status-${type.toLowerCase()}`; // For potential styling
        typeSpan.textContent = `[${type.toUpperCase()}] `;
        p.appendChild(typeSpan);

        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        p.appendChild(messageSpan);

        liveFeedContainer.appendChild(p);
        liveFeedContainer.scrollTop = liveFeedContainer.scrollHeight; // Auto-scroll
    }

    function resetAttackMetrics() {
        currentAttempts = 0;
        hits = 0;
        totalExpectedAttempts = 0;
        if (metricTotalAttempts) metricTotalAttempts.textContent = '0';
        if (metricHits) metricHits.textContent = '0';
        if (metricElapsedTime) metricElapsedTime.textContent = '00:00:00';
        if (metricEta) metricEta.textContent = '--:--:--';
        if (liveFeedContainer) liveFeedContainer.innerHTML = '<p>[INFO] Awaiting attack initiation...</p>';
    }

    function updateElapsedTime() {
        if (!attackStartTime) return;
        const now = new Date();
        const elapsedMs = now - attackStartTime;
        const seconds = Math.floor((elapsedMs / 1000) % 60);
        const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
        const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
        if (metricElapsedTime) {
            metricElapsedTime.textContent =
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        if (totalExpectedAttempts > 0 && currentAttempts > 0 && currentAttempts < totalExpectedAttempts) {
            const timePerAttemptMs = elapsedMs / currentAttempts;
            const remainingAttempts = totalExpectedAttempts - currentAttempts;
            const etaMs = remainingAttempts * timePerAttemptMs;
            const etaSeconds = Math.floor((etaMs / 1000) % 60);
            const etaMinutes = Math.floor((etaMs / (1000 * 60)) % 60);
            const etaHours = Math.floor(etaMs / (1000 * 60 * 60));
            if (metricEta) {
                 metricEta.textContent =
                `${String(etaHours).padStart(2, '0')}:${String(etaMinutes).padStart(2, '0')}:${String(etaSeconds).padStart(2, '0')}`;
            }
        } else if (currentAttempts === totalExpectedAttempts && totalExpectedAttempts > 0) {
             if (metricEta) metricEta.textContent = 'Done';
        }
    }
    let elapsedTimeInterval;

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
            try {
                authFileContent = await comboFileInput.files[0].text();
            } catch (e) {
                alert('Error reading combo file.');
                console.error(e);
                return;
            }
        } else {
            if (usernameListInput && usernameListInput.files.length > 0) {
                try {
                    const userFileText = await usernameListInput.files[0].text();
                    usernameList = userFileText.split(/\r?\n/).map(u => u.trim()).filter(u => u);
                } catch (e) {
                    alert('Error reading username file.');
                    console.error(e);
                    return;
                }
            } else if (singleUsernameInput && singleUsernameInput.value.trim()) {
                usernameList = [singleUsernameInput.value.trim()];
            }

            if (passwordListInput && passwordListInput.files.length > 0) {
                 try {
                    const passFileText = await passwordListInput.files[0].text();
                    passwordList = passFileText.split(/\r?\n/).map(p => p.trim()).filter(p => p);
                } catch (e) {
                    alert('Error reading password file.');
                    console.error(e);
                    return;
                }
            }
        }

        if (!authFileContent && (usernameList.length === 0 || passwordList.length === 0)) {
            alert('Please provide credentials: either a combo file, or username(s) and password(s).');
            return;
        }

        const payload = {
            target_post_url: detectedPostUrlInput.value,
            username_field_name: detectedUsernameFieldInput.value,
            password_field_name: detectedPasswordFieldInput.value,
            form_method: currentAnalysisResult.form_method || 'POST', // Get from analysis
            csrf_token_name: detectedCsrfNameInput.value || null,
            csrf_token_value: detectedCsrfValueInput.value || null,
            cookies: currentAnalysisResult.cookies || {}, // From analysis
            auth_file_content: authFileContent,
            username_list: usernameList,
            password_list: passwordList,
        };

        // Add all other form_parameters from raw request if they exist
        if (currentAnalysisResult.form_parameters) {
            payload.form_parameters = currentAnalysisResult.form_parameters;
        }


        appendToLiveFeed('Starting attack...', 'info');
        attackStartTime = new Date();
        elapsedTimeInterval = setInterval(updateElapsedTime, 1000);

        if (eventSource) {
            eventSource.close();
        }

        eventSource = new EventSource(`/test_credentials?payload=${encodeURIComponent(JSON.stringify(payload))}`); // Send payload as query param for GET or modify backend to accept POST for EventSource setup

        // It's better to send the payload via POST to /test_credentials and have that endpoint
        // initiate the SSE stream. For now, this is a simplified GET approach if the backend supports it.
        // A more robust way:
        // 1. POST payload to a new endpoint like /initiate_attack_stream
        // 2. That endpoint saves payload to session or generates a unique ID
        // 3. EventSource connects to /test_credentials?stream_id=<unique_id>
        // For this example, I'll assume the backend's /test_credentials can handle a GET or that it was adapted.
        // The current python backend uses POST for /test_credentials. This will need adjustment.
        // Let's proceed assuming we'll adjust the fetch call to POST and the backend handles it.

        // Correct approach: POST to /test_credentials
        fetch('/test_credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} on setup.`);
            }
            // If the server immediately starts streaming on this response (not typical for SSE setup)
            // This part needs to align with how the server initiates SSE.
            // Standard SSE is via EventSource GET.
            // The current python backend expects a POST then it returns the SSE stream.
            // This means the fetch itself is the stream. This is unusual.
            // Let's assume the python server was modified to handle this fetch as the stream initiator.
            // This is not how EventSource() works. EventSource always makes a GET.

            // The following is a conceptual adaptation for a fetch-based stream reader
            // if the server directly streams on the POST response.
            // This is NOT standard SSE client behavior with EventSource.
            // For a real EventSource, the EventSource object handles this.

            // The Python backend is set up to return a Response object with mimetype text/event-stream
            // from the POST request itself. So we read the stream from the response body.

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            function processText({ done, value }) {
                if (done) {
                    appendToLiveFeed('Attack stream finished.', 'info');
                    clearInterval(elapsedTimeInterval);
                    updateElapsedTime(); // Final update
                     if (metricEta) metricEta.textContent = 'Done';
                    return;
                }

                const chunk = decoder.decode(value, { stream: true });
                const messages = chunk.split('\n\n'); // SSE messages are separated by double newlines

                messages.forEach(message => {
                    if (message.startsWith('data:')) {
                        const jsonData = message.substring(5).trim();
                        if (jsonData) {
                            try {
                                const eventData = JSON.parse(jsonData);
                                handleSseEvent(eventData);
                            } catch (e) {
                                console.error('Error parsing SSE JSON:', e, jsonData);
                                appendToLiveFeed(`Error parsing event: ${jsonData}`, 'error');
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
            appendToLiveFeed(`Error launching attack: ${error.message}`, 'error');
            clearInterval(elapsedTimeInterval);
        });
    }

    function handleSseEvent(data) {
        currentAttempts++;
        if (metricTotalAttempts && totalExpectedAttempts > 0) {
           metricTotalAttempts.textContent = `${currentAttempts}/${totalExpectedAttempts}`;
        } else if (metricTotalAttempts) {
            metricTotalAttempts.textContent = currentAttempts.toString();
        }


        if (data.type === 'info' && data.total_expected_attempts) {
            totalExpectedAttempts = data.total_expected_attempts;
            appendToLiveFeed(data.message, 'info');
             if (metricTotalAttempts) metricTotalAttempts.textContent = `0/${totalExpectedAttempts}`;
            return;
        }

        if (data.status === 'complete') {
            appendToLiveFeed(data.message || 'Attack complete.', 'info');
            clearInterval(elapsedTimeInterval);
            updateElapsedTime(); // Final update
            if (metricEta) metricEta.textContent = 'Done';
            // eventSource.close(); // This would be for EventSource() object
            return;
        }

        let logMessage = `Attempt: U: ${data.username}, P: **** - Status: ${data.status}`;
        if(data.details) logMessage += ` - Details: ${data.details.substring(0, 150)}...`;

        appendToLiveFeed(logMessage, data.status);

        if (data.status === 'success') {
            hits++;
            if (metricHits) metricHits.textContent = hits.toString();
        }
        updateElapsedTime();
    }


    if (launchAttackBtn) launchAttackBtn.addEventListener('click', handleLaunchAttack);

});
