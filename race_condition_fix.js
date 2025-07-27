// Race Condition and Upload Interface Fixes for Stryker Web UI

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

// Fixed file upload interface for Step 3 (Credentials)
function createCredentialsStepUpload() {
    const credentialsSection = document.querySelector('#step-3-credentials, .credentials-section');
    if (!credentialsSection) {
        console.warn('Credentials section not found');
        return;
    }

    // Remove any existing upload interfaces to prevent duplicates
    const existingUploads = credentialsSection.querySelectorAll('.file-upload-interface');
    existingUploads.forEach(el => el.remove());

    // Create new upload interface
    const uploadInterface = document.createElement('div');
    uploadInterface.className = 'file-upload-interface';
    uploadInterface.innerHTML = `
        <div class="upload-section">
            <h4>📁 Upload Credential File</h4>
            <p>Upload your credential file and we'll automatically extract the credentials on the server.</p>

            <div class="upload-area" id="upload-area">
                <input type="file" id="credential-file-input" accept=".txt,.csv" style="display: none;">
                <button type="button" class="upload-btn file-upload-btn" onclick="document.getElementById('credential-file-input').click()">
                    Choose Credential File
                </button>
                <div class="upload-status" id="upload-status" style="display: none;">
                    <span class="file-name"></span>
                    <span class="credential-count"></span>
                </div>
            </div>

            <div class="upload-progress" id="upload-progress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">Uploading...</span>
            </div>

            <div class="credential-preview" id="credential-preview" style="display: none;">
                <h5>Preview (first 5 credentials):</h5>
                <ul class="preview-list"></ul>
            </div>
        </div>

        <div class="divider">
            <span>OR</span>
        </div>
    `;

    // Insert at the beginning of credentials section
    credentialsSection.insertBefore(uploadInterface, credentialsSection.firstChild);

    // Add event listener for file selection
    const fileInput = document.getElementById('credential-file-input');
    fileInput.addEventListener('change', handleFileUpload);
}

// Fixed file upload handler with proper state management
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check state before proceeding
    if (StrykerState.currentState === 'RUNNING') {
        alert('Cannot upload files during an active attack. Please wait for the attack to complete.');
        return;
    }

    StrykerState.uploadInProgress = true;

    const uploadStatus = document.getElementById('upload-status');
    const uploadProgress = document.getElementById('upload-progress');
    const credentialPreview = document.getElementById('credential-preview');

    // Show upload progress
    uploadProgress.style.display = 'block';
    uploadStatus.style.display = 'none';
    credentialPreview.style.display = 'none';

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('credential_file', file);

    // Upload file to server
    fetch('/upload_credentials', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('Upload successful:', data);

        // Hide progress, show status
        uploadProgress.style.display = 'none';
        uploadStatus.style.display = 'block';

        // Update status display
        const fileName = uploadStatus.querySelector('.file-name');
        const credentialCount = uploadStatus.querySelector('.credential-count');
        fileName.textContent = `📄 ${file.name}`;
        credentialCount.textContent = `✅ ${data.credential_count} credentials loaded`;

        // Show preview if available
        if (data.preview && data.preview.length > 0) {
            credentialPreview.style.display = 'block';
            const previewList = credentialPreview.querySelector('.preview-list');
            previewList.innerHTML = '';

            data.preview.slice(0, 5).forEach(cred => {
                const li = document.createElement('li');
                li.textContent = `${cred.username}:${cred.password}`;
                previewList.appendChild(li);
            });
        }

        // Populate the auth file content field if it exists
        const authFileTextarea = document.querySelector('#auth-file-content, textarea[placeholder*="combo"], textarea[placeholder*="credential"]');
        if (authFileTextarea && data.raw_content) {
            authFileTextarea.value = data.raw_content;
        }

        StrykerState.uploadInProgress = false;
    })
    .catch(error => {
        console.error('Upload failed:', error);

        // Hide progress, show error
        uploadProgress.style.display = 'none';
        uploadStatus.style.display = 'block';

        const fileName = uploadStatus.querySelector('.file-name');
        const credentialCount = uploadStatus.querySelector('.credential-count');
        fileName.textContent = `❌ Upload failed: ${file.name}`;
        credentialCount.textContent = `Error: ${error.message}`;

        StrykerState.uploadInProgress = false;
    });
}

// Fixed attack launch with proper state management
function fixedHandleLaunchAttack() {
    // Prevent launch if upload in progress
    if (StrykerState.uploadInProgress) {
        alert('Please wait for file upload to complete before launching attack.');
        return;
    }

    // Set state to running
    StrykerState.setState('RUNNING');

    // Hide any upload dialogs that might be open
    StrykerState.hideUploadDialog();

    // Continue with original attack launch logic...
    // (This would integrate with the existing handleLaunchAttack function)
}

// Initialize the fixed upload interface when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize state management
    StrykerState.setState('IDLE');

    // Create upload interface in credentials step
    setTimeout(createCredentialsStepUpload, 1000); // Delay to ensure DOM is ready

    // Override existing attack launch function
    const originalLaunchBtn = document.querySelector('.launch-attack-btn, button[onclick*="launch"]');
    if (originalLaunchBtn) {
        originalLaunchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fixedHandleLaunchAttack();
        });
    }

    console.log('✅ Race condition fixes and upload interface initialized');
});

// CSS styles for the upload interface
const uploadStyles = `
<style>
.file-upload-interface {
    background: #2a3441;
    border: 1px solid #3a4651;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 20px;
}

.upload-section h4 {
    color: #ffffff;
    margin-bottom: 10px;
}

.upload-area {
    border: 2px dashed #4a5661;
    border-radius: 6px;
    padding: 20px;
    text-align: center;
    margin: 15px 0;
}

.upload-btn {
    background: #28a745;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.upload-btn:hover {
    background: #218838;
}

.upload-btn:disabled {
    background: #6c757d;
    cursor: not-allowed;
}

.upload-status {
    margin-top: 10px;
    padding: 10px;
    background: #1e2329;
    border-radius: 4px;
}

.upload-progress {
    margin: 15px 0;
}

.progress-bar {
    width: 100%;
    height: 6px;
    background: #3a4651;
    border-radius: 3px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: #28a745;
    transition: width 0.3s ease;
}

.credential-preview {
    margin-top: 15px;
    padding: 10px;
    background: #1e2329;
    border-radius: 4px;
}

.preview-list {
    list-style: none;
    padding: 0;
    margin: 10px 0 0 0;
}

.preview-list li {
    padding: 5px 0;
    border-bottom: 1px solid #3a4651;
    font-family: monospace;
    font-size: 12px;
}

.divider {
    text-align: center;
    margin: 20px 0;
    position: relative;
}

.divider:before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #3a4651;
}

.divider span {
    background: #2a3441;
    padding: 0 15px;
    color: #6c757d;
    position: relative;
}
</style>
`;

// Inject styles
document.head.insertAdjacentHTML('beforeend', uploadStyles);
