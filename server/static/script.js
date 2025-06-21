// Predator - Web Attack Panel Logic
// This script will handle the frontend interactions and logic for the attack panel.

const API_BASE_URL = 'http://127.0.0.1:5001';
window.attackContext = {}; // Used to store data between analysis and testing steps

document.addEventListener('DOMContentLoaded', () => {
    console.log('Predator script loaded and DOM fully parsed.');

    // Get references to DOM elements
    const loginUrlInput = document.getElementById('login-url');
    const analyzeFormButton = document.querySelector('.btn-analyze');

    const usernameListInput = document.getElementById('username-list-upload');
    const browseUsernameFilesButton = document.getElementById('browse-username-files-btn');
    const selectedUsernameFileNameDisplay = document.getElementById('selected-username-file-name');

    const passwordListInput = document.getElementById('password-list-upload');
    const browsePasswordFilesButton = document.getElementById('browse-files-btn');
    const selectedPasswordFileNameDisplay = document.getElementById('selected-password-file-name');

    const formAnalysisResultsPanel = document.getElementById('form-analysis-results');
    const detectedUsernameFieldInput = document.getElementById('detected-username-field');
    const detectedPasswordFieldInput = document.getElementById('detected-password-field');
    const detectedPostUrlInput = document.getElementById('detected-post-url');
    const confirmAndProceedBtn = document.getElementById('confirm-and-proceed-btn');

    const step1Panel = document.getElementById('step1');
    const step3Panel = document.getElementById('step3');

    // Terminal and filter elements (ensure these IDs exist in your HTML)
    let terminalBody = document.querySelector('#step3 .terminal-body'); // Query once step3 is active
    const filterAll = document.getElementById('filter-all');
    const filterHits = document.getElementById('filter-hits');
    const filterFails = document.getElementById('filter-fails');
    const filterContentLength = document.getElementById('filter-content-length');
    const terminalFilterElements = [filterAll, filterHits, filterFails, filterContentLength];


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
            console.error('File input or display element not found for setup:', { fileInput, displayElement });
        }
    }

    setupFileInputListener(usernameListInput, selectedUsernameFileNameDisplay, 'No file selected.');
    setupFileInputListener(passwordListInput, selectedPasswordFileNameDisplay, 'No password file selected.');

    // --- "Analyze Form" Button Click Logic ---
    if (analyzeFormButton) {
        const originalButtonText = analyzeFormButton.querySelector('.btn-text').textContent;

        analyzeFormButton.addEventListener('click', async (event) => {
            event.preventDefault();
            if(formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';

            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const loginUrl = loginUrlInput.value.trim();

            if (!passwordFile) { alert("Please select a password list file (used for context and required for testing step)."); return; }
            if (passwordFile.type !== 'text/plain' && passwordFile.type !== 'text/csv') {
                alert("Invalid password file type. Please upload a .txt or .csv file.");
                if(passwordListInput) passwordListInput.value = '';
                if(selectedPasswordFileNameDisplay) selectedPasswordFileNameDisplay.textContent = 'No password file selected.';
                return;
            }
            if (passwordFile.size > 5 * 1024 * 1024) {
                alert("Password file is too large. Maximum size is 5MB.");
                if(passwordListInput) passwordListInput.value = '';
                if(selectedPasswordFileNameDisplay) selectedPasswordFileNameDisplay.textContent = 'No password file selected.';
                return;
            }
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
                if (!apiResponse.ok) { throw new Error(analysis.error || `API Error: ${apiResponse.status} - ${apiResponse.statusText}`); }

                if (analysis.error) {
                    alert(`Analysis Error: ${analysis.error}`);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = '';
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
                    console.log("Form analysis complete. Detected parameters populated.");
                }
            } catch (error) {
                console.error("Error during form analysis call:", error);
                alert(`Failed to analyze form: ${error.message}. Check console for details, and ensure the backend server is running.`);
                if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                if (detectedPostUrlInput) detectedPostUrlInput.value = '';
            } finally {
                [detectedUsernameFieldInput, detectedPasswordFieldInput, detectedPostUrlInput].forEach(input => {
                    if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); }
                });
                if (formAnalysisResultsPanel) {
                    formAnalysisResultsPanel.style.display = 'block';
                    formAnalysisResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                analyzeFormButton.querySelector('.btn-text').textContent = originalButtonText;
                analyzeFormButton.disabled = false;
            }
        });
    } else {
        console.error('Analyze form button not found.');
    }

    // --- Helper function to add messages to the terminal ---
    function addLogMessage(message, type = 'info', dataAttributes = {}) {
        const currentTerminalBody = document.querySelector('#step3.active .terminal-body');
        if (!currentTerminalBody) {
            console.log(`[${type.toUpperCase()}] Log (Step 3 terminal not active/found): ${message}`);
            return;
        }
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString();

        const timeSpan = document.createElement('span');
        timeSpan.className = 'status-time';
        timeSpan.textContent = `[${time}] `; // Added space for separation
        p.appendChild(timeSpan);

        const msgSpan = document.createElement('span');
        msgSpan.textContent = message;

        if (type === 'success') msgSpan.className = 'status-success';
        else if (type === 'fail' || type === 'error') msgSpan.className = 'status-fail'; // Consolidate fail and error styles
        else msgSpan.className = 'status-info';

        p.appendChild(msgSpan);

        // Set data attributes
        for (const key in dataAttributes) {
            if (dataAttributes.hasOwnProperty(key) && dataAttributes[key] !== undefined && dataAttributes[key] !== null) {
                p.dataset[key] = dataAttributes[key];
            }
        }

        currentTerminalBody.appendChild(p);
        currentTerminalBody.scrollTop = currentTerminalBody.scrollHeight;
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

                const currentTerminalBody = document.querySelector('#step3.active .terminal-body');
                if (!currentTerminalBody) return;
                const logEntries = currentTerminalBody.querySelectorAll('p');

                logEntries.forEach(entry => {
                    let showEntry = false;
                    const status = entry.dataset.status;
                    // const contentLength = entry.dataset.contentLength; // For future use by content length filter

                    switch (activeFilterId) {
                        case 'filter-all':
                            showEntry = true;
                            break;
                        case 'filter-hits':
                            if (status === 'success') showEntry = true;
                            break;
                        case 'filter-fails':
                            if (status === 'failure' || status === 'error') showEntry = true;
                            break;
                        case 'filter-content-length':
                            // For now, behaves like 'ALL' as specific CL filtering not implemented
                            // This filter primarily ensures CL is visible in the log message itself
                            showEntry = true;
                            break;
                    }
                    entry.style.display = showEntry ? '' : 'none';
                });
            });
        }
    });

    // --- "Confirm and Proceed" Button Click Logic (Initiates Attack Simulation) ---
    if (confirmAndProceedBtn) {
        const originalConfirmBtnText = confirmAndProceedBtn.textContent;

        confirmAndProceedBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            confirmAndProceedBtn.disabled = true;
            confirmAndProceedBtn.textContent = 'Processing...';

            const usernameFile = usernameListInput.files.length > 0 ? usernameListInput.files[0] : null;
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const targetPostUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';

            // Activate Step 3 and deactivate Step 1 first
            if (step1Panel) step1Panel.classList.remove('active');
            if (step3Panel) step3Panel.classList.add('active');

            // Ensure terminalBody is the one in the active step 3
            const currentTerminalBody = document.querySelector('#step3.active .terminal-body');
            if (currentTerminalBody) {
                currentTerminalBody.innerHTML = ''; // Clear previous terminal messages
                terminalBody = currentTerminalBody; // Update the global-like terminalBody reference
            } else {
                console.error("Could not find active terminal body in Step 3 for clearing.");
            }

            addLogMessage(`Initiating login attempts against ${targetPostUrl}...`, 'info');

            if (!usernameFile) {
                alert("Please select a username/email list file.");
                addLogMessage("Error: Username/Email list file not selected. Please return to Step 1.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }
            if (usernameFile.type !== 'text/plain' && usernameFile.type !== 'text/csv') {
                alert("Invalid username file type. Please upload a .txt or .csv file.");
                if(usernameListInput) usernameListInput.value = '';
                if(selectedUsernameFileNameDisplay) selectedUsernameFileNameDisplay.textContent = 'No file selected.';
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }
            if (usernameFile.size > 1 * 1024 * 1024) { // 1MB limit
                alert("Username file is too large. Maximum size is 1MB.");
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }
            if (!passwordFile) {
                alert("Password file not selected. Please go back and select a password file.");
                addLogMessage("Error: Password file not selected. Please return to Step 1.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }
            if (!targetPostUrl ||
                !passwordFieldName || passwordFieldName === 'Could not auto-detect' ||
                !usernameFieldName || usernameFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field Name, or Password Field Name) are missing or were not detected properly. Please ensure form analysis was successful and confirm the detected values. Return to Step 1 to re-analyze if needed.");
                addLogMessage("Error: Critical form parameters missing. Check analysis results. Return to Step 1.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }

            addLogMessage(`Username Field: ${usernameFieldName}`, 'info');
            addLogMessage(`Password Field: ${passwordFieldName}`, 'info');

            let usernames = [];
            let passwords = [];
            const attemptsCountEl = document.querySelector('#step3.active .metrics-hud .hud-pod:nth-child(1) .hud-value');
            const hitsCountEl = document.querySelector('#step3.active .metrics-hud .hud-pod:nth-child(2) .hud-value');
            let totalAttempts = 0;
            let totalHits = 0;

            if (attemptsCountEl) attemptsCountEl.textContent = totalAttempts;
            if (hitsCountEl) hitsCountEl.textContent = totalHits;

            try {
                addLogMessage(`Reading username file: ${usernameFile.name}...`, 'info');
                usernames = await readUsernamesFromFile(usernameFile);
                addLogMessage(`Successfully read ${usernames.length} username(s).`, 'info');

                addLogMessage(`Reading password file: ${passwordFile.name}...`, 'info');
                passwords = await readPasswordsFromFile(passwordFile);
                addLogMessage(`Successfully read ${passwords.length} password(s). Starting tests...`, 'info');

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
                    const errorData = await response.json().catch(() => ({ error: `API Error: ${response.status} ${response.statusText}` }));
                    throw new Error(errorData.error || `API Error: ${response.status} ${response.statusText}`);
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
                            // Check if the last message was not a completion event, then add one.
                            // This is a fallback if the server stream ends before sending 'complete'.
                            const terminalMessages = currentTerminalBody ? currentTerminalBody.querySelectorAll('p') : [];
                            const lastMessage = terminalMessages.length > 0 ? terminalMessages[terminalMessages.length-1].textContent : "";
                            if (!lastMessage.includes("All attempts finished")) {
                                addLogMessage("Stream ended. All available results processed.", "info");
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
                                if (result_item.status === 'complete') {
                                    addLogMessage(result_item.message || "All attempts finished (server signal).", "info");
                                } else {
                                    totalAttempts++;
                                    if (result_item.status === 'success') {
                                        totalHits++;
                                    }
                                    if (attemptsCountEl) attemptsCountEl.textContent = totalAttempts;
                                    if (hitsCountEl) hitsCountEl.textContent = totalHits;

                                    const displayPassword = (result_item.password_actual || result_item.password || "").replace(/./g, '*');
                                    const clText = result_item.content_length !== undefined && result_item.content_length !== null ? result_item.content_length : 'N/A';
                                    const logDetail = `[${result_item.status.toUpperCase()}] User: ${result_item.username} / Pass: ${displayPassword} (CL: ${clText}) - ${result_item.details}`;

                                    addLogMessage(logDetail, result_item.status, {
                                        status: result_item.status,
                                        contentLength: result_item.content_length
                                    });
                                }
                            } catch (e) {
                                console.error("Error parsing streamed JSON:", e, jsonDataString);
                                addLogMessage(`Error parsing streamed data: ${jsonDataString}`, 'error', {status: 'error'});
                            }
                        }
                    }
                    buffer = sseMessages[sseMessages.length - 1];
                }

                await processStream();

            } catch (error) {
                console.error("Error during credential testing setup or API call:", error);
                addLogMessage(`Error: ${error.message}`, 'fail', {status: 'error'}); // Ensure error logs also get a status
                alert(`An error occurred: ${error.message}`);
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
            } finally {
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = originalConfirmBtnText;
            }
        });
    } else {
        console.error('Confirm and proceed button not found.');
    }
});
