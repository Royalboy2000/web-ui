// Predator - Web Attack Panel Logic
// This script will handle the frontend interactions and logic for the attack panel.

document.addEventListener('DOMContentLoaded', () => {
    console.log('Predator script loaded and DOM fully parsed.');

    // Get references to DOM elements
    const loginUrlInput = document.getElementById('login-url');
    const analyzeFormButton = document.querySelector('.btn-analyze');

    // Username input field (new)
    const usernameInput = document.getElementById('username-input');

    // Commented out old username file upload elements
    // const usernameListInput = document.getElementById('username-list-upload');
    // const browseUsernameFilesButton = document.getElementById('browse-username-files-btn');
    // const selectedUsernameFileNameDisplay = document.getElementById('selected-username-file-name');

    const passwordListInput = document.getElementById('password-list-upload');
    const browsePasswordFilesButton = document.getElementById('browse-files-btn');
    const selectedPasswordFileNameDisplay = document.getElementById('selected-password-file-name');

    // New DOM references for analysis results panel
    const formAnalysisResultsPanel = document.getElementById('form-analysis-results');
    const detectedUsernameFieldInput = document.getElementById('detected-username-field');
    const detectedPasswordFieldInput = document.getElementById('detected-password-field');
    const detectedPostUrlInput = document.getElementById('detected-post-url');
    const confirmAndProceedBtn = document.getElementById('confirm-and-proceed-btn');

    // --- File Input "Browse" Button Functionality ---
    // Commented out old username file browse button listener
    // if (browseUsernameFilesButton && usernameListInput) {
    //     browseUsernameFilesButton.addEventListener('click', () => {
    //         usernameListInput.click();
    //     });
    // } else {
    //     console.error('Username browse button or file input not found.');
    // }

    if (browsePasswordFilesButton && passwordListInput) {
        browsePasswordFilesButton.addEventListener('click', () => {
            passwordListInput.click();
        });
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
            console.error('File input or display element not found for setup:', fileInput, displayElement);
        }
    }

    // Commented out old username file input listener
    // setupFileInputListener(usernameListInput, selectedUsernameFileNameDisplay, 'No file selected.');
    setupFileInputListener(passwordListInput, selectedPasswordFileNameDisplay, 'No password file selected.');

    // --- "Analyze Form" Button Click Logic ---
    if (analyzeFormButton) {
        const originalButtonText = analyzeFormButton.querySelector('.btn-text').textContent; // Get text from span

        analyzeFormButton.addEventListener('click', async (event) => {
            event.preventDefault();

            // Hide analysis results panel if already visible from a previous run
            if(formAnalysisResultsPanel) formAnalysisResultsPanel.style.display = 'none';


            const usernameValue = usernameInput ? usernameInput.value.trim() : '';
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;
            const loginUrl = loginUrlInput.value.trim();

            if (!usernameValue) { alert("Please enter a username or email."); return; }
            if (!passwordFile) { alert("Please select a password list file."); return; }

            // Password file validation
            if (passwordFile.type !== 'text/plain' && passwordFile.type !== 'text/csv') {
                alert("Invalid password file type. Please upload a .txt or .csv file.");
                // Reset file input to allow re-selection of the same file if needed after an error
                if(passwordListInput) passwordListInput.value = '';
                if(selectedPasswordFileNameDisplay) selectedPasswordFileNameDisplay.textContent = 'No password file selected.';
                return;
            }

            if (passwordFile.size > 5 * 1024 * 1024) { // 5MB limit
                alert("Password file is too large. Maximum size is 5MB.");
                if(passwordListInput) passwordListInput.value = '';
                if(selectedPasswordFileNameDisplay) selectedPasswordFileNameDisplay.textContent = 'No password file selected.';
                return;
            }

            if (!loginUrl) { alert("Please enter the login URL."); return; }
            try {
                const url = new URL(loginUrl);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    alert('Invalid login URL. Must start with http:// or https://'); return;
                }
            } catch (e) {
                alert("Invalid login URL format. Please enter a full URL (e.g., https://example.com/login)."); return;
            }

            // Log initiation of analysis
            console.log(`Starting form analysis for URL: ${loginUrl}`);
            // console.log("Initial validation successful."); // This can be kept if more detailed pre-analysis logs are desired
            // console.log("Username value:", usernameValue);
            // console.log("Password file:", passwordFile.name);
            // console.log("Login URL:", loginUrl);

            analyzeFormButton.querySelector('.btn-text').textContent = 'Analyzing...';
            analyzeFormButton.disabled = true;

            try {
                console.log("Attempting to fetch target page content from:", loginUrl); // Clarified log
                const response = await fetch(loginUrl, { mode: 'cors', redirect: 'follow' }); // Added redirect: 'follow'

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                }

                const htmlText = await response.text();
                console.log("Fetched HTML (first 500 chars):", htmlText.substring(0, 500));

                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');

                const passwordInput = doc.querySelector('input[type="password"]');
                let loginForm = null;
                if (passwordInput) {
                    loginForm = passwordInput.closest('form');
                }

                if (loginForm) {
                    console.log("Login form found:", loginForm);
                    const detectedPostUrlValue = new URL(loginForm.getAttribute('action') || '', loginUrl).href;
                    const detectedPasswordFieldValue = passwordInput.getAttribute('name') || passwordInput.getAttribute('id') || '';

                    // Attempt to find username field (heuristic)
                    let detectedUsernameFieldValue = '';
                    // Common names for username fields
                    const usernameSelectors = [
                        'input[name="username"]', 'input[name="email"]', 'input[name="user"]',
                        'input[name="login"]', 'input[id="username"]', 'input[id="email"]',
                        'input[type="text"]', 'input[type="email"]' // More generic, last resort
                    ];
                    for (const selector of usernameSelectors) {
                        const userInput = loginForm.querySelector(selector);
                        if (userInput && userInput !== passwordInput) { // Ensure it's not the password field itself
                             // Prioritize inputs closer to the password field if multiple generic inputs are found
                            if (selector === 'input[type="text"]' || selector === 'input[type="email"]') {
                                let currentElement = passwordInput;
                                let sibling = currentElement.previousElementSibling;
                                while(sibling) {
                                    if(sibling === userInput) {
                                        detectedUsernameFieldValue = userInput.getAttribute('name') || userInput.getAttribute('id') || '';
                                        break;
                                    }
                                    sibling = sibling.previousElementSibling;
                                }
                                if(detectedUsernameFieldValue) break;
                            } else {
                                detectedUsernameFieldValue = userInput.getAttribute('name') || userInput.getAttribute('id') || '';
                                break;
                            }
                        }
                    }
                     if (!detectedUsernameFieldValue) { // Fallback if specific selectors fail, try any text/email input in form not password
                        const textInputs = Array.from(loginForm.querySelectorAll('input[type="text"], input[type="email"]'));
                        const firstNonPasswordText = textInputs.find(inp => inp !== passwordInput && (inp.getAttribute('name') || inp.getAttribute('id')));
                        if (firstNonPasswordText) {
                            detectedUsernameFieldValue = firstNonPasswordText.getAttribute('name') || firstNonPasswordText.getAttribute('id') || 'Could not auto-detect';
                        } else {
                             detectedUsernameFieldValue = 'Could not auto-detect';
                        }
                    }


                    console.log("Detected POST URL:", detectedPostUrlValue);
                    console.log("Detected Username Field:", detectedUsernameFieldValue);
                    console.log("Detected Password Field:", detectedPasswordFieldValue);

                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = detectedUsernameFieldValue;
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = detectedPasswordFieldValue;
                    if (detectedPostUrlInput) detectedPostUrlInput.value = detectedPostUrlValue;

                } else {
                    alert("No login form with a password field could be automatically detected on the page. Please check the URL or enter parameters manually.");
                    // Clear previous results if any
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                }

            } catch (error) {
                console.error("Error during form analysis:", error);
                alert("Could not fetch or analyze the login page. This might be due to network issues, CORS restrictions, or an invalid URL. For accurate analysis of cross-domain targets, a server-side proxy is often required. Error: " + error.message);
                // Clear previous results if any
                if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                if (detectedPostUrlInput) detectedPostUrlInput.value = '';
            } finally {
                // Populate and display the results panel (even if some fields are empty or show errors)
                [detectedUsernameFieldInput, detectedPasswordFieldInput, detectedPostUrlInput].forEach(input => {
                    if (input) {
                        const event = new Event('input', { bubbles: true });
                        input.dispatchEvent(event); // For floating labels
                    }
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
    const terminalBody = document.querySelector('.terminal-body'); // Assuming step 3 is already in DOM
    function addLogMessage(message, type = 'info') {
        if (!terminalBody) {
            console.error("Terminal body not found for logging. Ensure Step 3 is in the DOM.");
            // Fallback to console if terminal is not ready (e.g. if called before step3 is shown)
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString();
        p.innerHTML = `<span class="status-time">[${time}]</span>`;

        const msgSpan = document.createElement('span');
        msgSpan.textContent = message; // Text content for security

        if (type === 'success') msgSpan.className = 'status-success';
        else if (type === 'fail') msgSpan.className = 'status-fail';
        else msgSpan.className = 'status-info';

        p.appendChild(msgSpan);
        terminalBody.appendChild(p);
        terminalBody.scrollTop = terminalBody.scrollHeight;
    }

    // --- Function to read passwords from a file ---
    function readPasswordsFromFile(file) {
        return new Promise((resolve, reject) => {
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
                console.error("FileReader error:", e);
                reject(new Error("An error occurred while reading the password file."));
            };
            reader.readAsText(file);
        });
    }

    // --- "Confirm and Proceed" Button Click Logic (Initiates Attack Simulation) ---
    if (confirmAndProceedBtn) {
        confirmAndProceedBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            confirmAndProceedBtn.disabled = true;
            confirmAndProceedBtn.textContent = 'Processing...';

            // Activate Step 3 and deactivate Step 1
            const step1Panel = document.getElementById('step1');
            const step3Panel = document.getElementById('step3');
            if (step1Panel) step1Panel.classList.remove('active');
            if (step3Panel) step3Panel.classList.add('active');
            // terminalBody is queried at the start of DOMContentLoaded.
            // It should be available once step3Panel is made active.

            const username = usernameInput ? usernameInput.value.trim() : '';
            const postUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;

            addLogMessage("Preparing for attack simulation...", 'info');

            if (!passwordFile) {
                alert("Password file not selected. Please go back and select a password file.");
                addLogMessage("Error: Password file not selected.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                // Optionally switch back to step 1
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }

            if (!postUrl ||
                !passwordFieldName || passwordFieldName === 'Could not auto-detect' ||
                !usernameFieldName || usernameFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field Name, or Password Field Name) are missing or were not detected properly. Please ensure form analysis was successful and confirm the detected values.");
                addLogMessage("Error: Critical form parameters missing or invalid. Check analysis results.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }

            addLogMessage(`Target URL: ${postUrl}`, 'info');
            addLogMessage(`Username Field: ${usernameFieldName}`, 'info');
            addLogMessage(`Password Field: ${passwordFieldName}`, 'info');
            addLogMessage(`Username/Email: ${username}`, 'info');


            try {
                addLogMessage(`Reading passwords from ${passwordFile.name}...`, 'info');
                const passwords = await readPasswordsFromFile(passwordFile);
                addLogMessage(`Successfully read ${passwords.length} passwords. Starting simulation...`, 'info');

                const attemptsCountEl = document.querySelector('#step3 .metrics-hud .hud-pod:nth-child(1) .hud-value');
                const hitsCountEl = document.querySelector('#step3 .metrics-hud .hud-pod:nth-child(2) .hud-value');
                // Fails count can be derived or logged directly. The current HTML doesn't have a dedicated "FAILS" counter in HUD.

                let attempts = 0;
                let hits = 0;

                if (attemptsCountEl) attemptsCountEl.textContent = attempts;
                if (hitsCountEl) hitsCountEl.textContent = hits;


                for (const password of passwords) {
                    attempts++;
                    // SIMULATING LOGIN ATTEMPT DUE TO CLIENT-SIDE CORS LIMITATIONS
                    // In a real scenario, this would be an actual fetch POST request:
                    // const formData = new FormData();
                    // formData.append(usernameFieldName, username);
                    // formData.append(passwordFieldName, password);
                    // try {
                    //   const response = await fetch(postUrl, { method: 'POST', body: formData, mode: 'no-cors' }); // no-cors for opaque response
                    //   // Check response.status or response.ok if not opaque. For opaque, can't know success/fail from client.
                    // } catch (e) { addLogMessage(`Network error during attempt for ${password}: ${e.message}`, 'fail'); }

                    addLogMessage(`[ATTEMPT ${attempts}] Trying ${username} / ${password.substring(0,1)}***${password.substring(password.length-1)}`, 'info');


                    // Simulate success/failure for demonstration
                    if (password === 'P@ssw0rd!_2025') { // Example password from original HTML comments
                        hits++;
                        addLogMessage(`[HIT] Credentials accepted: ${username} / ${password}`, 'success');
                         if (hitsCountEl) hitsCountEl.textContent = hits;
                    } else {
                        addLogMessage(`[FAIL] Credentials rejected: ${username} / ${password.substring(0,1)}***${password.substring(password.length-1)}`, 'fail');
                    }

                    if (attemptsCountEl) attemptsCountEl.textContent = attempts;

                    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay for simulation visibility
                }
                addLogMessage("Attack simulation finished.", 'info');

            } catch (error) {
                console.error("Error during password testing:", error);
                addLogMessage(`Error: ${error.message}`, 'fail');
                alert(`An error occurred: ${error.message}`);
            } finally {
                confirmAndProceedBtn.disabled = false; // Re-enable after loop
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                // User stays on Step 3 to see results
            }
        });
    } else {
        console.error('Confirm and proceed button not found.');
    }
});
