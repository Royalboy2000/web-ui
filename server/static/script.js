// Predator - Web Attack Panel Logic
// This script will handle the frontend interactions and logic for the attack panel.

const API_BASE_URL = 'http://127.0.0.1:5001';
window.attackContext = {}; // Used to store data between analysis and testing steps
let attemptDetailsStore = {}; // To store request/response for modal

document.addEventListener('DOMContentLoaded', () => {
    console.log('Predator script loaded and DOM fully parsed.');

    // Get references to DOM elements
    const loginUrlInput = document.getElementById('login-url');

    // Step divs
    const uiStepTargetURL = document.getElementById('uiStep-TargetURL');
    const uiStepAnalysisReview = document.getElementById('uiStep-AnalysisReview');
    const uiStepCredentialsInput = document.getElementById('uiStep-CredentialsInput');
    const uiStepMonitor = document.getElementById('uiStep-Monitor');
    const step2Options = document.getElementById('step2-options');

    // Buttons
    const analyzeFormButton = document.getElementById('analyzeFormButton');
    const proceedToCredentialsBtn = document.getElementById('proceedToCredentialsBtn');
    const launchAttackBtn = document.getElementById('launchAttackBtn');
    const parseRawRequestBtn = document.getElementById('parseRawRequestBtn'); // New button

    // File inputs
    const usernameListInput = document.getElementById('username-list-upload');
    const browseUsernameFilesButton = document.getElementById('browse-username-files-btn');
    const selectedUsernameFileNameDisplay = document.getElementById('selected-username-file-name');

    const passwordListInput = document.getElementById('password-list-upload');
    const browsePasswordFilesButton = document.getElementById('browse-files-btn');
    const selectedPasswordFileNameDisplay = document.getElementById('selected-password-file-name');

    // Form analysis results panel and its fields
    const formAnalysisResultsPanel = document.getElementById('form-analysis-results');
    const detectedUsernameFieldInput = document.getElementById('detected-username-field');
    const detectedPasswordFieldInput = document.getElementById('detected-password-field');
    const detectedPostUrlInput = document.getElementById('detected-post-url');

    // Raw request input elements
    const rawRequestInput = document.getElementById('raw-request-input');
    const capturedParamsDisplay = document.getElementById('capturedParamsDisplay');
    const capturedParamsText = document.getElementById('capturedParamsText');

    // HUD Elements
    const attemptsCountEl = document.getElementById('hud-total-attempts');
    const hitsCountEl = document.getElementById('hud-hits');
    const elapsedTimeEl = document.getElementById('hud-elapsed-time');
    const etaEl = document.getElementById('hud-eta');

    let terminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
    const filterAll = document.getElementById('filter-all');
    const filterHits = document.getElementById('filter-hits');
    const filterFails = document.getElementById('filter-fails');
    const filterContentLength = document.getElementById('filter-content-length');
    const filterResponse = document.getElementById('filter-response');
    const terminalFilters = [filterAll, filterHits, filterFails, filterContentLength, filterResponse].filter(el => el != null);

    const sortClAscBtn = document.getElementById('sort-cl-asc');
    const sortClDescBtn = document.getElementById('sort-cl-desc');

    const responseModal = document.getElementById('responseModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalRequestDetails = document.getElementById('modalRequestDetails');
    const modalResponseBody = document.getElementById('modalResponseBody');

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
            } else if (totalExpectedAttemptsForCurrentTest === 0 && completedAttemptsThisRun > 0) {
                etaEl.textContent = 'Calculating...';
            } else {
                etaEl.textContent = '--:--:--';
            }
        }
    }

    function showUiStep(stepIdToShow) {
        const allSteps = [uiStepTargetURL, uiStepAnalysisReview, uiStepCredentialsInput, uiStepMonitor, step2Options];
        allSteps.forEach(step => {
            if (step) {
                step.style.display = (step.id === stepIdToShow) ? 'block' : 'none';
                step.classList.remove('active');
                if (step.id === stepIdToShow) step.classList.add('active');
            }
        });
        if (stepIdToShow === 'uiStep-Monitor') {
            terminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
        }
    }

    if (browseUsernameFilesButton && usernameListInput) {
        browseUsernameFilesButton.addEventListener('click', () => usernameListInput.click());
    } else { console.error('Username browse button or file input not found.'); }

    if (browsePasswordFilesButton && passwordListInput) {
        browsePasswordFilesButton.addEventListener('click', () => passwordListInput.click());
    } else { console.error('Password browse button or file input not found.'); }

    function setupFileInputListener(fileInput, displayElement, defaultText) {
        if (fileInput && displayElement) {
            fileInput.addEventListener('change', () => {
                displayElement.textContent = (fileInput.files && fileInput.files.length > 0) ? fileInput.files[0].name : defaultText;
            });
        } else {
            console.error('File input or display element for setup not found:', { fileInputId: fileInput ? fileInput.id : 'N/A', displayElementId: displayElement ? displayElement.id : 'N/A' });
        }
    }

    setupFileInputListener(usernameListInput, selectedUsernameFileNameDisplay, 'No file selected.');
    setupFileInputListener(passwordListInput, selectedPasswordFileNameDisplay, 'No password file selected.');

    if (analyzeFormButton) {
        const originalButtonText = analyzeFormButton.querySelector('.btn-text').textContent;
        const spinner = analyzeFormButton.querySelector('.spinner');
        analyzeFormButton.addEventListener('click', async (event) => {
            event.preventDefault();

            // Clear raw request input and its display if user chooses URL analysis
            if (rawRequestInput) rawRequestInput.value = '';
            if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none';
            if (capturedParamsText) capturedParamsText.textContent = '';

            if(formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none'; // Hide previous results (from either method)


            const loginUrl = loginUrlInput.value.trim();

            // URL validation is primary for this step
            if (!loginUrl) { alert("Please enter the login URL."); return; }
            try {
                new URL(loginUrl);
                if (!loginUrl.startsWith('http://') && !loginUrl.startsWith('https://')) {
                     alert('Invalid login URL. Must start with http:// or https://'); return;
                }
            } catch (e) {
                alert("Invalid login URL format. Please enter a full URL (e.g., https://example.com/login)."); return;
            }

            console.log(`Starting form analysis for URL: ${loginUrl}`);
            if(spinner) spinner.style.display = 'inline-block';
            analyzeFormButton.querySelector('.btn-text').textContent = 'Analyzing...';
            analyzeFormButton.disabled = true;
            window.attackContext = {};

            try {
                const apiResponse = await fetch(API_BASE_URL + '/analyze_url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify({ url: loginUrl }),
                });
                const analysis = await apiResponse.json();
                if (!apiResponse.ok) { throw new Error(analysis.error || `API Error: ${apiResponse.status} - ${apiResponse.statusText || 'Unknown error'}`); }

                if (analysis.error) {
                    alert(`Analysis Error: ${analysis.error}`);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                    showUiStep('uiStep-TargetURL');
                } else {
                    console.log("Analysis successful via URL:", analysis);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = analysis.username_field_name || '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = analysis.password_field_name || '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = analysis.post_url || '';

                    window.attackContext.formMethod = analysis.form_method;
                    window.attackContext.csrfTokenName = analysis.csrf_token_name;
                    window.attackContext.csrfTokenValue = analysis.csrf_token_value;
                    window.attackContext.initialCookies = analysis.cookies;
                    window.attackContext.analyzedUrl = loginUrl; // Keep track of what was analyzed

                    if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'block';
                    if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none'; // Ensure raw request display is hidden
                    showUiStep('uiStep-AnalysisReview');
                    console.log("Form analysis complete. Detected parameters populated.");
                }
            } catch (error) {
                console.error("Error during form analysis call:", error);
                alert(`Failed to analyze form: ${error.message}. Check console and ensure backend server is running.`);
                if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                showUiStep('uiStep-TargetURL');
            } finally {
                [detectedUsernameFieldInput, detectedPasswordFieldInput, detectedPostUrlInput].forEach(input => {
                    if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); }
                });
                if(spinner) spinner.style.display = 'none';
                analyzeFormButton.querySelector('.btn-text').textContent = originalButtonText;
                analyzeFormButton.disabled = false;
            }
        });
    } else { console.error('Analyze form button not found.'); }

    // --- "Parse Captured Request" Button Click Logic ---
    if (parseRawRequestBtn) {
        parseRawRequestBtn.addEventListener('click', async () => {
            const rawRequest = rawRequestInput.value.trim();
            if (!rawRequest) {
                alert("Please paste the captured HTTP request text.");
                rawRequestInput.focus();
                return;
            }

            // Clear URL input if using raw request, and hide normal analysis results display initially
            if (loginUrlInput) loginUrlInput.value = '';
            if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';
            if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'none';


            const originalBtnText = parseRawRequestBtn.textContent;
            parseRawRequestBtn.textContent = 'Parsing...';
            parseRawRequestBtn.disabled = true;
            window.attackContext = {}; // Reset context

            try {
                const response = await fetch(API_BASE_URL + '/parse_captured_request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ raw_request: rawRequest })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `Error parsing request. Status: ${response.status} ${response.statusText || 'Unknown error'}`);
                }

                if (data.error) {
                    alert(`Raw Request Parsing Error: ${data.error}`);
                    showUiStep('uiStep-TargetURL');
                } else {
                    console.log("Parsed captured request successfully:", data);

                    if (detectedPostUrlInput) detectedPostUrlInput.value = data.post_url || '';
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = data.username_field_name || 'Could not auto-detect';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = data.password_field_name || 'Could not auto-detect';

                    window.attackContext.formMethod = data.form_method || 'POST';
                    window.attackContext.csrfTokenName = data.csrf_token_name || null;
                    window.attackContext.csrfTokenValue = data.csrf_token_value || null;
                    window.attackContext.initialCookies = data.cookies || {};
                    window.attackContext.analyzedUrl = data.post_url; // Use the parsed post_url as the "analyzed" URL context
                    window.attackContext.requestHeaders = data.request_headers; // Store all headers from raw request

                    if (capturedParamsText) {
                        let paramsToShow = {...data.form_parameters};
                        // Optionally filter out password from display here if needed, though backend sends it
                        // if (paramsToShow[data.password_field_name]) paramsToShow[data.password_field_name] = "********";
                        capturedParamsText.textContent = JSON.stringify(paramsToShow, null, 2);
                    }
                    if (capturedParamsDisplay) capturedParamsDisplay.style.display = 'block';

                    if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'block';

                    [detectedPostUrlInput, detectedUsernameFieldInput, detectedPasswordFieldInput].forEach(input => {
                        if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); }
                    });

                    showUiStep('uiStep-AnalysisReview');
                }
            } catch (error) {
                console.error("Error parsing captured request via API:", error);
                alert(`Failed to parse captured request: ${error.message}. Check console for details.`);
                // Potentially add log message to a general status area if terminal isn't visible
                showUiStep('uiStep-TargetURL');
            } finally {
                parseRawRequestBtn.disabled = false;
                parseRawRequestBtn.textContent = originalBtnText;
            }
        });
    } else { console.error("Parse Raw Request button not found."); }


    if (proceedToCredentialsBtn) {
        proceedToCredentialsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            console.log("Proceeding to credentials input step.");
            showUiStep('uiStep-CredentialsInput');
        });
    } else { console.error("Proceed to Credentials button not found."); }

    function addLogMessage(message, type = 'info', dataAttributes = {}) {
        const currentActiveTerminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
        if (!currentActiveTerminalBody) {
            console.log(`[${type.toUpperCase()}] Log (Monitor terminal not active): ${message}`);
            return;
        }
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
        currentActiveTerminalBody.appendChild(p);
        currentActiveTerminalBody.scrollTop = currentActiveTerminalBody.scrollHeight;
    }

    function readUsernamesFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error("No username file provided to reader.")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const usernames = content.split('\n').map(u => u.trim()).filter(u => u);
                if (usernames.length === 0) {
                    reject(new Error("Username file is empty or does not contain valid usernames. Each username should be on a new line."));
                } else { resolve(usernames); }
            };
            reader.onerror = (e) => {
                console.error("FileReader error for username file:", e);
                reject(new Error("An error occurred while reading the username file."));
            };
            reader.readAsText(file);
        });
    }

    function readPasswordsFromFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error("No password file provided to reader.")); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const passwords = content.split('\n').map(p => p.trim()).filter(p => p);
                if (passwords.length === 0) {
                    reject(new Error("Password file is empty or does not contain any valid passwords. Each password should be on a new line."));
                    return;
                }
                resolve(passwords);
            };
            reader.onerror = (e) => {
                console.error("FileReader error for password file:", e);
                reject(new Error("An error occurred while reading the password file."));
            };
            reader.readAsText(file);
        });
    }

    function getActiveVisibilityFilterId() {
        const activeFilter = terminalFilters.find(btn => btn && btn.classList.contains('active'));
        return activeFilter ? activeFilter.id : 'filter-all';
    }

    function applyActiveVisibilityFilter() {
        const currentActiveTerminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
        if (!currentActiveTerminalBody) return;
        const activeFilterId = getActiveVisibilityFilterId();
        const logEntries = currentActiveTerminalBody.querySelectorAll('p');
        logEntries.forEach(entry => {
            let showEntry = false;
            const status = entry.dataset.status;
            switch (activeFilterId) {
                case 'filter-all':
                case 'filter-content-length':
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

    function sortLogEntriesByContentLength(direction) {
        const currentActiveTerminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
        if (!currentActiveTerminalBody) return;
        const logEntries = Array.from(currentActiveTerminalBody.querySelectorAll('p'));
        logEntries.sort((a, b) => {
            const valAStr = a.dataset.contentLength;
            const valBStr = b.dataset.contentLength;
            let valA = (valAStr === 'N/A' || valAStr === undefined || valAStr === null) ? (direction === 1 ? -Infinity : Infinity) : parseInt(valAStr, 10);
            let valB = (valBStr === 'N/A' || valBStr === undefined || valBStr === null) ? (direction === 1 ? -Infinity : Infinity) : parseInt(valBStr, 10);
            if (isNaN(valA)) valA = (direction === 1 ? -Infinity : Infinity);
            if (isNaN(valB)) valB = (direction === 1 ? -Infinity : Infinity);
            return (valA - valB) * direction;
        });
        logEntries.forEach(entry => currentActiveTerminalBody.appendChild(entry));
        applyActiveVisibilityFilter();
    }

    if (sortClAscBtn) {
        sortClAscBtn.addEventListener('click', () => {
            console.log("Sorting by Content Length Ascending");
            sortClAscBtn.classList.add('active-sort');
            if (sortClDescBtn) sortClDescBtn.classList.remove('active-sort');
            sortLogEntriesByContentLength(1);
        });
    } else { console.error("Sort Ascending button not found"); }

    if (sortClDescBtn) {
        sortClDescBtn.addEventListener('click', () => {
            console.log("Sorting by Content Length Descending");
            sortClDescBtn.classList.add('active-sort');
            if (sortClAscBtn) sortClAscBtn.classList.remove('active-sort');
            sortLogEntriesByContentLength(-1);
        });
    } else { console.error("Sort Descending button not found"); }

    const monitorTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
    if (monitorTerminalBody && responseModal && modalRequestDetails && modalResponseBody && modalCloseBtn) {
        monitorTerminalBody.addEventListener('click', (event) => {
            const clickedP = event.target.closest('p[data-log-id]');
            if (clickedP) {
                const logId = clickedP.dataset.logId;
                if (attemptDetailsStore[logId] && attemptDetailsStore[logId].request_details !== undefined) {
                    const details = attemptDetailsStore[logId];
                    modalRequestDetails.textContent = JSON.stringify(details.request_details, null, 2);
                    modalResponseBody.textContent = details.response_body || "No response body captured or applicable.";
                    responseModal.style.display = 'block';
                } else {
                    console.warn(`No detailed data in store for logId: ${logId}. Entry:`, clickedP.textContent);
                    modalRequestDetails.textContent = "No request details available for this log entry.";
                    modalResponseBody.textContent = "No response body available for this log entry (this might be an informational message).";
                    responseModal.style.display = 'block';
                }
            }
        });
        modalCloseBtn.addEventListener('click', () => { responseModal.style.display = 'none'; });
        window.addEventListener('click', (event) => {
            if (event.target === responseModal) { responseModal.style.display = 'none'; }
        });
    } else {
        console.error("Modal elements or monitor terminal body not found for setting up click listeners.");
    }

    if (launchAttackBtn) {
        const originalLaunchBtnText = launchAttackBtn.textContent;
        launchAttackBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            launchAttackBtn.disabled = true;
            launchAttackBtn.textContent = 'Launching...';

            attemptDetailsStore = {};
            completedAttemptsThisRun = 0;
            totalExpectedAttemptsForCurrentTest = 0;
            testStartTime = Date.now();
            if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
            elapsedTimeInterval = setInterval(updateTimers, 1000);
            if (elapsedTimeEl) elapsedTimeEl.textContent = '00:00:00';
            if (etaEl) etaEl.textContent = '--:--:--';

            let totalAttemptsForHUD = 0;
            let totalHitsForHUD = 0;
            if (attemptsCountEl) attemptsCountEl.textContent = totalAttemptsForHUD;
            if (hitsCountEl) hitsCountEl.textContent = totalHitsForHUD;

            const usernameFile = usernameListInput.files.length > 0 ? usernameListInput.files[0] : null;
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const targetPostUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';

            showUiStep('uiStep-Monitor');

            terminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
            if (terminalBody) {
                terminalBody.innerHTML = '';
            } else {
                console.error("Could not find active terminal body in Step Monitor for clearing.");
            }

            addLogMessage(`Initiating login attempts against ${targetPostUrl}...`, 'info', {logId: `init-log-${Date.now()}`});

            if (!usernameFile) {
                alert("Please select a username/email list file.");
                addLogMessage("Error: Username/Email list file not selected.", 'fail', {status: 'error', logId: `error-no-userfile-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                return;
            }
            if (usernameFile.type !== 'text/plain' && usernameFile.type !== 'text/csv') {
                alert("Invalid username file type. Please upload a .txt or .csv file.");
                if(usernameListInput) usernameListInput.value = '';
                if(selectedUsernameFileNameDisplay) selectedUsernameFileNameDisplay.textContent = 'No file selected.';
                addLogMessage("Error: Invalid username file type.", 'fail', {status: 'error', logId: `error-userfile-type-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                return;
            }
            if (usernameFile.size > 1 * 1024 * 1024) {
                alert("Username file is too large. Maximum size is 1MB.");
                addLogMessage("Error: Username file too large.", 'fail', {status: 'error', logId: `error-userfile-size-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                return;
            }
            if (!passwordFile) {
                alert("Password file not selected. Please select a password file.");
                addLogMessage("Error: Password file not selected.", 'fail', {status: 'error', logId: `error-nopassfile-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                return;
            }
            if (!targetPostUrl ||
                !passwordFieldName || passwordFieldName === 'Could not auto-detect' ||
                !usernameFieldName || usernameFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field Name, or Password Field Name) are missing or were not detected properly. Please ensure form analysis (Step 1 & 2) was successful and confirm the detected values.");
                addLogMessage("Error: Critical form parameters missing. Please re-analyze URL.", 'fail', {status: 'error', logId: `error-params-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-AnalysisReview');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                return;
            }

            addLogMessage(`Username Field: ${usernameFieldName}`, 'info', {logId: `info-userfield-${Date.now()}`});
            addLogMessage(`Password Field: ${passwordFieldName}`, 'info', {logId: `info-passfield-${Date.now()}`});

            let usernames = [];
            let passwords = [];

            try {
                addLogMessage(`Reading username file: ${usernameFile.name}...`, 'info', {logId: `info-read-userfile-${Date.now()}`});
                usernames = await readUsernamesFromFile(usernameFile);
                addLogMessage(`Successfully read ${usernames.length} username(s).`, 'info', {logId: `info-read-userfile-done-${Date.now()}`});

                addLogMessage(`Reading password file: ${passwordFile.name}...`, 'info', {logId: `info-read-passfile-${Date.now()}`});
                passwords = await readPasswordsFromFile(passwordFile);
                addLogMessage(`Successfully read ${passwords.length} password(s). Starting tests...`, 'info', {logId: `info-read-passfile-done-${Date.now()}`});

                const payload = {
                    target_post_url: targetPostUrl,
                    username_field_name: usernameFieldName,
                    password_field_name: passwordFieldName,
                    form_method: window.attackContext.formMethod || 'POST',
                    csrf_token_name: window.attackContext.csrfTokenName,
                    csrf_token_value: window.attackContext.csrfTokenValue,
                    cookies: window.attackContext.initialCookies,
                    username_list: usernames,
                    password_list: passwords
                };

                const response = await fetch(API_BASE_URL + '/test_credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json',},
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status} ${response.statusText || 'Unknown API Error'}` }));
                    throw new Error(errorData.error || `API Error: ${response.status} ${response.statusText || 'Unknown API Error'}`);
                }

                if (!response.body) {
                    throw new Error("Response body is null, cannot read stream.");
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                async function processStream() {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            console.log("Stream finished.");
                            if (buffer.trim()) {
                                processBuffer();
                            }
                            const activeTerminalBodyRef = document.querySelector('#uiStep-Monitor.active .terminal-body');
                            const terminalMessages = activeTerminalBodyRef ? activeTerminalBodyRef.querySelectorAll('p') : [];
                            const lastMessage = terminalMessages.length > 0 ? terminalMessages[terminalMessages.length-1].textContent : "";
                            if (!lastMessage.includes("All attempts finished") && !lastMessage.includes("server signal")) {
                                addLogMessage("Stream ended. All available results processed.", "info", {logId: `complete-stream-end-${Date.now()}`});
                            }
                             if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                            updateTimers();
                            if (etaEl) etaEl.textContent = 'Done';
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
                                    completedAttemptsThisRun = 0;
                                    console.log(`Total expected attempts for this run: ${totalExpectedAttemptsForCurrentTest}`);
                                    addLogMessage(result_item.message, 'info', {logId: `info-expected-${Date.now()}`});
                                } else if (result_item.status === 'complete') {
                                    addLogMessage(result_item.message || "All attempts finished (server signal).", "info", {logId: `complete-server-${Date.now()}`});
                                    if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
                                    updateTimers();
                                    if (etaEl) etaEl.textContent = 'Done';
                                } else {
                                    completedAttemptsThisRun++;
                                    totalAttemptsForHUD++;

                                    if (result_item.status === 'success') {
                                        totalHitsForHUD++;
                                    }
                                    if (attemptsCountEl) attemptsCountEl.textContent = totalAttemptsForHUD;
                                    if (hitsCountEl) hitsCountEl.textContent = totalHitsForHUD;

                                    const currentAttemptId = `logEntry-${totalAttemptsForHUD}`;

                                    const displayPassword = (result_item.password_actual || result_item.password || "").replace(/./g, '*');
                                    const clText = result_item.content_length !== undefined && result_item.content_length !== null ? result_item.content_length : 'N/A';
                                    const logDetail = `[${result_item.status.toUpperCase()}] User: ${result_item.username} / Pass: ${displayPassword} (CL: ${clText}) - ${result_item.details}`;

                                    attemptDetailsStore[currentAttemptId] = {
                                        request_details: result_item.request_details,
                                        response_body: result_item.response_body
                                    };

                                    addLogMessage(logDetail, result_item.status, {
                                        id: currentAttemptId,
                                        logId: currentAttemptId,
                                        status: result_item.status,
                                        contentLength: result_item.content_length
                                    });
                                }
                            } catch (e) {
                                console.error("Error parsing streamed JSON:", e, jsonDataString);
                                addLogMessage(`Error parsing streamed data: ${jsonDataString}`, 'error', {status: 'error', logId: `error-parse-${Date.now()}`});
                            }
                        }
                    }
                    buffer = sseMessages[sseMessages.length - 1];
                }
                await processStream();
            } catch (error) {
                console.error("Error during credential testing setup or API call:", error);
                addLogMessage(`Error: ${error.message}`, 'fail', {status: 'error', logId: `error-setup-${Date.now()}`});
                alert(`An error occurred: ${error.message}`);
                showUiStep('uiStep-CredentialsInput');
                if (elapsedTimeInterval) clearInterval(elapsedTimeInterval);
            } finally {
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                if (elapsedTimeInterval) {
                    clearInterval(elapsedTimeInterval);
                    updateTimers();
                    if (etaEl && (etaEl.textContent === '--:--:--' || etaEl.textContent === 'Calculating...')) {
                         etaEl.textContent = (completedAttemptsThisRun === totalExpectedAttemptsForCurrentTest && totalExpectedAttemptsForCurrentTest > 0) ? '00:00:00' : 'Stopped';
                    }
                }
            }
        });
    } else {
        console.error('Launch Attack button (launchAttackBtn) not found.');
    }

    // Initial UI Setup
    if (uiStepTargetURL) {
       showUiStep('uiStep-TargetURL');
    }
    if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';
    if (step2Options) step2Options.style.display = 'none';

});

[end of server/static/script.js]
