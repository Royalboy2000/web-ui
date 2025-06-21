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
    const step2Options = document.getElementById('step2-options'); // The old step 2, now for advanced options

    // Buttons
    const analyzeFormButton = document.getElementById('analyzeFormButton');
    const proceedToCredentialsBtn = document.getElementById('proceedToCredentialsBtn');
    const launchAttackBtn = document.getElementById('launchAttackBtn');

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

    // HUD Elements (ensure these IDs are in index.html)
    const attemptsCountEl = document.getElementById('hud-total-attempts');
    const hitsCountEl = document.getElementById('hud-hits');
    // const elapsedTimeEl = document.getElementById('hud-elapsed-time'); // For future use
    // const etaEl = document.getElementById('hud-eta'); // For future use

    // Terminal and filter elements
    let terminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
    const filterAll = document.getElementById('filter-all');
    const filterHits = document.getElementById('filter-hits');
    const filterFails = document.getElementById('filter-fails');
    const filterContentLength = document.getElementById('filter-content-length');
    const filterResponse = document.getElementById('filter-response');
    const terminalFilterElements = [filterAll, filterHits, filterFails, filterContentLength, filterResponse];

    // Modal DOM References
    const responseModal = document.getElementById('responseModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalRequestDetails = document.getElementById('modalRequestDetails');
    const modalResponseBody = document.getElementById('modalResponseBody');

    // --- Helper Function for Step Navigation ---
    function showUiStep(stepIdToShow) {
        const allSteps = [uiStepTargetURL, uiStepAnalysisReview, uiStepCredentialsInput, uiStepMonitor, step2Options];
        allSteps.forEach(step => {
            if (step) {
                step.style.display = (step.id === stepIdToShow) ? 'block' : 'none';
                step.classList.remove('active'); // Remove active from all
                if (step.id === stepIdToShow) {
                    step.classList.add('active'); // Add active to the one being shown
                }
            }
        });
        // Ensure terminalBody reference is updated if monitor step is shown
        if (stepIdToShow === 'uiStep-Monitor') {
            terminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
        }
    }

    // --- File Input "Browse" Button Functionality ---
    if (browseUsernameFilesButton && usernameListInput) {
        browseUsernameFilesButton.addEventListener('click', () => usernameListInput.click());
    } else {
        console.error('Username browse button or file input not found.');
    }

    if (browsePasswordFilesButton && passwordListInput) {
        browsePasswordFilesButton.addEventListener('click', () => passwordListInput.click());
    } else {
        console.error('Password browse button or file input not found.');
    }

    // --- File Selection Display Functionality ---
    function setupFileInputListener(fileInput, displayElement, defaultText) {
        if (fileInput && displayElement) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files.length > 0) {
                    displayElement.textContent = fileInput.files[0].name;
                } else {
                    displayElement.textContent = defaultText;
                }
            });
        } else {
            console.error('File input or display element for setup not found:', { fileInputId: fileInput ? fileInput.id : 'N/A', displayElementId: displayElement ? displayElement.id : 'N/A' });
        }
    }

    setupFileInputListener(usernameListInput, selectedUsernameFileNameDisplay, 'No file selected.');
    setupFileInputListener(passwordListInput, selectedPasswordFileNameDisplay, 'No password file selected.');

    // --- "Analyze Form" Button Click Logic ---
    if (analyzeFormButton) {
        const originalButtonText = analyzeFormButton.querySelector('.btn-text').textContent;
        const spinner = analyzeFormButton.querySelector('.spinner');

        analyzeFormButton.addEventListener('click', async (event) => {
            event.preventDefault();
            if(formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none'; // Hide previous results

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

                if (!apiResponse.ok) {
                    throw new Error(analysis.error || `API Error: ${apiResponse.status} - ${apiResponse.statusText || 'Unknown error'}`);
                }

                if (analysis.error) {
                    alert(`Analysis Error: ${analysis.error}`);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                    showUiStep('uiStep-TargetURL'); // Stay on current step if analysis fails
                } else {
                    console.log("Analysis successful:", analysis);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = analysis.username_field_name || '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = analysis.password_field_name || '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = analysis.post_url || '';

                    window.attackContext.formMethod = analysis.form_method;
                    window.attackContext.csrfTokenName = analysis.csrf_token_name;
                    window.attackContext.csrfTokenValue = analysis.csrf_token_value;
                    window.attackContext.initialCookies = analysis.cookies;
                    window.attackContext.analyzedUrl = loginUrl;

                    if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'block';
                    showUiStep('uiStep-AnalysisReview'); // Move to review step
                    console.log("Form analysis complete. Detected parameters populated.");
                }
            } catch (error) {
                console.error("Error during form analysis call:", error);
                alert(`Failed to analyze form: ${error.message}. Check console and ensure backend server is running.`);
                if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                showUiStep('uiStep-TargetURL'); // Stay on current step
            } finally {
                [detectedUsernameFieldInput, detectedPasswordFieldInput, detectedPostUrlInput].forEach(input => {
                    if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); }
                });
                // formAnalysisResultsPanel display is handled by success/error logic now
                if(spinner) spinner.style.display = 'none';
                analyzeFormButton.querySelector('.btn-text').textContent = originalButtonText;
                analyzeFormButton.disabled = false;
            }
        });
    } else {
        console.error('Analyze form button not found.');
    }

    // --- "Proceed to Credentials" Button Click Logic ---
    if (proceedToCredentialsBtn) {
        proceedToCredentialsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            console.log("Proceeding to credentials input step.");
            showUiStep('uiStep-CredentialsInput');
        });
    } else {
        console.error("Proceed to Credentials button not found.");
    }

    // --- Helper function to add messages to the terminal ---
    function addLogMessage(message, type = 'info', dataAttributes = {}) {
        const currentActiveTerminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
        if (!currentActiveTerminalBody) {
            // If step 3 is not active, log to console. This might happen for initial messages
            // if confirmAndProceedBtn is clicked before step3 is fully active (though unlikely with current flow).
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

        if (dataAttributes.id) {
            p.id = dataAttributes.id;
        }
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
            if (!file) {
                reject(new Error("No username file provided to reader."));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const usernames = content.split('\n').map(u => u.trim()).filter(u => u);
                if (usernames.length === 0) {
                    reject(new Error("Username file is empty or does not contain valid usernames. Each username should be on a new line."));
                } else {
                    resolve(usernames);
                }
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
            if (!file) {
                reject(new Error("No password file provided to reader."));
                return;
            }
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

    // --- Terminal Filter Logic ---
    terminalFilterElements.forEach(filterElement => {
        if (filterElement) {
            filterElement.addEventListener('click', (event) => {
                terminalFilterElements.forEach(el => el && el.classList.remove('active'));
                event.currentTarget.classList.add('active');
                const activeFilterId = event.currentTarget.id;

                const currentActiveTerminalBody = document.querySelector('#uiStep-Monitor.active .terminal-body');
                if (!currentActiveTerminalBody) return;
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
            });
        }
    });

    // --- Modal Click Logic ---
    // Ensure terminalBody for event delegation is specifically the one in uiStep-Monitor
    const monitorTerminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
    if (monitorTerminalBody && responseModal && modalRequestDetails && modalResponseBody && modalCloseBtn) {
        monitorTerminalBody.addEventListener('click', (event) => {
            const clickedP = event.target.closest('p[data-log-id]');
            if (clickedP) {
                const logId = clickedP.dataset.logId;
                if (attemptDetailsStore[logId] && attemptDetailsStore[logId].request_details !== undefined) { // Check if it's an attempt log
                    const details = attemptDetailsStore[logId];
                    modalRequestDetails.textContent = JSON.stringify(details.request_details, null, 2);
                    modalResponseBody.textContent = details.response_body || "No response body captured or applicable.";
                    responseModal.style.display = 'block';
                } else {
                    console.warn(`No detailed data in store for logId: ${logId}. Entry:`, clickedP.textContent);
                    // Optionally, do not open modal for non-detailed logs, or show a simpler message
                    // For now, we allow opening but it will show "No details available"
                    modalRequestDetails.textContent = "No request details available for this log entry.";
                    modalResponseBody.textContent = "No response body available for this log entry (this might be an informational message).";
                    responseModal.style.display = 'block';
                }
            }
        });

        modalCloseBtn.addEventListener('click', () => {
            responseModal.style.display = 'none';
        });

        window.addEventListener('click', (event) => {
            if (event.target === responseModal) {
                responseModal.style.display = 'none';
            }
        });
    } else {
        console.error("Modal elements or monitor terminal body not found for setting up click listeners.");
    }

    // --- "Launch Attack" Button Click Logic (was Confirm and Proceed) ---
    if (launchAttackBtn) {
        const originalLaunchBtnText = launchAttackBtn.textContent;

        launchAttackBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            launchAttackBtn.disabled = true;
            launchAttackBtn.textContent = 'Launching...';

            attemptDetailsStore = {}; // Clear details from previous run

            const usernameFile = usernameListInput.files.length > 0 ? usernameListInput.files[0] : null;
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const targetPostUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';

            // Ensure terminalBody is correctly referenced for the monitor step before logging
            terminalBody = document.querySelector('#uiStep-Monitor .terminal-body');
            if (terminalBody) {
                terminalBody.innerHTML = '';
            } else {
                console.error("Could not find terminal body in Step Monitor for clearing.");
            }

            addLogMessage(`Initiating login attempts against ${targetPostUrl}...`, 'info', {logId: `init-log-${Date.now()}`});

            if (!usernameFile) {
                alert("Please select a username/email list file.");
                addLogMessage("Error: Username/Email list file not selected.", 'fail', {status: 'error', logId: `error-no-userfile-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput'); // Stay on credentials input step
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
                return;
            }
            if (usernameFile.size > 1 * 1024 * 1024) {
                alert("Username file is too large. Maximum size is 1MB.");
                addLogMessage("Error: Username file too large.", 'fail', {status: 'error', logId: `error-userfile-size-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                return;
            }
            if (!passwordFile) {
                alert("Password file not selected. Please select a password file.");
                addLogMessage("Error: Password file not selected.", 'fail', {status: 'error', logId: `error-nopassfile-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-CredentialsInput');
                return;
            }
            if (!targetPostUrl ||
                !passwordFieldName || passwordFieldName === 'Could not auto-detect' ||
                !usernameFieldName || usernameFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field Name, or Password Field Name) are missing or were not detected properly. Please ensure form analysis (Step 1 & 2) was successful and confirm the detected values.");
                addLogMessage("Error: Critical form parameters missing. Please re-analyze URL.", 'fail', {status: 'error', logId: `error-params-${Date.now()}`});
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
                showUiStep('uiStep-AnalysisReview'); // Go back to review step
                return;
            }

            showUiStep('uiStep-Monitor'); // Transition to monitor view *before* starting async operations that log
            addLogMessage(`Username Field: ${usernameFieldName}`, 'info', {logId: `info-userfield-${Date.now()}`});
            addLogMessage(`Password Field: ${passwordFieldName}`, 'info', {logId: `info-passfield-${Date.now()}`});

            let usernames = [];
            let passwords = [];
            // Ensure HUD elements are queried based on the active step if necessary, or ensure IDs are unique
            const currentAttemptsCountEl = document.getElementById('hud-total-attempts');
            const currentHitsCountEl = document.getElementById('hud-hits');
            let totalAttempts = 0;
            let totalHits = 0;

            if (currentAttemptsCountEl) currentAttemptsCountEl.textContent = totalAttempts;
            if (currentHitsCountEl) currentHitsCountEl.textContent = totalHits;

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
                                const currentAttemptId = `logEntry-${totalAttempts + 1}`;

                                if (result_item.status === 'complete') {
                                    addLogMessage(result_item.message || "All attempts finished (server signal).", "info", {logId: `complete-server-${Date.now()}`});
                                } else {
                                    totalAttempts++;
                                    if (result_item.status === 'success') {
                                        totalHits++;
                                    }
                                    if (currentAttemptsCountEl) currentAttemptsCountEl.textContent = totalAttempts;
                                    if (currentHitsCountEl) currentHitsCountEl.textContent = totalHits;

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
                showUiStep('uiStep-CredentialsInput'); // Revert to credential input on error
            } finally {
                launchAttackBtn.disabled = false;
                launchAttackBtn.textContent = originalLaunchBtnText;
            }
        });
    } else {
        console.error('Launch Attack button (confirmAndProceedBtn) not found.');
    }

    // Initial UI Setup
    if (uiStepTargetURL) {
       showUiStep('uiStep-TargetURL');
    }
    if (formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';
    if (step2Options) step2Options.style.display = 'none'; // Ensure advanced options are hidden

});
