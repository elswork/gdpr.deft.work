// Web Crypto API Utils
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptData(buffer, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        buffer
    );
    
    return new Blob([salt, iv, ciphertext]);
}

// Convert file to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({
            name: file.name,
            type: file.type,
            data: reader.result
        });
        reader.onerror = error => reject(error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const idFileInput = document.getElementById('idFile');
    const residenceFileInput = document.getElementById('residenceFile');
    const passwordInput = document.getElementById('passwordInput');
    const submitBtn = document.getElementById('submitBtn');
    const statusMessage = document.getElementById('statusMessage');
    const progressBarContainer = document.querySelector('.progress-bar-container');
    const progressBar = document.getElementById('progressBar');
    
    // File label updates
    [idFileInput, residenceFileInput].forEach(input => {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const wrapper = document.getElementById('wrapper-' + e.target.id);
                wrapper.setAttribute('style', 'border-color: var(--primary); background: rgba(79, 70, 229, 0.1);');
                const styleElement = document.createElement('style');
                styleElement.innerHTML = `#wrapper-${e.target.id}::after { content: '${file.name} (${(file.size/1024/1024).toFixed(2)} MB)' !important; color: white !important; }`;
                document.head.appendChild(styleElement);
            }
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const password = passwordInput.value;
        if (!password) {
            showMessage('Please enter a secure password.', 'error');
            return;
        }

        try {
            showMessage('Preparing data and reading files...', 'info');
            submitBtn.disabled = true;
            progressBarContainer.style.display = 'block';
            progressBar.style.width = '10%';
            
            // 1. Serialize text fields
            const formData = new FormData(form);
            const jsonData = {};
            formData.forEach((value, key) => {
                // Skip file inputs
                if (key !== 'idFile' && key !== 'residenceFile') {
                    jsonData[key] = value;
                }
            });
            // Handle checkbox (if unchecked, it won't be in formData)
            jsonData.combinedProof = formData.has('combinedProof');
            
            progressBar.style.width = '20%';

            // 2. Read files as Base64
            const idFileObj = await fileToBase64(idFileInput.files[0]);
            const resFileObj = await fileToBase64(residenceFileInput.files[0]);
            
            jsonData.idFile = idFileObj;
            jsonData.residenceFile = resFileObj;
            
            progressBar.style.width = '40%';
            
            // 3. Serialize to JSON and encrypt
            showMessage('Encrypting data locally...', 'info');
            const jsonString = JSON.stringify(jsonData);
            const dataBuffer = new TextEncoder().encode(jsonString);
            const encryptedBlob = await encryptData(dataBuffer, password);
            
            progressBar.style.width = '60%';
            
            // 4. Upload to backend
            showMessage('Uploading secure package...', 'info');
            const uploadFormData = new FormData();
            const fullName = `${jsonData.firstName}_${jsonData.lastName}`.replace(/[^a-zA-Z0-9]/g, '_');
            uploadFormData.append('encryptedFile', encryptedBlob, `registration_${fullName}.enc`);
            
            const response = await fetch('http://localhost:3000/api/upload', {
                method: 'POST',
                body: uploadFormData
            });

            if (!response.ok) throw new Error('Server error during upload');
            
            progressBar.style.width = '100%';
            showMessage('Successfully submitted and encrypted! The server cannot read your data.', 'success');
            
            setTimeout(() => {
                form.reset();
                progressBarContainer.style.display = 'none';
                progressBar.style.width = '0%';
                submitBtn.disabled = false;
                // Reset file labels
                document.querySelectorAll('.file-upload-wrapper').forEach(w => w.removeAttribute('style'));
            }, 3000);
            
        } catch (error) {
            console.error(error);
            showMessage('Error: ' + error.message, 'error');
            submitBtn.disabled = false;
            progressBarContainer.style.display = 'none';
        }
    });
    
    function showMessage(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.className = type;
    }
});
