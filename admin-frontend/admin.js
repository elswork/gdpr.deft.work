// Web Crypto API Utils (reused)
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

async function decryptData(encryptedBuffer, password) {
    const salt = encryptedBuffer.slice(0, 16);
    const iv = encryptedBuffer.slice(16, 28);
    const ciphertext = encryptedBuffer.slice(28);
    
    const key = await deriveKey(password, salt);
    
    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            key,
            ciphertext
        );
        return decryptedBuffer;
    } catch (e) {
        throw new Error("Incorrect password or corrupted file.");
    }
}

// Convert data URL back to Blob for downloading
function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

document.addEventListener('DOMContentLoaded', () => {
    const fileList = document.getElementById('fileList');
    const modal = document.getElementById('passwordModal');
    const modalFileName = document.getElementById('modalFileName');
    const passwordInput = document.getElementById('decryptPassword');
    const confirmBtn = document.getElementById('confirmDecryptBtn');
    const cancelBtn = document.getElementById('cancelDecryptBtn');
    const decryptStatus = document.getElementById('decryptStatus');
    
    const detailsModal = document.getElementById('detailsModal');
    const detailsGrid = document.getElementById('detailsGrid');
    const documentsContainer = document.getElementById('documentsContainer');
    const closeDetailsBtn = document.getElementById('closeDetailsBtn');
    
    let currentFile = null;

    async function loadFiles() {
        try {
            const res = await fetch('/api/files');
            if (res.status === 401) {
                window.location.href = 'login.html';
                return;
            }
            if (!res.ok) throw new Error('Error loading file list');
            const files = await res.json();
            
            fileList.innerHTML = '';
            
            if (files.length === 0) {
                fileList.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No records found.</p>';
                return;
            }
            
            files.forEach(f => {
                const li = document.createElement('div');
                li.className = 'file-item';
                
                const date = new Date(f.date).toLocaleString('en-US');
                const size = (f.size / 1024).toFixed(2) + ' KB';
                
                li.innerHTML = `
                    <div class="file-info">
                        <span class="file-name">${f.name}</span>
                        <span class="file-meta">${date} &bull; ${size}</span>
                    </div>
                    <div>
                        <button class="download-btn" data-filename="${f.name}">View Record</button>
                        <button class="delete-btn" data-filename="${f.name}" style="background: #ef4444; margin-left: 5px;">Delete</button>
                    </div>
                `;
                
                fileList.appendChild(li);
            });
            
            document.querySelectorAll('.download-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    currentFile = e.target.getAttribute('data-filename');
                    modalFileName.textContent = `Record: ${currentFile}`;
                    passwordInput.value = '';
                    decryptStatus.textContent = '';
                    modal.style.display = 'flex';
                });
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm('Are you sure you want to delete this record?')) {
                        const filename = e.target.getAttribute('data-filename');
                        try {
                            const res = await fetch(`/api/files/${filename}`, { method: 'DELETE' });
                            if (res.ok) {
                                loadFiles();
                            } else {
                                alert('Failed to delete file');
                            }
                        } catch (err) {
                            alert('Error: ' + err.message);
                        }
                    }
                });
            });
            
        } catch (error) {
            fileList.innerHTML = `<p style="text-align: center; color: #ef4444;">Error: ${error.message}</p>`;
        }
    }
    
    loadFiles();

    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        currentFile = null;
    });

    closeDetailsBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
    });

    confirmBtn.addEventListener('click', async () => {
        const password = passwordInput.value;
        if (!password) {
            decryptStatus.textContent = 'Enter password.';
            decryptStatus.style.color = '#ef4444';
            return;
        }
        
        try {
            confirmBtn.disabled = true;
            decryptStatus.textContent = 'Downloading and decrypting...';
            decryptStatus.style.color = '#3b82f6';
            
            // 1. Fetch encrypted blob
            const res = await fetch(`/api/files/${currentFile}`);
            if (!res.ok) throw new Error('Download failed');
            const encryptedBuffer = await res.arrayBuffer();
            
            // 2. Decrypt
            const decryptedBuffer = await decryptData(encryptedBuffer, password);
            
            // 3. Parse JSON
            const jsonStr = new TextDecoder().decode(decryptedBuffer);
            const data = JSON.parse(jsonStr);
            
            // 4. Show data in Details Modal
            detailsGrid.innerHTML = '';
            
            const fieldsToShow = {
                "First Name": data.firstName,
                "Last Name": data.lastName,
                "Nationality": data.nationality,
                "Date of Birth": data.dob,
                "Phone": data.phone,
                "Email": data.email,
                "Public Email": data.publicEmail || 'N/A',
                "Address": data.address,
                "Postal Code": data.postalCode,
                "City": data.city,
                "Country": data.country,
                "Combined Proof": data.combinedProof ? "Yes" : "No"
            };

            for (const [label, value] of Object.entries(fieldsToShow)) {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${label}</strong> <span>${value}</span>`;
                detailsGrid.appendChild(div);
            }

            // 5. Setup Document Download Buttons
            documentsContainer.innerHTML = '';
            
            if (data.idFile) {
                const btn = document.createElement('button');
                btn.className = 'doc-btn';
                btn.textContent = `Download ID/Passport (${data.idFile.name})`;
                btn.onclick = () => downloadBase64File(data.idFile.data, data.idFile.name);
                documentsContainer.appendChild(btn);
            }

            if (data.residenceFile) {
                const btn = document.createElement('button');
                btn.className = 'doc-btn';
                btn.textContent = `Download Proof of Residence (${data.residenceFile.name})`;
                btn.onclick = () => downloadBase64File(data.residenceFile.data, data.residenceFile.name);
                documentsContainer.appendChild(btn);
            }
            
            // Hide password modal, show details modal
            modal.style.display = 'none';
            confirmBtn.disabled = false;
            detailsModal.style.display = 'flex';
            
        } catch (error) {
            console.error(error);
            decryptStatus.textContent = error.message;
            decryptStatus.style.color = '#ef4444';
            confirmBtn.disabled = false;
        }
    });

    function downloadBase64File(base64Data, filename) {
        const blob = dataURLtoBlob(base64Data);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
