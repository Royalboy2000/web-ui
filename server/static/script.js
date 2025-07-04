// Stryker/Predator Merged Script

const API_BASE_URL = 'http://127.0.0.1:5001';
window.attackContext = {}; // Used to store data between analysis and testing steps
let attemptDetailsStore = {}; // To store request/response for modal

document.addEventListener('DOMContentLoaded', () => {
    console.log('Stryker/Predator script loaded.');

    // Stryker Base Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const themeToggle = document.getElementById('theme-toggle');

    // --- STRYKER: SIDEBAR TOGGLE FOR MOBILE ---
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    document.addEventListener('click', (event) => {
        if (sidebar && sidebarToggle) {
            const isClickInsideSidebar = sidebar.contains(event.target);
            const isClickOnToggle = sidebarToggle.contains(event.target);
            if (!isClickInsideSidebar && !isClickOnToggle && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        }
    });

    // --- STRYKER: DARK/LIGHT MODE TOGGLE ---
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

    // --- PREDATOR FUNCTIONALITY ---

    // Predator UI Step/Element Getters (Update these IDs based on the new HTML)
    const loginUrlInput = document.getElementById('login-url');

    // Wizard Step Divs (Predator's concept, mapped to divs within new-scan-section)
    const uiStepTargetURL = document.getElementById('uiStep-TargetURL');
    const uiStepAnalysisReview = document.getElementById('uiStep-AnalysisReview');
    const uiStepCredentialsInput = document.getElementById('uiStep-CredentialsInput');
    const uiStepMonitor = document.getElementById('uiStep-Monitor');
    // const step2Options = document.getElementById('step2-options'); // Original Predator, likely not used now

    // Buttons
    const analyzeFormButton = document.getElementById('analyzeFormButton');
    const proceedToCredentialsBtn = document.getElementById('proceedToCredentialsBtn');
    const launchAttackBtn = document.getElementById('launchAttackBtn');
    const parseRawRequestBtn = document.getElementById('parseRawRequestBtn');

    // File inputs
    const usernameListInput = document.getElementById('username-list-upload');
    const browseUsernameFilesButton = document.getElementById('browse-username-files-btn');
    const selectedUsernameFileNameDisplay = document.getElementById('selected-username-file-name');

    const passwordListInput = document.getElementById('password-list-upload');
    const browsePasswordFilesButton = document.getElementById('browse-password-files-btn'); // Corrected ID
    const selectedPasswordFileNameDisplay = document.getElementById('selected-password-file-name');

    // Form analysis results panel and its fields
    const formAnalysisResultsPanel = document.getElementById('form-analysis-results'); // This is a container within uiStep-AnalysisReview
    const detectedUsernameFieldInput = document.getElementById('detected-username-field');
    const detectedPasswordFieldInput = document.getElementById('detected-password-field');
    const detectedPostUrlInput = document.getElementById('detected-post-url');

    // Raw request input elements
    const rawRequestInput = document.getElementById('raw-request-input');
    const capturedParamsDisplay = document.getElementById('capturedParamsDisplay'); // Container for pre
    const capturedParamsText = document.getElementById('capturedParamsText'); // The <pre> tag

    // HUD Elements
    const attemptsCountEl = document.getElementById('hud-total-attempts');
    const hitsCountEl = document.getElementById('hud-hits');
    const elapsedTimeEl = document.getElementById('hud-elapsed-time');
    const etaEl = document.getElementById('hud-eta');

    // Terminal Elements
    let terminalBody = uiStepMonitor ? uiStepMonitor.querySelector('.terminal-body') : null; // Adjusted selector
    const filterAll = document.getElementById('filter-all');
    const filterHits = document.getElementById('filter-hits');
    const filterFails = document.getElementById('filter-fails');
    const filterContentLength = document.getElementById('filter-content-length');
    const filterResponse = document.getElementById('filter-response'); // Added from original HTML
    const terminalFilters = [filterAll, filterHits, filterFails, filterContentLength, filterResponse].filter(el => el != null);


    const sortClAscBtn = document.getElementById('sort-cl-asc');
    const sortClDescBtn = document.getElementById('sort-cl-desc');

    // Modal Elements
    const responseModal = document.getElementById('responseModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalRequestDetails = document.getElementById('modalRequestDetails');
    const modalResponseBody = document.getElementById('modalResponseBody');
    const modalLoginScore = document.getElementById('modalLoginScore');
    const modalPositiveIndicators = document.getElementById('modalPositiveIndicators');
    const modalNegativeIndicators = document.getElementById('modalNegativeIndicators');


    let testStartTime;
    let elapsedTimeInterval;
    let totalExpectedAttemptsForCurrentTest = 0;
    let completedAttemptsThisRun = 0;

    function formatTime(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0 || !isFinite(totalSeconds)) return '--:--:--';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return [hours, minutes, seconds]
            .map(v => v < 10 ? "0" + v : v)
            .join(":");
    }

    function updateTimers() {
        if (!testStartTime) return;
        const now = Date.now();
        const elapsedMs = now - testStartTime;
        const elapsedSecondsTotal = Math.floor(elapsedMs / 1000);
        if (elapsedTimeEl) elapsedTimeEl.textContent = formatTime(elapsedSecondsTotal);

        if (etaEl) {
            if (totalExpectedAttemptsForCurrentTest > 0 && completedAttemptsThisRun > 0 && completedAttemptsThisRun < totalExpectedAttemptsForCurrentTest) {
                const timePerAttempt = elapsedMs / completedAttemptsThisRun;
                const remainingAttempts = totalExpectedAttemptsForCurrentTest - completedAttemptsThisRun;
                const etaMs = remainingAttempts * timePerAttempt;
                const etaSecondsTotal = Math.floor(etaMs / 1000);
                etaEl.textContent = formatTime(etaSecondsTotal);
            } else if (completedAttemptsThisRun >= totalExpectedAttemptsForCurrentTest && totalExpectedAttemptsForCurrentTest > 0) {
                etaEl.textContent = '00:00:00';
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
            } else if (totalExpectedAttemptsForCurrentTest === 0 && completedAttemptsThisRun > 0 && !testStartTime) { // Check if test actually started
                 etaEl.textContent = 'Calculating...';
            } else if (totalExpectedAttemptsForCurrentTest === 0 && completedAttemptsThisRun === 0 && testStartTime) {
                 etaEl.textContent = 'Waiting...';
            }
             else {
                etaEl.textContent = '--:--:--';
            }
        }
    }

    // Function to show a specific Predator wizard step within the "New Scan" section
    function showUiStep(stepIdToShow) {
        const predatorSteps = [uiStepTargetURL, uiStepAnalysisReview, uiStepCredentialsInput, uiStepMonitor];
        predatorSteps.forEach(step => {
            if (step) { // Ensure element exists
                step.style.display = (step.id === stepIdToShow) ? 'block' : 'none';
            }
        });
        // If showing monitor, ensure its terminalBody is correctly assigned (it might be null if uiStepMonitor was not found initially)
        if (stepIdToShow === 'uiStep-Monitor' && uiStepMonitor) {
            terminalBody = uiStepMonitor.querySelector('.terminal-body');
        }
    }

    // File Input Setup
    if (browseUsernameFilesButton && usernameListInput) {
        browseUsernameFilesButton.addEventListener('click', () => usernameListInput.click());
    } else { console.error('Username browse button or file input not found.'); }

    if (browsePasswordFilesButton && passwordListInput) { // Corrected ID used here
        browsePasswordFilesButton.addEventListener('click', () => passwordListInput.click());
    } else { console.error('Password browse button or file input not found.'); }

    function setupFileInputListener(fileInput, displayElement, defaultText) {
        if (fileInput && displayElement) {
            fileInput.addEventListener('change', () => {
                displayElement.textContent = (fileInput.files && fileInput.files.length > 0) ? fileInput.files[0].name : defaultText;
            });
        } else {
            // console.error('File input or display element for setup not found:', { fileInputId: fileInput ? fileInput.id : 'N/A', displayElementId: displayElement ? displayElement.id : 'N/A' });
        }
    }
    setupFileInputListener(usernameListInput, selectedUsernameFileNameDisplay, 'No file selected.');
    setupFileInputListener(passwordListInput, selectedPasswordFileNameDisplay, 'No password file selected.');


    // Analyze Form Button
    if (analyzeFormButton) {
        const originalButtonTextEl = analyzeFormButton.querySelector('.btn-text');
        const originalButtonText = originalButtonTextEl ? originalButtonTextEl.textContent : 'Analyze Form';
        const spinner = analyzeFormButton.querySelector('.spinner');

        analyzeFormButton.addEventListener('click', async (event) => {
            event.preventDefault();
            if (!loginUrlInput) { alert("Login URL input not found."); return; }

            if (rawRequestInput) rawRequestInput.value = '';
            if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none';
            if (capturedParamsText) capturedParamsText.textContent = '';
            // if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none'; // Panel itself contains items, hide items or specific sections

            const loginUrl = loginUrlInput.value.trim();
            if (!loginUrl) { alert("Please enter the login URL."); return; }
            try {
                new URL(loginUrl); // Basic validation
                if (!loginUrl.startsWith('http://') && !loginUrl.startsWith('https://')) {
                     alert('Invalid login URL. Must start with http:// or https://'); return;
                }
            } catch (e) {
                alert("Invalid login URL format."); return;
            }

            if(originalButtonTextEl) originalButtonTextEl.textContent = 'Analyzing...';
            if(spinner) spinner.style.display = 'inline-block';
            analyzeFormButton.disabled = true;
            window.attackContext = {};

            try {
                const apiResponse = await fetch(API_BASE_URL + '/analyze_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify({ url: loginUrl }),
                });
                const analysis = await apiResponse.json();
                if (!apiResponse.ok) { throw new Error(analysis.error || `API Error: ${apiResponse.status}`); }

                if (analysis.error) {
                    alert(`Analysis Error: ${analysis.error}`);
                } else {
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = analysis.username_field_name || '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = analysis.password_field_name || '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = analysis.post_url || '';
                    ['detected-username-field', 'detected-password-field', 'detected-post-url'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.value) el.parentNode.querySelector('label').classList.add('active'); // For floating labels if any
                    });


                    window.attackContext.formMethod = analysis.form_method;
                    window.attackContext.csrfTokenName = analysis.csrf_token_name;
                    window.attackContext.csrfTokenValue = analysis.csrf_token_value;
                    window.attackContext.initialCookies = analysis.cookies;
                    window.attackContext.analyzedUrl = loginUrl;

                    if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none';
                    showUiStep('uiStep-AnalysisReview');
                }
            } catch (error) {
                alert(`Failed to analyze form: ${error.message}.`);
            } finally {
                if(originalButtonTextEl) originalButtonTextEl.textContent = originalButtonText;
                if(spinner) spinner.style.display = 'none';
                analyzeFormButton.disabled = false;
            }
        });
    } else { console.error('Analyze Form Button not found'); }

    // Parse Raw Request Button
    if (parseRawRequestBtn) {
        parseRawRequestBtn.addEventListener('click', async () => {
            if (!rawRequestInput) { alert("Raw request input not found."); return; }
            const rawRequest = rawRequestInput.value.trim();
            if (!rawRequest) { alert("Please paste the captured HTTP request text."); return; }

            if (loginUrlInput) loginUrlInput.value = '';
            // if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';
            if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none';

            const originalBtnText = parseRawRequestBtn.textContent;
            parseRawRequestBtn.textContent = 'Parsing...';
            parseRawRequestBtn.disabled = true;
            window.attackContext = {};

            try {
                const response = await fetch(API_BASE_URL + '/parse_captured_request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ raw_request: rawRequest })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || `Error parsing request. Status: ${response.status}`); }

                if (data.error) {
                    alert(`Raw Request Parsing Error: ${data.error}`);
                } else {
                    if (detectedPostUrlInput) detectedPostUrlInput.value = data.post_url || '';
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = data.username_field_name || 'Could not auto-detect';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = data.password_field_name || 'Could not auto-detect';
                     ['detected-username-field', 'detected-password-field', 'detected-post-url'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.value) el.parentNode.querySelector('label').classList.add('active'); // For floating labels if any
                    });

                    window.attackContext.formMethod = data.form_method || 'POST';
                    window.attackContext.csrfTokenName = data.csrf_token_name || null;
                    window.attackContext.csrfTokenValue = data.csrf_token_value || null;
                    window.attackContext.initialCookies = data.cookies || {};
                    window.attackContext.analyzedUrl = data.post_url;
                    window.attackContext.requestHeaders = data.request_headers;

                    if (capturedParamsText) capturedParamsText.textContent = JSON.stringify(data.form_parameters || {}, null, 2);
                    if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'block';

                    showUiStep('uiStep-AnalysisReview');
                }
            } catch (error) {
                alert(`Failed to parse captured request: ${error.message}.`);
            } finally {
                parseRawRequestBtn.disabled = false;
                parseRawRequestBtn.textContent = originalBtnText;
            }
        });
    } else { console.error('Parse Raw Request Button not found'); }

    // Proceed to Credentials Button
    if (proceedToCredentialsBtn) {
        proceedToCredentialsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            showUiStep('uiStep-CredentialsInput');
        });
    } else { console.error('Proceed to Credentials Button not found'); }

    // Add Log Message Function
    function addLogMessage(message, type = 'info', dataAttributes = {}) {
        const currentTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body'); // Re-query in case it changed
        if (!currentTerminalBody) {
            console.log(`[${type.toUpperCase()}] Log (Monitor terminal body not found): ${message}`);
            return;
        }
        // ... (rest of addLogMessage logic is fine)
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString();
        const timeSpan = document.createElement('span');
        timeSpan.className = 'status-time';
        timeSpan.textContent = `[${time}] `;
        p.appendChild(timeSpan);
        const msgSpan = document.createElement('span');
        msgSpan.textContent = message;
        if (type === 'success') msgSpan.className = 'status-success';
        else if (type === 'fail' || type === 'error') msgSpan.className = 'status-fail';
        else msgSpan.className = 'status-info';
        p.appendChild(msgSpan);
        if (dataAttributes.id) p.id = dataAttributes.id;
        for (const key in dataAttributes) {
            if (dataAttributes.hasOwnProperty(key) && dataAttributes[key] !== undefined && dataAttributes[key] !== null) {
                p.dataset[key] = dataAttributes[key];
            }
        }
        currentTerminalBody.appendChild(p);
        currentTerminalBody.scrollTop = currentTerminalBody.scrollHeight;
    }

    // File Reading Functions (readUsernamesFromFile, readPasswordsFromFile) are fine as is.
    function readUsernamesFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error("No username file provided to reader.")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const usernames = content.split(/[\n\r]+/).map(u => u.trim()).filter(u => u); // Handles both LF and CRLF
                if (usernames.length === 0) {
                    reject(new Error("Username file is empty or does not contain valid usernames."));
                } else { resolve(usernames); }
            };
            reader.onerror = (e) => reject(new Error("Error reading username file."));
            reader.readAsText(file);
        });
    }

    function readPasswordsFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error("No password file provided to reader.")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const passwords = content.split(/[\n\r]+/).map(p => p.trim()).filter(p => p); // Handles both LF and CRLF
                if (passwords.length === 0) {
                    reject(new Error("Password file is empty or does not contain any valid passwords."));
                } else { resolve(passwords); }
            };
            reader.onerror = (e) => reject(new Error("Error reading password file."));
            reader.readAsText(file);
        });
    }

    // Terminal Filters Logic
    function getActiveVisibilityFilterId() {
        const activeFilter = terminalFilters.find(btn => btn && btn.classList.contains('active'));
        return activeFilter ? activeFilter.id : 'filter-all';
    }

    function applyActiveVisibilityFilter() {
        const currentTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
        if (!currentTerminalBody) return;
        const activeFilterId = getActiveVisibilityFilterId();
        const logEntries = currentTerminalBody.querySelectorAll('p');
        logEntries.forEach(entry => {
            let showEntry = false;
            const status = entry.dataset.status;
            switch (activeFilterId) {
                case 'filter-all':
                case 'filter-content-length': // These filters don't hide, they are for sorting or supplemental info
                case 'filter-response':
                    showEntry = true;
                    break;
                case 'filter-hits':
                    if (status === 'success') showEntry = true;
                    break;
                case 'filter-fails':
                    if (status === 'failure' || status === 'error') showEntry = true;
                    break;
            }
            entry.style.display = showEntry ? '' : 'none';
        });
    }

    terminalFilters.forEach(filterElement => {
        if (filterElement) {
            filterElement.addEventListener('click', (event) => {
                terminalFilters.forEach(el => el && el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                applyActiveVisibilityFilter();
            });
        }
    });

    // Sort Logic
    function sortLogEntriesByContentLength(direction) {
        const currentTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
        if (!currentTerminalBody) return;
        // ... (sort logic is fine, ensure dataset.contentLength is populated correctly)
        const logEntries = Array.from(currentTerminalBody.querySelectorAll('p'));
        logEntries.sort((a, b) => {
            const valAStr = a.dataset.contentLength;
            const valBStr = b.dataset.contentLength;
            let valA = (valAStr === 'N/A' || valAStr === undefined || valAStr === null) ? (direction === 1 ? -Infinity : Infinity) : parseInt(valAStr, 10);
            let valB = (valBStr === 'N/A' || valBStr === undefined || valBStr === null) ? (direction === 1 ? -Infinity : Infinity) : parseInt(valBStr, 10);
            if (isNaN(valA)) valA = (direction === 1 ? -Infinity : Infinity); // Handle NaN after parseInt
            if (isNaN(valB)) valB = (direction === 1 ? -Infinity : Infinity);
            return (valA - valB) * direction;
        });
        logEntries.forEach(entry => currentTerminalBody.appendChild(entry)); // Re-append in sorted order
        applyActiveVisibilityFilter(); // Re-apply filter in case some items were hidden
    }

    if (sortClAscBtn) {
        sortClAscBtn.addEventListener('click', () => {
            sortClAscBtn.classList.add('active-sort');
            if (sortClDescBtn) sortClDescBtn.classList.remove('active-sort');
            sortLogEntriesByContentLength(1);
        });
    }
    if (sortClDescBtn) {
        sortClDescBtn.addEventListener('click', () => {
            sortClDescBtn.classList.add('active-sort');
            if (sortClAscBtn) sortClAscBtn.classList.remove('active-sort');
            sortLogEntriesByContentLength(-1);
        });
    }

    // Modal Interaction Logic
    const currentMonitorTerminalBodyForModal = document.querySelector('#uiStep-Monitor .terminal-body');
    if (currentMonitorTerminalBodyForModal && responseModal && modalRequestDetails && modalResponseBody && modalCloseBtn) {
        currentMonitorTerminalBodyForModal.addEventListener('click', (event) => {
            const clickedP = event.target.closest('p[data-log-id]');
            if (clickedP) {
                const logId = clickedP.dataset.logId;
                if (attemptDetailsStore[logId]) {
                    const details = attemptDetailsStore[logId];
                    modalRequestDetails.textContent = details.request_details ? JSON.stringify(details.request_details, null, 2) : "No request details.";
                    modalResponseBody.textContent = details.response_body || "No response body.";

                    if (modalLoginScore) modalLoginScore.textContent = details.analysis && details.analysis.score !== undefined ? details.analysis.score : "N/A";

                    function populateIndicatorList(element, items, itemClassType) {
                        if (!element) return;
                        element.innerHTML = '';
                        if (items && items.length > 0) {
                            const ul = document.createElement('ul');
                            ul.className = 'indicator-list';
                            items.forEach(itemText => {
                                const li = document.createElement('li');
                                li.className = `indicator-item ${itemClassType}-item`;
                                const iconSpan = document.createElement('span');
                                iconSpan.className = 'indicator-icon';
                                iconSpan.textContent = itemClassType === 'positive' ? '✔ ' : '✖ ';
                                const textSpan = document.createElement('span');
                                textSpan.className = 'indicator-text';
                                textSpan.textContent = itemText;
                                li.appendChild(iconSpan);
                                li.appendChild(textSpan);
                                ul.appendChild(li);
                            });
                            element.appendChild(ul);
                        } else {
                            element.textContent = "None";
                        }
                    }

                    populateIndicatorList(modalPositiveIndicators, details.analysis ? details.analysis.positive_indicators : [], 'positive');
                    populateIndicatorList(modalNegativeIndicators, details.analysis ? details.analysis.negative_indicators : [], 'negative');

                    responseModal.style.display = 'flex'; // Changed from 'block' to 'flex' for centering
                } else {
                    // Fallback for entries without full details
                    modalRequestDetails.textContent = "No detailed data available for this log entry.";
                    modalResponseBody.textContent = "";
                    if (modalLoginScore) modalLoginScore.textContent = "N/A";
                    if (modalPositiveIndicators) modalPositiveIndicators.textContent = "N/A";
                    if (modalNegativeIndicators) modalNegativeIndicators.textContent = "N/A";
                    responseModal.style.display = 'flex';
                }
            }
        });
        modalCloseBtn.addEventListener('click', () => { responseModal.style.display = 'none'; });
        window.addEventListener('click', (event) => { // Close modal if click outside
            if (event.target === responseModal) { responseModal.style.display = 'none'; }
        });
    } else {
        console.error("Modal elements or its monitor terminal body not found for modal listeners.");
    }


    // Launch Attack Button
    if (launchAttackBtn) {
        const originalLaunchBtnText = launchAttackBtn.textContent;
        launchAttackBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            launchAttackBtn.disabled = true;
            launchAttackBtn.textContent = 'Launching...';

            attemptDetailsStore = {};
            completedAttemptsThisRun = 0;
            totalExpectedAttemptsForCurrentTest = 0; // Reset for current test
            testStartTime = Date.now();
            if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
            elapsedTimeInterval = setInterval(updateTimers, 1000);
            if (elapsedTimeEl) elapsedTimeEl.textContent = '00:00:00';
            if (etaEl) etaEl.textContent = '--:--:--';

            let totalAttemptsForHUD = 0; // Overall for HUD, might differ from completedAttemptsThisRun if multiple lists/strategies were planned
            let totalHitsForHUD = 0;
            if (attemptsCountEl) attemptsCountEl.textContent = totalAttemptsForHUD;
            if (hitsCountEl) hitsCountEl.textContent = totalHitsForHUD;

            const usernameFile = usernameListInput && usernameListInput.files.length > 0 ? usernameListInput.files[0] : null;
            const passwordFile = passwordListInput && passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const targetPostUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';

            showUiStep('uiStep-Monitor'); // Make sure monitor step is visible
            const currentTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
            if (currentTerminalBody) {
                currentTerminalBody.innerHTML = ''; // Clear previous logs
            } else {
                console.error("LaunchAttack: Terminal body in Monitor step not found.");
            }

            addLogMessage(`Initiating login attempts against ${targetPostUrl}...`, 'info', {logId: `init-log-${Date.now()}`});

            // Validations
            if (!usernameFile) {
                alert("Please select a username/email list file.");
                addLogMessage("Error: Username/Email list file not selected.", 'fail', {status: 'error'});
                // ... reset button, show credentials step, clear interval ...
                launchAttackBtn.disabled = false; launchAttackBtn.textContent = originalLaunchBtnText; showUiStep('uiStep-CredentialsInput'); if(elapsedTimeInterval) clearInterval(elapsedTimeInterval); return;
            }
             if (usernameFile.type !== 'text/plain' && usernameFile.type !== 'text/csv' && !usernameFile.name.endsWith('.txt') && !usernameFile.name.endsWith('.csv')) {
                alert("Invalid username file type. Please upload a .txt or .csv file.");
                addLogMessage("Error: Invalid username file type.", 'fail', {status: 'error'});
                launchAttackBtn.disabled = false; launchAttackBtn.textContent = originalLaunchBtnText; showUiStep('uiStep-CredentialsInput'); if(elapsedTimeInterval) clearInterval(elapsedTimeInterval); return;
            }
            if (usernameFile.size > 5 * 1024 * 1024) { // Increased size limit slightly
                alert("Username file is too large. Maximum size is 5MB.");
                 addLogMessage("Error: Username file too large.", 'fail', {status: 'error'});
                launchAttackBtn.disabled = false; launchAttackBtn.textContent = originalLaunchBtnText; showUiStep('uiStep-CredentialsInput'); if(elapsedTimeInterval) clearInterval(elapsedTimeInterval); return;
            }
            if (!passwordFile) {
                alert("Password file not selected.");
                addLogMessage("Error: Password file not selected.", 'fail', {status: 'error'});
                launchAttackBtn.disabled = false; launchAttackBtn.textContent = originalLaunchBtnText; showUiStep('uiStep-CredentialsInput'); if(elapsedTimeInterval) clearInterval(elapsedTimeInterval); return;
            }
             if (!targetPostUrl || !usernameFieldName || !passwordFieldName || usernameFieldName === 'Could not auto-detect' || passwordFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field, Password Field) are missing or invalid. Review Step 2.");
                addLogMessage("Error: Critical form parameters missing.", 'fail', {status: 'error'});
                launchAttackBtn.disabled = false; launchAttackBtn.textContent = originalLaunchBtnText; showUiStep('uiStep-AnalysisReview'); if(elapsedTimeInterval) clearInterval(elapsedTimeInterval); return;
            }

            addLogMessage(`Username Field: ${usernameFieldName}, Password Field: ${passwordFieldName}`, 'info');

            let usernames = [];
            let passwords = [];

            try {
                usernames = await readUsernamesFromFile(usernameFile);
                passwords = await readPasswordsFromFile(passwordFile);
                addLogMessage(`Read ${usernames.length} usernames and ${passwords.length} passwords. Starting tests...`, 'info');

                const payload = {
                    target_post_url: targetPostUrl,
                    username_field_name: usernameFieldName,
                    password_field_name: passwordFieldName,
                    form_method: window.attackContext.formMethod || 'POST',
                    csrf_token_name: window.attackContext.csrfTokenName,
                    csrf_token_value: window.attackContext.csrfTokenValue,
                    cookies: window.attackContext.initialCookies,
                    request_headers: window.attackContext.requestHeaders,
                    username_list: usernames,
                    password_list: passwords
                };

                const response = await fetch(API_BASE_URL + '/test_credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json',},
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status}` }));
                    throw new Error(errorData.error);
                }
                if (!response.body) throw new Error("Response body is null.");

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                async function processStream() {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (buffer.trim()) processBuffer(); // Process any remaining buffer
                            addLogMessage("Stream ended. All results processed.", "info");
                            if (elapsedTimeInterval) clearInterval(elapsedTimeInterval); updateTimers(); if (etaEl) etaEl.textContent = 'Done';
                            break;
                        }
                        buffer += decoder.decode(value, { stream: true });
                        processBuffer();
                    }
                }

                function processBuffer() {
                    let sseMessages = buffer.split('\n\n');
                    for (let i = 0; i < sseMessages.length - 1; i++) {
                        let messageBlock = sseMessages[i].trim();
                        if (messageBlock.startsWith("data:")) {
                            let jsonDataString = messageBlock.substring(5).trim();
                            try {
                                let result_item = JSON.parse(jsonDataString);
                                if (result_item.type === 'info' && result_item.total_expected_attempts !== undefined) {
                                    totalExpectedAttemptsForCurrentTest = parseInt(result_item.total_expected_attempts, 10);
                                    completedAttemptsThisRun = 0; // Reset for this specific batch if info comes mid-stream
                                    addLogMessage(result_item.message, 'info');
                                } else if (result_item.status === 'complete') {
                                    addLogMessage(result_item.message || "All attempts finished.", "info");
                                    if (elapsedTimeInterval) clearInterval(elapsedTimeInterval); updateTimers(); if (etaEl) etaEl.textContent = 'Done';
                                } else { // Actual attempt result
                                    completedAttemptsThisRun++;
                                    totalAttemptsForHUD++;
                                    if (result_item.status === 'success') totalHitsForHUD++;

                                    if (attemptsCountEl) attemptsCountEl.textContent = totalAttemptsForHUD;
                                    if (hitsCountEl) hitsCountEl.textContent = totalHitsForHUD;

                                    const currentAttemptId = `logEntry-${totalAttemptsForHUD}`;
                                    const displayPassword = (result_item.password_actual || result_item.password || "").replace(/./g, '*');
                                    const clText = result_item.content_length !== undefined && result_item.content_length !== null ? result_item.content_length : 'N/A';
                                    let logDetail = `[${result_item.status.toUpperCase()}] User: ${result_item.username} / Pass: ${displayPassword} (CL: ${clText})`;
                                    if (result_item.analysis && result_item.analysis.score !== undefined) {
                                        logDetail += ` (Score: ${result_item.analysis.score})`;
                                    }
                                    logDetail += ` - ${result_item.details}`;

                                    attemptDetailsStore[currentAttemptId] = {
                                        request_details: result_item.request_details,
                                        response_body: result_item.response_body,
                                        analysis: result_item.analysis
                                    };
                                    addLogMessage(logDetail, result_item.status, {
                                        id: currentAttemptId, logId: currentAttemptId, status: result_item.status, contentLength: result_item.content_length
                                    });
                                }
                            } catch (e) { addLogMessage(`Error parsing streamed JSON: ${jsonDataString}`, 'error'); }
                        }
                    }
                    buffer = sseMessages[sseMessages.length - 1];
                }
                await processStream();
            } catch (error) {
                addLogMessage(`Error: ${error.message}`, 'fail', {status: 'error'});
                alert(`An error occurred: ${error.message}`);
            } finally {
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                if (elapsedTimeInterval) { clearInterval(elapsedTimeInterval); updateTimers(); }
                 if (etaEl && (etaEl.textContent === '--:--:--' || etaEl.textContent === 'Calculating...' || etaEl.textContent === 'Waiting...')) {
                     etaEl.textContent = (completedAttemptsThisRun === totalExpectedAttemptsForCurrentTest && totalExpectedAttemptsForCurrentTest > 0) ? '00:00:00' : 'Stopped';
                 }
            }
        });
    } else { console.error('Launch Attack button not found.'); }


    // --- STRYKER: NAVIGATION & INITIAL UI STATE ---
    function showContentSection(sectionIdToShow) {
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
            section.classList.remove('active-section');
        });
        const sectionToShow = document.getElementById(sectionIdToShow);
        if (sectionToShow) {
            sectionToShow.style.display = 'block';
            sectionToShow.classList.add('active-section');
        }

        // If showing 'new-scan-section', also manage Predator steps visibility
        if (sectionIdToShow === 'new-scan-section') {
            showUiStep('uiStep-TargetURL'); // Default to the first Predator step
             // Ensure the terminal body is available for addLogMessage if monitor is part of this section but hidden initially
            if (uiStepMonitor) terminalBody = uiStepMonitor.querySelector('.terminal-body');
        }
    }

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.dataset.section;
            if (sectionId) {
                showContentSection(sectionId);
                document.querySelectorAll('.sidebar-nav .nav-link').forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });

    const startNewScanDashboardButton = document.getElementById('startNewScanFromDashboard');
    if(startNewScanDashboardButton) {
        startNewScanDashboardButton.addEventListener('click', () => {
            showContentSection('new-scan-section');
            document.querySelectorAll('.sidebar-nav .nav-link').forEach(nav => nav.classList.remove('active'));
            const newScanNavLink = document.querySelector('.nav-link[data-section="new-scan-section"]');
            if(newScanNavLink) newScanNavLink.classList.add('active');
        });
    }

    // Default view: Show dashboard, then initialize Predator's first step within the (hidden) new-scan-section
    showContentSection('dashboard-section');
    if (document.getElementById('new-scan-section')) { // Ensure the section exists
         showUiStep('uiStep-TargetURL'); // Prepare the first step of Predator UI
    }
    // Ensure form analysis panel (or its content) is hidden initially if it's part of a step
    if(formAnalysisResultsPanel) { // This is the container within AnalysisReview step
        // If it has specific content to hide, do it here, or rely on parent step being hidden.
        // For now, assume parent step `uiStep-AnalysisReview` being hidden is enough.
    }

});
