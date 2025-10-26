const CLIENT_TOTAL_LIMIT = 100 * 1024 * 1024; // Giới hạn tổng dung lượng là 100MB

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const selectBtn = document.getElementById('selectBtn');
    const dropZone = document.getElementById('dropZone');
    const fileList = document.getElementById('fileList');

    // Xử lý click nút chọn file
    selectBtn.addEventListener('click', () => {
        fileInput.value = '';  // Reset input để có thể chọn lại file cũ
        fileInput.click();
    });

    // Xử lý khi chọn file
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    });

    // Xử lý kéo thả
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    // Helper: điều hướng an toàn sang tinymerge.html
    function gotoTinyMerge() {
        setLoading(false);
        window.location.href = 'tinymerge.html';
    }

    async function handleFiles(files) {
        const pdfFiles = files.filter(file =>
            file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        );
        if (pdfFiles.length === 0) {
            alert('Vui lòng chỉ chọn file PDF');
            return;
        }

        // Kiểm tra tổng dung lượng file
        const totalSize = pdfFiles.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > CLIENT_TOTAL_LIMIT) {
            alert(`Tổng dung lượng file vượt quá giới hạn ${CLIENT_TOTAL_LIMIT / (1024*1024)}MB cho phiên bản demo. Vui lòng chọn các file nhỏ hơn.`);
            return;
        }

        // Hiển thị danh sách file
        fileList.innerHTML = pdfFiles.map(f => `
            <div class="file-item">
                <span>${f.name}</span>
                <small>${(f.size / (1024 * 1024)).toFixed(2)} MB</small>
            </div>
        `).join('');

        try {
            setLoading(true);

            // Lưu tất cả file vào IndexedDB để client-side merge
            console.log(`[FLOW] Lưu ${pdfFiles.length} file vào IndexedDB`);
            await idbClear();
            await idbAddMany(pdfFiles);

            // Chuyển trang
            gotoTinyMerge();
        } catch (error) {
            console.error('Lỗi khi xử lý file:', error);
            alert(`Không thể xử lý file: ${error.message}`);
            setLoading(false);
        }
    }

    // Helper: bật/tắt loading trong ô upload
    function setLoading(isLoading) {
        if (!dropZone) return;
        if (isLoading) {
            dropZone.classList.add('loading');
            if (!dropZone.querySelector('.loading-bar')) {
                const loadingBar = document.createElement('div');
                loadingBar.className = 'loading-bar';
                dropZone.appendChild(loadingBar);
            }
            if (!dropZone.querySelector('.loading-text')) {
                const loadingText = document.createElement('div');
                loadingText.className = 'loading-text';
                loadingText.textContent = 'Đang xử lý file PDF...';
                dropZone.appendChild(loadingText);
            }
        } else {
            dropZone.classList.remove('loading');
            const loadingElements = dropZone.querySelectorAll('.loading-bar, .loading-text');
            loadingElements.forEach(el => el.remove());
        }
    }

    // IndexedDB helpers (pdf-tools > store: pdfQueue)
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('pdf-tools', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('pdfQueue')) {
                    const store = db.createObjectStore('pdfQueue', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('order', 'order', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbClear() {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('pdfQueue', 'readwrite');
            tx.objectStore('pdfQueue').clear();
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }

    async function idbAddMany(files) {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('pdfQueue', 'readwrite');
            const store = tx.objectStore('pdfQueue');
            files.forEach((f, i) => {
                // Lưu Blob để tái sử dụng giữa các trang
                store.add({ name: f.name, size: f.size, order: i, blob: f });
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    }
});
