// Predator - Web Attack Panel Logic
// This script will handle the frontend interactions and logic for the attack panel.

const API_BASE_URL = 'http://127.0.0.1:5001';
window.attackContext = {}; // Used to store data between analysis and testing steps

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

            // Log initiation of analysis
            console.log(`Starting form analysis for URL: ${loginUrl}`);

            analyzeFormButton.querySelector('.btn-text').textContent = 'Analyzing...';
            analyzeFormButton.disabled = true;
            window.attackContext = {}; // Reset context

            try {
                const apiResponse = await fetch(API_BASE_URL + '/analyze_url', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: loginUrl }),
                });

                const analysis = await apiResponse.json();

                if (!apiResponse.ok) {
                    throw new Error(analysis.error || `API Error: ${apiResponse.status}`);
                }

                if (analysis.error) { // Handle errors reported by the API in a structured way
                    alert(`Analysis Error: ${analysis.error}`);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = '';
                } else {
                    console.log("Analysis successful:", analysis);
                    if (detectedUsernameFieldInput) detectedUsernameFieldInput.value = analysis.username_field_name || '';
                    if (detectedPasswordFieldInput) detectedPasswordFieldInput.value = analysis.password_field_name || '';
                    if (detectedPostUrlInput) detectedPostUrlInput.value = analysis.post_url || '';

                    // Store context for the next step
                    window.attackContext.formMethod = analysis.form_method;
                    window.attackContext.csrfTokenName = analysis.csrf_token_name;
                    window.attackContext.csrfTokenValue = analysis.csrf_token_value;
                    window.attackContext.initialCookies = analysis.cookies;
                    window.attackContext.analyzedUrl = loginUrl; // Store the URL that was analyzed
                }

            } catch (error) {
                console.error("Error during form analysis call:", error);
                alert(`Failed to analyze form: ${error.message}. Check console for details.`);
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

            const usernameValue = usernameInput ? usernameInput.value.trim() : ''; // Renamed for clarity
            const targetPostUrl = detectedPostUrlInput ? detectedPostUrlInput.value.trim() : '';
            const usernameFieldName = detectedUsernameFieldInput ? detectedUsernameFieldInput.value.trim() : '';
            const passwordFieldName = detectedPasswordFieldInput ? detectedPasswordFieldInput.value.trim() : '';
            const passwordFile = passwordListInput.files.length > 0 ? passwordListInput.files[0] : null;

            // Clear previous terminal messages
            if (terminalBody) terminalBody.innerHTML = '';

            addLogMessage(`Initiating login attempts for user "${usernameValue}" against ${targetPostUrl}...`, 'info');


            if (!passwordFile) {
                alert("Password file not selected. Please go back and select a password file.");
                addLogMessage("Error: Password file not selected. Please return to Step 1.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                // Switch back to step 1
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }

            if (!targetPostUrl ||
                !passwordFieldName || passwordFieldName === 'Could not auto-detect' ||
                !usernameFieldName || usernameFieldName === 'Could not auto-detect') {
                alert("Critical form parameters (POST URL, Username Field Name, or Password Field Name) are missing or were not detected properly. Please ensure form analysis was successful and confirm the detected values. Return to Step 1 to re-analyze if needed.");
                addLogMessage("Error: Critical form parameters missing or invalid. Check analysis results. Return to Step 1 to re-analyze.", 'fail');
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                if (step3Panel) step3Panel.classList.remove('active');
                if (step1Panel) step1Panel.classList.add('active');
                return;
            }

            // addLogMessage(`Target URL: ${targetPostUrl}`, 'info'); // Already logged by the new message
            addLogMessage(`Username Field: ${usernameFieldName}`, 'info');
            addLogMessage(`Password Field: ${passwordFieldName}`, 'info');
            // addLogMessage(`Username/Email: ${usernameValue}`, 'info'); // Already logged by the new message

            try {
                addLogMessage(`Reading passwords from ${passwordFile.name}...`, 'info');
                const passwords = await readPasswordsFromFile(passwordFile);
                addLogMessage(`Successfully read ${passwords.length} passwords. Starting tests...`, 'info');

                const attemptsCountEl = document.querySelector('#step3 .metrics-hud .hud-pod:nth-child(1) .hud-value');
                const hitsCountEl = document.querySelector('#step3 .metrics-hud .hud-pod:nth-child(2) .hud-value');

                let totalAttempts = 0;
                let totalHits = 0;

                if (attemptsCountEl) attemptsCountEl.textContent = totalAttempts;
                if (hitsCountEl) hitsCountEl.textContent = totalHits;

                const payload = {
                    target_post_url: targetPostUrl,
                    username_field_name: usernameFieldName,
                    password_field_name: passwordFieldName,
                    form_method: window.attackContext.formMethod || 'POST',
                    csrf_token_name: window.attackContext.csrfTokenName,
                    csrf_token_value: window.attackContext.csrfTokenValue,
                    cookies: window.attackContext.initialCookies,
                    username: usernameValue,
                    password_list: passwords
                };

                const apiResponse = await fetch(API_BASE_URL + '/test_credentials', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                });

                const results = await apiResponse.json();

                if (!apiResponse.ok) {
                    throw new Error(results.error || `API Error: ${apiResponse.status}`);
                }

                for (const result_item of results) {
                    totalAttempts++;
                    let displayPassword = result_item.password; // Show full password from backend if available
                    if (typeof displayPassword === 'string' && displayPassword.length > 2) {
                         // Mask if still desired, though backend now returns it
                         // displayPassword = `${displayPassword.substring(0,1)}***${displayPassword.substring(displayPassword.length-1)}`;
                    } else if (typeof displayPassword !== 'string') {
                        displayPassword = "N/A"; // Should not happen if backend sends string
                    }


                    addLogMessage(`[${result_item.status.toUpperCase()}] User: ${usernameValue} / Pass: ${displayPassword} - ${result_item.details}`, result_item.status);

                    if (result_item.status === 'success') {
                        totalHits++;
                    }
                    if (attemptsCountEl) attemptsCountEl.textContent = totalAttempts;
                    if (hitsCountEl) hitsCountEl.textContent = totalHits;

                    // Add a small delay for observable output, even though results come at once
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                addLogMessage("All credential tests finished.", 'info');

            } catch (error) {
                console.error("Error during password testing call:", error);
                addLogMessage(`Error: ${error.message}`, 'fail');
                alert(`An error occurred during credential testing: ${error.message}`);
            } finally {
                confirmAndProceedBtn.disabled = false;
                confirmAndProceedBtn.textContent = 'Confirm and Proceed';
                // User stays on Step 3 to see results
            }
        });
    } else {
        console.error('Confirm and proceed button not found.');
    }
});
