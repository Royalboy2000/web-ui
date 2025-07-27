// New simplified file upload interface that eliminates null pointer errors
function setupNewFileUpload() {
    console.log('Setting up new server-side file upload mechanism');

    // Create new upload interface
    const credentialsSection = document.querySelector('#step-3-content') ||
                              document.querySelector('[data-step="3"]') ||
                              document.querySelector('.credentials-section');

    if (credentialsSection) {
        // Add new upload interface HTML
        const uploadHTML = `
            <div class="server-upload-section" style="margin: 20px 0; padding: 20px; border: 2px dashed #4CAF50; border-radius: 8px; background: #f9f9f9;">
                <h3 style="color: #333; margin-bottom: 15px;">📁 Upload Credential File</h3>
                <p style="color: #666; margin-bottom: 15px;">Upload your credential file and we'll automatically extract the credentials on the server.</p>

                <div class="upload-area" style="text-align: center;">
                    <input type="file" id="server-credential-upload" accept=".txt,.csv" style="display: none;">
                    <button id="upload-btn" style="background: #4CAF50; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
                        Choose Credential File
                    </button>
                    <div id="upload-status" style="margin-top: 15px; font-weight: bold;"></div>
                    <div id="upload-preview" style="margin-top: 15px; padding: 10px; background: white; border-radius: 4px; display: none;"></div>
                </div>
            </div>
        `;

        // Insert the new upload interface
        credentialsSection.insertAdjacentHTML('afterbegin', uploadHTML);

        // Set up event handlers
        setupUploadHandlers();
    }
}

function setupUploadHandlers() {
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('server-credential-upload');
    const uploadStatus = document.getElementById('upload-status');
    const uploadPreview = document.getElementById('upload-preview');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                uploadCredentialFile(file, uploadStatus, uploadPreview);
            }
        });
    }
}

function uploadCredentialFile(file, statusElement, previewElement) {
    statusElement.textContent = '⏳ Uploading and processing file...';
    statusElement.style.color = '#2196F3';

    const formData = new FormData();
    formData.append('credential_file', file);

    fetch('/upload_credentials', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusElement.textContent = `✅ Successfully processed ${data.credentials_count} credentials from ${data.filename}`;
            statusElement.style.color = '#4CAF50';

            // Show preview
            showCredentialPreview(data, previewElement);

            // Store credentials for use in attack
            window.uploadedCredentials = data.all_credentials;

            // Update the combo file content for compatibility
            updateComboFileContent(data.all_credentials);

        } else {
            statusElement.textContent = `❌ Error: ${data.error}`;
            statusElement.style.color = '#f44336';
        }
    })
    .catch(error => {
        statusElement.textContent = `❌ Upload failed: ${error.message}`;
        statusElement.style.color = '#f44336';
        console.error('Upload error:', error);
    });
}

function showCredentialPreview(data, previewElement) {
    const preview = data.credentials.slice(0, 5); // Show first 5
    const previewHTML = `
        <h4>📋 Credential Preview (showing ${preview.length} of ${data.credentials_count}):</h4>
        <div style="font-family: monospace; font-size: 12px; max-height: 150px; overflow-y: auto;">
            ${preview.map(cred => `<div style="padding: 2px 0; border-bottom: 1px solid #eee;">
                <strong>${cred.username}</strong> : ${cred.password}
            </div>`).join('')}
        </div>
        <p style="margin-top: 10px; color: #666; font-size: 14px;">
            Total credentials loaded: <strong>${data.credentials_count}</strong>
        </p>
    `;

    previewElement.innerHTML = previewHTML;
    previewElement.style.display = 'block';
}

function updateComboFileContent(credentials) {
    // Update existing combo file textarea for compatibility
    const comboTextarea = document.getElementById('combo-file-content') ||
                         document.querySelector('textarea[placeholder*="combo"]') ||
                         document.querySelector('textarea[name*="combo"]');

    if (comboTextarea) {
        const comboContent = credentials.map(cred => `${cred.username}:${cred.password}`).join('\n');
        comboTextarea.value = comboContent;

        // Trigger change event for any existing handlers
        const changeEvent = new Event('change', { bubbles: true });
        comboTextarea.dispatchEvent(changeEvent);
    }
}

// Initialize the new upload interface when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for the page to fully load
    setTimeout(setupNewFileUpload, 1000);
});

// Also set up when navigating to New Scan
document.addEventListener('click', (event) => {
    if (event.target.textContent === 'New Scan' || event.target.closest('a[href*="scan"]')) {
        setTimeout(setupNewFileUpload, 500);
    }
});
