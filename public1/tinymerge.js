const CLIENT_LIMIT = 50 * 1024 * 1024; // 50MB


document.addEventListener('DOMContentLoaded', () => {
  const fileList = document.getElementById('fileList');
  const mergeBtn = document.getElementById('mergeBtn');

  let clientFiles = []; // [{id,name,size,blob}] từ IndexedDB

  init();

  async function init() {
    // Luôn tải file từ IndexedDB
    clientFiles = await idbGetAll();
    renderFileList();
  }

  function renderFileList() {
    if (!clientFiles || clientFiles.length === 0) {
      fileList.innerHTML = '<div class="empty-message">Chưa có file nào được chọn. Vui lòng quay lại trang chủ.</div>';
      mergeBtn.disabled = true;
      return;
    }
    fileList.innerHTML = clientFiles.map((f, i) => `
      <li>
        <span class="file-name">${f.name}</span>
        <span class="file-size">(${(f.size / (1024 * 1024)).toFixed(2)} MB)</span>
        <button onclick="removeFile(${i})" class="remove-btn">×</button>
      </li>
    `).join('');
    mergeBtn.disabled = false;
  }

  // Xóa file khỏi danh sách
  window.removeFile = async function(index) {
    const rec = clientFiles[index];
    if (rec && rec.id) {
        await idbDelete(rec.id);
    }
    clientFiles.splice(index, 1);
    renderFileList();
  };

  // Merge PDF
  mergeBtn.addEventListener('click', async () => {
    if (!clientFiles || clientFiles.length < 1) {
      alert('Cần ít nhất 1 file để gộp');
      return;
    }
    await clientMerge();
  });

  // Client-side merge using pdf-lib
  async function clientMerge() {
    try {
      mergeBtn.disabled = true;
      mergeBtn.textContent = 'Đang gộp file...';

      // Lấy PDFDocument từ PDFLib (UMD) hoặc global fallback
      const PDFDoc =
        (window.PDFLib && window.PDFLib.PDFDocument)
        || window.PDFDocument;
      if (!PDFDoc) {
        alert('Thư viện PDF-Lib chưa sẵn sàng. Vui lòng tải lại trang.');
        return;
      }

      const merged = await PDFDoc.create();
      for (const f of clientFiles) {
        const blob = f.blob instanceof Blob ? f.blob : null;
        if (!blob) {
          console.error('Bản ghi không có blob hợp lệ:', f);
          alert('Dữ liệu file không hợp lệ trong bộ nhớ tạm.');
          return;
        }
        const buf = await blob.arrayBuffer();
        const src = await PDFDoc.load(buf, { updateMetadata: false });
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      }

      const bytes = await merged.save();
      const blobOut = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blobOut);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Clear client queue và quay về trang upload
      await idbClear();
      setTimeout(() => { window.location.href = 'mergepdf.html'; }, 500);
    } catch (e) {
      console.error(e);
      alert('Có lỗi khi gộp file. Vui lòng thử lại.');
    } finally {
      mergeBtn.disabled = false;
      mergeBtn.textContent = 'Gộp PDF';
    }
  }

  // IndexedDB helpers
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

  async function idbGetAll() {
    const db = await openDB();
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfQueue', 'readonly');
      const store = tx.objectStore('pdfQueue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    // Sắp xếp theo order đã lưu
    return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async function idbDelete(id) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfQueue', 'readwrite');
      tx.objectStore('pdfQueue').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
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
});
