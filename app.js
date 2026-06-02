
    (() => {
      const STORAGE_KEYS = {
        categories: 'keydup_categories',
        items: 'keydup_items',
        inventory: 'keydup_inventory',
        sales: 'keydup_sales',
        purchases: 'keydup_purchases'
      };
      const SESSION_KEY = 'keydup_admin_logged_in';
      const DEFAULT_LOGIN = { username: 'admin', password: 'admin123' };
      const LOGIN_PAGE = 'login.html';
      const appState = {
        currentSection: 'home',
        categories: [],
        items: [],
        inventory: [],
        sales: [],
        purchases: []
      };

      const sectionMeta = {
        home: {
          title: 'Home',
          subtitle: 'Ringkasan performa stok, penjualan, dan aktivitas terbaru.'
        },
        items: {
          title: 'Items',
          subtitle: 'Kelola kategori manual dan seluruh data item.'
        },
        inventory: {
          title: 'Inventory',
          subtitle: 'Atur stok masuk dan stok keluar secara real time.'
        },
        sales: {
          title: 'Sales',
          subtitle: 'Input penjualan dan pantau revenue usaha.'
        },
        purchases: {
          title: 'Purchases',
          subtitle: 'Catat pembelian dari supplier dan tambah stok otomatis.'
        }
      };

      const qs = (sel) => document.querySelector(sel);
      const qsa = (sel) => [...document.querySelectorAll(sel)];
      const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toInt = (v) => Number.parseInt(v, 10) || 0;
      const toCurrency = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
      const escapeHtml = (str) => String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

      function nowISO() {
        return new Date().toISOString();
      }

      function formatDate(dateString) {
        if (!dateString) return '-';
        const d = new Date(dateString);
        return d.toLocaleString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function saveState() {
        localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(appState.categories));
        localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(appState.items));
        localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(appState.inventory));
        localStorage.setItem(STORAGE_KEYS.sales, JSON.stringify(appState.sales));
        localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(appState.purchases));
      }

      function loadState() {
        appState.categories = JSON.parse(localStorage.getItem(STORAGE_KEYS.categories) || '[]');
        appState.items = JSON.parse(localStorage.getItem(STORAGE_KEYS.items) || '[]');
        appState.inventory = JSON.parse(localStorage.getItem(STORAGE_KEYS.inventory) || '[]');
        appState.sales = JSON.parse(localStorage.getItem(STORAGE_KEYS.sales) || '[]');
        appState.purchases = JSON.parse(localStorage.getItem(STORAGE_KEYS.purchases) || '[]');
        normalizeState();
      }

      function getCategoryById(id) {
        return appState.categories.find(cat => cat.id === id);
      }

      function getItemById(id) {
        return appState.items.find(item => item.id === id);
      }


      function getCategoryName(categoryId) {
        return getCategoryById(categoryId)?.name || '-';
      }

      function inventoryEffect(type, qty) {
        return type === 'IN' ? toInt(qty) : -toInt(qty);
      }

      function getLinkedInventoryRecord(refType, refId) {
        return appState.inventory.find(row => row.refType === refType && row.refId === refId);
      }

      function upsertInventoryRecord({ refType = 'inventory', refId, itemId, type, qty, note, source = 'manual', date = nowISO() }) {
        let record = refId ? getLinkedInventoryRecord(refType, refId) : null;
        if (!record && refType === 'inventory' && refId) {
          record = appState.inventory.find(row => row.id === refId);
        }

        const payload = {
          itemId,
          type,
          qty: toInt(qty),
          note,
          source,
          date,
          refType,
          refId: refId || null
        };

        if (record) {
          Object.assign(record, payload);
          return record;
        }

        record = {
          id: uid('inv'),
          ...payload
        };
        if (!record.refId && record.refType === 'inventory') {
          record.refId = record.id;
        }
        appState.inventory.push(record);
        return record;
      }

      function recalculateStocksFromInventory() {
        const stockMap = new Map(appState.items.map(item => [item.id, toInt(item.initialStock)]));
        appState.inventory.forEach(row => {
          if (!stockMap.has(row.itemId)) return;
          stockMap.set(row.itemId, stockMap.get(row.itemId) + inventoryEffect(row.type, row.qty));
        });
        appState.items.forEach(item => {
          item.stock = stockMap.get(item.id) ?? toInt(item.initialStock);
          item.updatedAt = nowISO();
        });
      }

      function normalizeState() {
        appState.categories = Array.isArray(appState.categories) ? appState.categories : [];
        appState.items = Array.isArray(appState.items) ? appState.items : [];
        appState.inventory = Array.isArray(appState.inventory) ? appState.inventory : [];
        appState.sales = Array.isArray(appState.sales) ? appState.sales : [];
        appState.purchases = Array.isArray(appState.purchases) ? appState.purchases : [];

        appState.categories = appState.categories.map(category => ({
          id: category.id || uid('cat'),
          name: String(category.name || '').trim(),
          createdAt: category.createdAt || nowISO()
        })).filter(category => category.name);

        appState.items = appState.items.map(item => ({
          id: item.id || uid('item'),
          itemId: String(item.itemId || '').trim(),
          name: String(item.name || '').trim(),
          categoryId: item.categoryId || '',
          subCategory: String(item.subCategory || '').trim(),
          type: String(item.type || '').trim(),
          initialStock: toInt(item.initialStock),
          minStock: toInt(item.minStock),
          costPrice: Number(item.costPrice || 0),
          sellPrice: Number(item.sellPrice || 0),
          stock: toInt(item.stock),
          createdAt: item.createdAt || nowISO(),
          updatedAt: item.updatedAt || item.createdAt || nowISO()
        })).filter(item => item.itemId && item.name);

        appState.sales = appState.sales.map(row => ({
          id: row.id || uid('sale'),
          customer: String(row.customer || '').trim(),
          itemId: row.itemId || '',
          qty: toInt(row.qty),
          status: row.status === 'Pending' ? 'Pending' : 'Selesai',
          sellPrice: Number(row.sellPrice || 0),
          total: Number(row.total || 0),
          date: row.date || nowISO()
        })).filter(row => row.customer && row.itemId && row.qty > 0);

        appState.purchases = appState.purchases.map(row => ({
          id: row.id || uid('purchase'),
          supplier: String(row.supplier || '').trim(),
          itemId: row.itemId || '',
          qty: toInt(row.qty),
          status: row.status === 'Pending' ? 'Pending' : 'Selesai',
          costPrice: Number(row.costPrice || 0),
          total: Number(row.total || 0),
          date: row.date || nowISO()
        })).filter(row => row.supplier && row.itemId && row.qty > 0);

        appState.inventory = appState.inventory.map(row => ({
          id: row.id || uid('inv'),
          itemId: row.itemId || '',
          type: row.type === 'OUT' ? 'OUT' : 'IN',
          qty: toInt(row.qty),
          note: String(row.note || '').trim(),
          source: row.source || 'manual',
          date: row.date || nowISO(),
          refType: row.refType || (row.source === 'sales' ? 'sale' : row.source === 'purchases' ? 'purchase' : 'inventory'),
          refId: row.refId || null
        })).filter(row => row.itemId && row.qty > 0);

        // Hubungkan data lama sales/purchases dengan movement inventory yang sudah ada.
        const claimLegacyInventory = (predicate) => {
          const index = appState.inventory.findIndex(row => predicate(row));
          return index >= 0 ? appState.inventory[index] : null;
        };

        appState.sales.forEach(row => {
          let inv = getLinkedInventoryRecord('sale', row.id);
          if (!inv) {
            inv = claimLegacyInventory(invRow =>
              invRow.source === 'sales'
              && !invRow.refId
              && invRow.itemId === row.itemId
              && toInt(invRow.qty) === toInt(row.qty)
              && new Date(invRow.date).getTime() === new Date(row.date).getTime()
            ) || claimLegacyInventory(invRow =>
              invRow.source === 'sales'
              && !invRow.refId
              && invRow.itemId === row.itemId
              && toInt(invRow.qty) === toInt(row.qty)
              && String(invRow.note || '').includes(row.customer)
            );
          }
          if (inv) {
            inv.refType = 'sale';
            inv.refId = row.id;
          } else {
            upsertInventoryRecord({
              refType: 'sale',
              refId: row.id,
              itemId: row.itemId,
              type: 'OUT',
              qty: row.qty,
              note: `Penjualan ke ${row.customer} (${row.status})`,
              source: 'sales',
              date: row.date
            });
          }
        });

        appState.purchases.forEach(row => {
          let inv = getLinkedInventoryRecord('purchase', row.id);
          if (!inv) {
            inv = claimLegacyInventory(invRow =>
              invRow.source === 'purchases'
              && !invRow.refId
              && invRow.itemId === row.itemId
              && toInt(invRow.qty) === toInt(row.qty)
              && new Date(invRow.date).getTime() === new Date(row.date).getTime()
            ) || claimLegacyInventory(invRow =>
              invRow.source === 'purchases'
              && !invRow.refId
              && invRow.itemId === row.itemId
              && toInt(invRow.qty) === toInt(row.qty)
              && String(invRow.note || '').includes(row.supplier)
            );
          }
          if (inv) {
            inv.refType = 'purchase';
            inv.refId = row.id;
          } else {
            upsertInventoryRecord({
              refType: 'purchase',
              refId: row.id,
              itemId: row.itemId,
              type: 'IN',
              qty: row.qty,
              note: `Pembelian dari ${row.supplier} (${row.status})`,
              source: 'purchases',
              date: row.date
            });
          }
        });

        appState.inventory.forEach(row => {
          if (row.refType === 'inventory' && !row.refId) {
            row.refId = row.id;
          }
        });

        recalculateStocksFromInventory();
        saveState();
      }

      function canApplyStockChanges(changes) {
        const deltaMap = new Map();
        changes.forEach(change => {
          if (!change || !change.itemId) return;
          deltaMap.set(change.itemId, (deltaMap.get(change.itemId) || 0) + Number(change.delta || 0));
        });

        for (const [itemId, delta] of deltaMap.entries()) {
          const item = getItemById(itemId);
          if (!item) {
            return { ok: false, message: 'Item terkait tidak ditemukan.' };
          }
          const projected = toInt(item.stock) + Number(delta || 0);
          if (projected < 0) {
            return { ok: false, message: `Stok item "${item.name}" tidak cukup untuk perubahan ini.` };
          }
        }
        return { ok: true };
      }

      function syncSaleInventoryRecord(sale) {
        upsertInventoryRecord({
          refType: 'sale',
          refId: sale.id,
          itemId: sale.itemId,
          type: 'OUT',
          qty: sale.qty,
          note: `Penjualan ke ${sale.customer} (${sale.status})`,
          source: 'sales',
          date: sale.date
        });
      }

      function syncPurchaseInventoryRecord(purchase) {
        upsertInventoryRecord({
          refType: 'purchase',
          refId: purchase.id,
          itemId: purchase.itemId,
          type: 'IN',
          qty: purchase.qty,
          note: `Pembelian dari ${purchase.supplier} (${purchase.status})`,
          source: 'purchases',
          date: purchase.date
        });
      }

      function resetInventoryForm() {
        qs('#inventoryEditId').value = '';
        qs('#inventoryForm').reset();
        qs('#saveInventoryBtn').textContent = 'Simpan Movement';
      }

      function resetSalesForm() {
        qs('#salesEditId').value = '';
        qs('#salesForm').reset();
        qs('#saveSalesBtn').textContent = 'Simpan Penjualan';
      }

      function resetPurchaseForm() {
        qs('#purchaseEditId').value = '';
        qs('#purchaseForm').reset();
        qs('#savePurchaseBtn').textContent = 'Simpan Pembelian';
      }

      function calculateDashboard() {
        const totalItems = appState.items.length;
        const totalStock = appState.items.reduce((sum, item) => sum + toInt(item.stock), 0);
        const inventoryValue = appState.items.reduce((sum, item) => sum + (toInt(item.stock) * Number(item.costPrice || 0)), 0);
        const totalSalesValue = appState.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
        const lowStock = appState.items.filter(item => toInt(item.stock) <= toInt(item.minStock));
        return { totalItems, totalStock, inventoryValue, totalSalesValue, lowStock };
      }

      function computeRecentActivities(limit = 8) {
        const manualInventory = appState.inventory.map(row => ({
          type: row.type === 'IN' ? 'stok-masuk' : 'stok-keluar',
          date: row.date,
          title: `${row.type === 'IN' ? 'Stok Masuk' : 'Stok Keluar'} • ${getItemById(row.itemId)?.name || 'Item tidak ditemukan'}`,
          subtitle: `${row.source || 'manual'} • Qty ${row.qty}${row.note ? ' • ' + row.note : ''}`,
          badge: row.type === 'IN' ? 'success' : 'warning'
        }));
        return manualInventory
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit);
      }

      function showToast(message, kind = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${kind}`;
        toast.innerHTML = `<strong style="display:block;margin-bottom:4px">${kind === 'error' ? 'Gagal' : kind === 'warning' ? 'Perhatian' : 'Berhasil'}</strong><div>${escapeHtml(message)}</div>`;
        qs('#toastWrap').appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
      }


      function openSection(sectionName) {
        appState.currentSection = sectionName;
        qsa('.section').forEach(section => section.classList.remove('active'));
        qsa('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.section === sectionName));
        qs(`#section-${sectionName}`).classList.add('active');
        qs('#pageTitle').textContent = sectionMeta[sectionName].title;
        qs('#pageSubtitle').textContent = sectionMeta[sectionName].subtitle;
        closeSidebar();
      }

      function openSidebar() {
        qs('#sidebar').classList.add('show');
        qs('#sidebarBackdrop').classList.add('show');
      }

      function closeSidebar() {
        qs('#sidebar').classList.remove('show');
        qs('#sidebarBackdrop').classList.remove('show');
      }

      function refreshSelectOptions() {
        const categoryOptions = appState.categories.length
          ? `<option value="">Pilih kategori</option>${appState.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}`
          : `<option value="">Belum ada kategori</option>`;

        qs('#itemCategory').innerHTML = categoryOptions;

        const filterCategoryOptions = `<option value="">Semua kategori</option>${appState.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}`;
        const currentCategoryFilter = qs('#itemCategoryFilter').value;
        qs('#itemCategoryFilter').innerHTML = filterCategoryOptions;
        qs('#itemCategoryFilter').value = currentCategoryFilter;

        const subCategorySource = currentCategoryFilter
          ? appState.items.filter(item => item.categoryId === currentCategoryFilter)
          : appState.items;

        const uniqueSubCats = [...new Set(subCategorySource.map(item => item.subCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
        const currentSubCategoryFilter = qs('#itemSubCategoryFilter').value;
        qs('#itemSubCategoryFilter').innerHTML = `<option value="">Semua sub kategori</option>${uniqueSubCats.map(sc => `<option value="${escapeHtml(sc)}">${escapeHtml(sc)}</option>`).join('')}`;
        if (uniqueSubCats.includes(currentSubCategoryFilter)) {
          qs('#itemSubCategoryFilter').value = currentSubCategoryFilter;
        }

        const itemOptions = appState.items.length
          ? `<option value="">Pilih item</option>${appState.items.map(item => `<option value="${item.id}">${escapeHtml(item.itemId)} - ${escapeHtml(item.name)} (Stok: ${item.stock})</option>`).join('')}`
          : `<option value="">Belum ada item</option>`;

        ['#inventoryItem', '#salesItem', '#purchaseItem'].forEach(sel => {
          const currentVal = qs(sel).value;
          qs(sel).innerHTML = itemOptions;
          if (appState.items.some(item => item.id === currentVal)) {
            qs(sel).value = currentVal;
          }
        });
      }

      function renderHome() {
        const summary = calculateDashboard();
        qs('#homeTotalItems').textContent = summary.totalItems;
        qs('#homeTotalStock').textContent = summary.totalStock;
        qs('#homeInventoryValue').textContent = toCurrency(summary.inventoryValue);
        qs('#homeTotalSalesValue').textContent = toCurrency(summary.totalSalesValue);
        qs('#heroCategoryCount').textContent = appState.categories.length;
        qs('#heroLowStockCount').textContent = summary.lowStock.length;
        qs('#heroSalesCount').textContent = appState.sales.length;
        qs('#heroPurchaseCount').textContent = appState.purchases.length;

        const lowWrap = qs('#lowStockList');
        if (!summary.lowStock.length) {
          lowWrap.innerHTML = `<div class="empty-state">Belum ada item yang stoknya menipis.</div>`;
        } else {
          lowWrap.innerHTML = `<div class="list-plain">${summary.lowStock
            .sort((a, b) => a.stock - b.stock)
            .map(item => `
              <div class="list-row">
                <div class="stack">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="small muted">${escapeHtml(item.itemId)} • ${escapeHtml(getCategoryName(item.categoryId))} • ${escapeHtml(item.subCategory || '-')}</span>
                </div>
                <div class="stack" style="text-align:right">
                  <span class="badge danger">Stok ${item.stock}</span>
                  <span class="small muted">Min ${item.minStock}</span>
                </div>
              </div>
            `).join('')}</div>`;
        }

        const recent = computeRecentActivities(8);
        const recentWrap = qs('#recentActivityList');
        if (!recent.length) {
          recentWrap.innerHTML = `<div class="empty-state">Belum ada aktivitas terbaru.</div>`;
        } else {
          recentWrap.innerHTML = `<div class="list-plain">${recent.map(act => `
            <div class="list-row">
              <div class="stack">
                <strong>${escapeHtml(act.title)}</strong>
                <span class="small muted">${escapeHtml(act.subtitle)}</span>
              </div>
              <div class="stack" style="text-align:right">
                <span class="badge ${act.badge}">${act.type}</span>
                <span class="small muted">${formatDate(act.date)}</span>
              </div>
            </div>
          `).join('')}</div>`;
        }
      }

      function renderCategories() {
        const tbody = qs('#categoryTableBody');
        if (!appState.categories.length) {
          tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">Belum ada kategori. Tambahkan kategori terlebih dahulu.</div></td></tr>`;
          return;
        }
        tbody.innerHTML = appState.categories
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'id'))
          .map(category => {
            const count = appState.items.filter(item => item.categoryId === category.id).length;
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(category.name)}</strong>
                  <span class="subtext">Dibuat: ${formatDate(category.createdAt)}</span>
                </td>
                <td>${count}</td>
                <td class="actions-cell no-print">
                  <button class="btn secondary small" data-action="edit-category" data-id="${category.id}">Edit</button>
                  <button class="btn danger small" data-action="delete-category" data-id="${category.id}">Delete</button>
                </td>
              </tr>
            `;
          }).join('');
      }

      function getFilteredItems() {
        const search = qs('#itemSearch').value.trim().toLowerCase();
        const categoryFilter = qs('#itemCategoryFilter').value;
        const subCategoryFilter = qs('#itemSubCategoryFilter').value;

        return appState.items.filter(item => {
          const categoryName = getCategoryName(item.categoryId);
          const haystack = [
            item.itemId, item.name, categoryName, item.subCategory, item.type
          ].join(' ').toLowerCase();

          const matchesSearch = !search || haystack.includes(search);
          const matchesCategory = !categoryFilter || item.categoryId === categoryFilter;
          const matchesSubCategory = !subCategoryFilter || item.subCategory === subCategoryFilter;
          return matchesSearch && matchesCategory && matchesSubCategory;
        });
      }

      function renderItems() {
        const tbody = qs('#itemsTableBody');
        const items = getFilteredItems();
        if (!items.length) {
          tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state">Belum ada item yang cocok dengan pencarian/filter.</div></td></tr>`;
          return;
        }
        tbody.innerHTML = items
          .slice()
          .sort((a, b) => a.itemId.localeCompare(b.itemId, 'id'))
          .map(item => `
            <tr>
              <td><strong>${escapeHtml(item.itemId)}</strong></td>
              <td>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="subtext">Stok awal: ${item.initialStock}</span>
              </td>
              <td>${escapeHtml(getCategoryName(item.categoryId))}</td>
              <td>${escapeHtml(item.subCategory || '-')}</td>
              <td>${escapeHtml(item.type || '-')}</td>
              <td>
                <span class="badge ${toInt(item.stock) <= toInt(item.minStock) ? 'danger' : 'success'}">${item.stock}</span>
              </td>
              <td>${item.minStock}</td>
              <td>${toCurrency(item.costPrice)}</td>
              <td>${toCurrency(item.sellPrice)}</td>
              <td class="actions-cell no-print">
                <button class="btn secondary small" data-action="edit-item" data-id="${item.id}">Edit</button>
                <button class="btn danger small" data-action="delete-item" data-id="${item.id}">Delete</button>
              </td>
            </tr>
          `).join('');
      }

      function renderInventory() {
        const totalIn = appState.inventory.filter(row => row.type === 'IN').reduce((sum, row) => sum + toInt(row.qty), 0);
        const totalOut = appState.inventory.filter(row => row.type === 'OUT').reduce((sum, row) => sum + toInt(row.qty), 0);
        qs('#inventoryTotalMovement').textContent = appState.inventory.length;
        qs('#inventoryTotalIn').textContent = totalIn;
        qs('#inventoryTotalOut').textContent = totalOut;
        qs('#inventoryNetMovement').textContent = totalIn - totalOut;

        const summaryWrap = qs('#inventorySummaryList');
        if (!appState.items.length) {
          summaryWrap.innerHTML = `<div class="empty-state">Belum ada item untuk diringkas.</div>`;
        } else {
          summaryWrap.innerHTML = `<div class="list-plain">${appState.items
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'id'))
            .map(item => `
              <div class="list-row">
                <div class="stack">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="small muted">${escapeHtml(item.itemId)} • ${escapeHtml(getCategoryName(item.categoryId))}</span>
                </div>
                <div class="stack" style="text-align:right">
                  <span class="badge ${toInt(item.stock) <= toInt(item.minStock) ? 'danger' : 'success'}">Stok ${item.stock}</span>
                  <span class="small muted">Min ${item.minStock}</span>
                </div>
              </div>
            `).join('')}</div>`;
        }

        const tbody = qs('#inventoryTableBody');
        if (!appState.inventory.length) {
          tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">Belum ada riwayat inventory.</div></td></tr>`;
        } else {
          tbody.innerHTML = appState.inventory
            .slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(row => {
              let actionHtml = `<span class="small muted">-</span>`;
              if (row.source === 'manual') {
                actionHtml = `
                  <button class="btn secondary small" data-action="edit-inventory" data-id="${row.id}">Edit</button>
                  <button class="btn danger small" data-action="delete-inventory" data-id="${row.id}">Delete</button>
                `;
              } else if (row.source === 'sales') {
                actionHtml = `
                  <button class="btn secondary small" data-action="edit-sale" data-id="${row.refId || ''}">Edit</button>
                  <button class="btn danger small" data-action="delete-sale" data-id="${row.refId || ''}">Delete</button>
                `;
              } else if (row.source === 'purchases') {
                actionHtml = `
                  <button class="btn secondary small" data-action="edit-purchase" data-id="${row.refId || ''}">Edit</button>
                  <button class="btn danger small" data-action="delete-purchase" data-id="${row.refId || ''}">Delete</button>
                `;
              }

              return `
                <tr>
                  <td>${formatDate(row.date)}</td>
                  <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
                  <td><span class="badge ${row.type === 'IN' ? 'success' : 'warning'}">${row.type}</span></td>
                  <td>${row.qty}</td>
                  <td><span class="pill">${escapeHtml(row.source || 'manual')}</span></td>
                  <td>${escapeHtml(row.note || '-')}</td>
                  <td class="actions-cell no-print">${actionHtml}</td>
                </tr>
              `;
            }).join('');
        }
      }

      function renderSales() {
        const totalRevenue = appState.sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
        const done = appState.sales.filter(row => row.status === 'Selesai').length;
        const pending = appState.sales.filter(row => row.status === 'Pending').length;
        qs('#salesTotalTransactions').textContent = appState.sales.length;
        qs('#salesTotalRevenue').textContent = toCurrency(totalRevenue);
        qs('#salesDoneCount').textContent = done;
        qs('#salesPendingCount').textContent = pending;

        const insightWrap = qs('#salesInsightList');
        const topSales = appState.sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        if (!topSales.length) {
          insightWrap.innerHTML = `<div class="empty-state">Belum ada penjualan tercatat.</div>`;
        } else {
          insightWrap.innerHTML = `<div class="list-plain">${topSales.map(row => `
            <div class="list-row">
              <div class="stack">
                <strong>${escapeHtml(row.customer)}</strong>
                <span class="small muted">${escapeHtml(getItemById(row.itemId)?.name || '-')} • Qty ${row.qty}</span>
              </div>
              <div class="stack" style="text-align:right">
                <span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span>
                <span class="small muted">${toCurrency(row.total)}</span>
              </div>
            </div>
          `).join('')}</div>`;
        }

        const tbody = qs('#salesTableBody');
        if (!appState.sales.length) {
          tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">Belum ada data penjualan.</div></td></tr>`;
        } else {
          tbody.innerHTML = appState.sales
            .slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(row => `
              <tr>
                <td>${formatDate(row.date)}</td>
                <td>${escapeHtml(row.customer)}</td>
                <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
                <td>${row.qty}</td>
                <td><span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span></td>
                <td>${toCurrency(row.sellPrice)}</td>
                <td>${toCurrency(row.total)}</td>
                <td class="actions-cell no-print">
                  <button class="btn secondary small" data-action="edit-sale" data-id="${row.id}">Edit</button>
                  <button class="btn danger small" data-action="delete-sale" data-id="${row.id}">Delete</button>
                </td>
              </tr>
            `).join('');
        }
      }

      function renderPurchases() {
        const totalCost = appState.purchases.reduce((sum, row) => sum + Number(row.total || 0), 0);
        const done = appState.purchases.filter(row => row.status === 'Selesai').length;
        const pending = appState.purchases.filter(row => row.status === 'Pending').length;
        qs('#purchaseTotalTransactions').textContent = appState.purchases.length;
        qs('#purchaseTotalCost').textContent = toCurrency(totalCost);
        qs('#purchaseDoneCount').textContent = done;
        qs('#purchasePendingCount').textContent = pending;

        const insightWrap = qs('#purchaseInsightList');
        const recentPurchases = appState.purchases.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        if (!recentPurchases.length) {
          insightWrap.innerHTML = `<div class="empty-state">Belum ada pembelian tercatat.</div>`;
        } else {
          insightWrap.innerHTML = `<div class="list-plain">${recentPurchases.map(row => `
            <div class="list-row">
              <div class="stack">
                <strong>${escapeHtml(row.supplier)}</strong>
                <span class="small muted">${escapeHtml(getItemById(row.itemId)?.name || '-')} • Qty ${row.qty}</span>
              </div>
              <div class="stack" style="text-align:right">
                <span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span>
                <span class="small muted">${toCurrency(row.total)}</span>
              </div>
            </div>
          `).join('')}</div>`;
        }

        const tbody = qs('#purchaseTableBody');
        if (!appState.purchases.length) {
          tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">Belum ada data pembelian.</div></td></tr>`;
        } else {
          tbody.innerHTML = appState.purchases
            .slice()
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(row => `
              <tr>
                <td>${formatDate(row.date)}</td>
                <td>${escapeHtml(row.supplier)}</td>
                <td>${escapeHtml(getItemById(row.itemId)?.name || '-')}</td>
                <td>${row.qty}</td>
                <td><span class="badge ${row.status === 'Selesai' ? 'success' : 'warning'}">${escapeHtml(row.status)}</span></td>
                <td>${toCurrency(row.costPrice)}</td>
                <td>${toCurrency(row.total)}</td>
                <td class="actions-cell no-print">
                  <button class="btn secondary small" data-action="edit-purchase" data-id="${row.id}">Edit</button>
                  <button class="btn danger small" data-action="delete-purchase" data-id="${row.id}">Delete</button>
                </td>
              </tr>
            `).join('');
        }
      }

      function renderAll() {
        refreshSelectOptions();
        renderHome();
        renderCategories();
        renderItems();
        renderInventory();
        renderSales();
        renderPurchases();
      }

      function resetCategoryForm() {
        qs('#categoryEditId').value = '';
        qs('#categoryName').value = '';
        qs('#saveCategoryBtn').textContent = 'Simpan Kategori';
      }

      function resetItemForm() {
        qs('#itemEditId').value = '';
        qs('#itemCode').value = '';
        qs('#itemName').value = '';
        qs('#itemCategory').value = '';
        qs('#itemSubCategory').value = '';
        qs('#itemType').value = '';
        qs('#itemInitialStock').value = '';
        qs('#itemMinStock').value = '';
        qs('#itemCostPrice').value = '';
        qs('#itemSellPrice').value = '';
        qs('#saveItemBtn').textContent = 'Simpan Item';
      }

      function addInventoryRecord({ itemId, type, qty, note, source = 'manual', date = nowISO() }) {
        appState.inventory.push({
          id: uid('inv'),
          itemId,
          type,
          qty: toInt(qty),
          note,
          source,
          date
        });
      }

      function handleCategorySubmit(e) {
        e.preventDefault();
        const name = qs('#categoryName').value.trim();
        const editId = qs('#categoryEditId').value;
        if (!name) {
          showToast('Nama kategori wajib diisi.', 'error');
          return;
        }
        const duplicate = appState.categories.find(cat => cat.name.toLowerCase() === name.toLowerCase() && cat.id !== editId);
        if (duplicate) {
          showToast('Nama kategori sudah ada.', 'error');
          return;
        }
        if (editId) {
          const category = getCategoryById(editId);
          category.name = name;
          category.updatedAt = nowISO();
          showToast('Kategori berhasil diperbarui.');
        } else {
          appState.categories.push({
            id: uid('cat'),
            name,
            createdAt: nowISO()
          });
          showToast('Kategori berhasil ditambahkan.');
        }
        saveState();
        resetCategoryForm();
        renderAll();
      }

      function handleItemSubmit(e) {
        e.preventDefault();
        if (!appState.categories.length) {
          showToast('Buat kategori terlebih dahulu sebelum menambah item.', 'error');
          return;
        }
        const editId = qs('#itemEditId').value;
        const payload = {
          itemId: qs('#itemCode').value.trim(),
          name: qs('#itemName').value.trim(),
          categoryId: qs('#itemCategory').value,
          subCategory: qs('#itemSubCategory').value.trim(),
          type: qs('#itemType').value.trim(),
          initialStock: toInt(qs('#itemInitialStock').value),
          minStock: toInt(qs('#itemMinStock').value),
          costPrice: Number(qs('#itemCostPrice').value || 0),
          sellPrice: Number(qs('#itemSellPrice').value || 0)
        };

        if (!payload.itemId || !payload.name || !payload.categoryId || !payload.subCategory || !payload.type) {
          showToast('Lengkapi semua field item terlebih dahulu.', 'error');
          return;
        }
        if (!getCategoryById(payload.categoryId)) {
          showToast('Kategori item tidak valid.', 'error');
          return;
        }
        if (payload.sellPrice < payload.costPrice) {
          showToast('Harga jual sebaiknya tidak lebih kecil dari harga modal.', 'warning');
        }
        const duplicate = appState.items.find(item => item.itemId.toLowerCase() === payload.itemId.toLowerCase() && item.id !== editId);
        if (duplicate) {
          showToast('ID Item sudah digunakan.', 'error');
          return;
        }

        if (editId) {
          const item = getItemById(editId);
          const deltaInitial = payload.initialStock - toInt(item.initialStock);
          item.itemId = payload.itemId;
          item.name = payload.name;
          item.categoryId = payload.categoryId;
          item.subCategory = payload.subCategory;
          item.type = payload.type;
          item.stock = Math.max(0, toInt(item.stock) + deltaInitial);
          item.initialStock = payload.initialStock;
          item.minStock = payload.minStock;
          item.costPrice = payload.costPrice;
          item.sellPrice = payload.sellPrice;
          item.updatedAt = nowISO();
          showToast('Item berhasil diperbarui.');
        } else {
          appState.items.push({
            id: uid('item'),
            ...payload,
            stock: payload.initialStock,
            createdAt: nowISO()
          });
          showToast('Item berhasil ditambahkan.');
        }
        saveState();
        resetItemForm();
        renderAll();
      }

      function handleInventorySubmit(e) {
        e.preventDefault();
        const editId = qs('#inventoryEditId').value;
        const itemId = qs('#inventoryItem').value;
        const type = qs('#inventoryType').value;
        const qty = toInt(qs('#inventoryQty').value);
        const note = qs('#inventoryNote').value.trim();
        const item = getItemById(itemId);

        if (!itemId || !item) {
          showToast('Pilih item terlebih dahulu.', 'error');
          return;
        }
        if (qty <= 0) {
          showToast('Jumlah movement harus lebih dari 0.', 'error');
          return;
        }

        if (editId) {
          const existing = appState.inventory.find(row => row.id === editId);
          if (!existing || existing.source !== 'manual') {
            showToast('Data inventory manual yang mau diedit tidak ditemukan.', 'error');
            return;
          }

          const oldDelta = inventoryEffect(existing.type, existing.qty);
          const newDelta = inventoryEffect(type, qty);
          const stockCheck = canApplyStockChanges([
            { itemId: existing.itemId, delta: -oldDelta },
            { itemId, delta: newDelta }
          ]);

          if (!stockCheck.ok) {
            showToast(stockCheck.message, 'error');
            return;
          }

          existing.itemId = itemId;
          existing.type = type;
          existing.qty = qty;
          existing.note = note;
          existing.source = 'manual';
          existing.refType = 'inventory';
          existing.refId = existing.refId || existing.id;

          recalculateStocksFromInventory();
          saveState();
          resetInventoryForm();
          renderAll();
          showToast('Movement inventory berhasil diupdate.');
          return;
        }

        const stockCheck = canApplyStockChanges([{ itemId, delta: inventoryEffect(type, qty) }]);
        if (!stockCheck.ok) {
          showToast(stockCheck.message, 'error');
          return;
        }

        addInventoryRecord({ itemId, type, qty, note, source: 'manual', refType: 'inventory' });
        recalculateStocksFromInventory();

        saveState();
        resetInventoryForm();
        renderAll();
        showToast(`Movement ${type} berhasil disimpan.`);
      }

      function handleSalesSubmit(e) {
        e.preventDefault();
        const editId = qs('#salesEditId').value;
        const customer = qs('#salesCustomer').value.trim();
        const itemId = qs('#salesItem').value;
        const qty = toInt(qs('#salesQty').value);
        const status = qs('#salesStatus').value;
        const item = getItemById(itemId);

        if (!customer || !itemId || !item || qty <= 0) {
          showToast('Lengkapi data penjualan dengan benar.', 'error');
          return;
        }

        if (editId) {
          const existing = appState.sales.find(row => row.id === editId);
          if (!existing) {
            showToast('Data penjualan yang mau diedit tidak ditemukan.', 'error');
            return;
          }

          const stockCheck = canApplyStockChanges([
            { itemId: existing.itemId, delta: existing.qty },
            { itemId, delta: -qty }
          ]);
          if (!stockCheck.ok) {
            showToast(stockCheck.message, 'error');
            return;
          }

          existing.customer = customer;
          existing.itemId = itemId;
          existing.qty = qty;
          existing.status = status;
          existing.sellPrice = Number(item.sellPrice || 0);
          existing.total = qty * Number(item.sellPrice || 0);

          syncSaleInventoryRecord(existing);
          recalculateStocksFromInventory();

          saveState();
          resetSalesForm();
          renderAll();
          showToast('Transaksi penjualan berhasil diupdate.');
          return;
        }

        const stockCheck = canApplyStockChanges([{ itemId, delta: -qty }]);
        if (!stockCheck.ok) {
          showToast(stockCheck.message, 'error');
          return;
        }

        const sale = {
          id: uid('sale'),
          customer,
          itemId,
          qty,
          status,
          sellPrice: Number(item.sellPrice || 0),
          total: qty * Number(item.sellPrice || 0),
          date: nowISO()
        };
        appState.sales.push(sale);
        syncSaleInventoryRecord(sale);
        recalculateStocksFromInventory();

        saveState();
        resetSalesForm();
        renderAll();
        showToast('Penjualan berhasil disimpan.');
      }

      function handlePurchaseSubmit(e) {
        e.preventDefault();
        const editId = qs('#purchaseEditId').value;
        const supplier = qs('#purchaseSupplier').value.trim();
        const itemId = qs('#purchaseItem').value;
        const qty = toInt(qs('#purchaseQty').value);
        const status = qs('#purchaseStatus').value;
        const item = getItemById(itemId);

        if (!supplier || !itemId || !item || qty <= 0) {
          showToast('Lengkapi data pembelian dengan benar.', 'error');
          return;
        }

        if (editId) {
          const existing = appState.purchases.find(row => row.id === editId);
          if (!existing) {
            showToast('Data pembelian yang mau diedit tidak ditemukan.', 'error');
            return;
          }

          const stockCheck = canApplyStockChanges([
            { itemId: existing.itemId, delta: -existing.qty },
            { itemId, delta: qty }
          ]);
          if (!stockCheck.ok) {
            showToast(stockCheck.message, 'error');
            return;
          }

          existing.supplier = supplier;
          existing.itemId = itemId;
          existing.qty = qty;
          existing.status = status;
          existing.costPrice = Number(item.costPrice || 0);
          existing.total = qty * Number(item.costPrice || 0);

          syncPurchaseInventoryRecord(existing);
          recalculateStocksFromInventory();

          saveState();
          resetPurchaseForm();
          renderAll();
          showToast('Transaksi pembelian berhasil diupdate.');
          return;
        }

        const purchase = {
          id: uid('purchase'),
          supplier,
          itemId,
          qty,
          status,
          costPrice: Number(item.costPrice || 0),
          total: qty * Number(item.costPrice || 0),
          date: nowISO()
        };
        appState.purchases.push(purchase);
        syncPurchaseInventoryRecord(purchase);
        recalculateStocksFromInventory();

        saveState();
        resetPurchaseForm();
        renderAll();
        showToast('Pembelian berhasil disimpan.');
      }

      function handleTableActions(e) {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === 'edit-category') {
          const category = getCategoryById(id);
          if (!category) return;
          qs('#categoryEditId').value = category.id;
          qs('#categoryName').value = category.name;
          qs('#saveCategoryBtn').textContent = 'Update Kategori';
          qs('#categoryName').focus();
          return;
        }

        if (action === 'delete-category') {
          const used = appState.items.some(item => item.categoryId === id);
          if (used) {
            showToast('Kategori yang masih dipakai item tidak boleh dihapus.', 'error');
            return;
          }
          const category = getCategoryById(id);
          if (category && confirm(`Hapus kategori "${category.name}"?`)) {
            appState.categories = appState.categories.filter(cat => cat.id !== id);
            saveState();
            renderAll();
            resetCategoryForm();
            showToast('Kategori berhasil dihapus.');
          }
          return;
        }

        if (action === 'edit-item') {
          const item = getItemById(id);
          if (!item) return;
          qs('#itemEditId').value = item.id;
          qs('#itemCode').value = item.itemId;
          qs('#itemName').value = item.name;
          qs('#itemCategory').value = item.categoryId;
          qs('#itemSubCategory').value = item.subCategory;
          qs('#itemType').value = item.type;
          qs('#itemInitialStock').value = item.initialStock;
          qs('#itemMinStock').value = item.minStock;
          qs('#itemCostPrice').value = item.costPrice;
          qs('#itemSellPrice').value = item.sellPrice;
          qs('#saveItemBtn').textContent = 'Update Item';
          openSection('items');
          qs('#itemCode').focus();
          return;
        }

        if (action === 'delete-item') {
          const related = appState.inventory.some(row => row.itemId === id)
            || appState.sales.some(row => row.itemId === id)
            || appState.purchases.some(row => row.itemId === id);

          if (related) {
            showToast('Item yang sudah punya riwayat transaksi tidak bisa dihapus.', 'error');
            return;
          }

          const item = getItemById(id);
          if (item && confirm(`Hapus item "${item.name}"?`)) {
            appState.items = appState.items.filter(row => row.id !== id);
            saveState();
            renderAll();
            resetItemForm();
            showToast('Item berhasil dihapus.');
          }
          return;
        }

        if (action === 'edit-inventory') {
          const row = appState.inventory.find(inv => inv.id === id);
          if (!row || row.source !== 'manual') {
            showToast('Hanya movement manual yang bisa diedit dari form inventory.', 'warning');
            return;
          }
          qs('#inventoryEditId').value = row.id;
          qs('#inventoryItem').value = row.itemId;
          qs('#inventoryType').value = row.type;
          qs('#inventoryQty').value = row.qty;
          qs('#inventoryNote').value = row.note || '';
          qs('#saveInventoryBtn').textContent = 'Update Movement';
          openSection('inventory');
          qs('#inventoryQty').focus();
          return;
        }

        if (action === 'delete-inventory') {
          const row = appState.inventory.find(inv => inv.id === id);
          if (!row || row.source !== 'manual') {
            showToast('Hanya movement manual yang bisa dihapus dari tabel inventory.', 'warning');
            return;
          }
          const stockCheck = canApplyStockChanges([{ itemId: row.itemId, delta: -inventoryEffect(row.type, row.qty) }]);
          if (!stockCheck.ok) {
            showToast(stockCheck.message, 'error');
            return;
          }
          if (confirm('Hapus movement inventory ini?')) {
            appState.inventory = appState.inventory.filter(inv => inv.id !== id);
            recalculateStocksFromInventory();
            saveState();
            renderAll();
            resetInventoryForm();
            showToast('Movement inventory berhasil dihapus.');
          }
          return;
        }

        if (action === 'edit-sale') {
          const sale = appState.sales.find(row => row.id === id);
          if (!sale) {
            showToast('Data penjualan tidak ditemukan.', 'error');
            return;
          }
          qs('#salesEditId').value = sale.id;
          qs('#salesCustomer').value = sale.customer;
          qs('#salesItem').value = sale.itemId;
          qs('#salesQty').value = sale.qty;
          qs('#salesStatus').value = sale.status;
          qs('#saveSalesBtn').textContent = 'Update Penjualan';
          openSection('sales');
          qs('#salesCustomer').focus();
          return;
        }

        if (action === 'delete-sale') {
          const sale = appState.sales.find(row => row.id === id);
          if (!sale) {
            showToast('Data penjualan tidak ditemukan.', 'error');
            return;
          }
          if (confirm(`Hapus transaksi penjualan untuk "${sale.customer}"?`)) {
            appState.sales = appState.sales.filter(row => row.id !== id);
            appState.inventory = appState.inventory.filter(row => !(row.refType === 'sale' && row.refId === id));
            recalculateStocksFromInventory();
            saveState();
            renderAll();
            resetSalesForm();
            showToast('Transaksi penjualan berhasil dihapus.');
          }
          return;
        }

        if (action === 'edit-purchase') {
          const purchase = appState.purchases.find(row => row.id === id);
          if (!purchase) {
            showToast('Data pembelian tidak ditemukan.', 'error');
            return;
          }
          qs('#purchaseEditId').value = purchase.id;
          qs('#purchaseSupplier').value = purchase.supplier;
          qs('#purchaseItem').value = purchase.itemId;
          qs('#purchaseQty').value = purchase.qty;
          qs('#purchaseStatus').value = purchase.status;
          qs('#savePurchaseBtn').textContent = 'Update Pembelian';
          openSection('purchases');
          qs('#purchaseSupplier').focus();
          return;
        }

        if (action === 'delete-purchase') {
          const purchase = appState.purchases.find(row => row.id === id);
          if (!purchase) {
            showToast('Data pembelian tidak ditemukan.', 'error');
            return;
          }
          const stockCheck = canApplyStockChanges([{ itemId: purchase.itemId, delta: -purchase.qty }]);
          if (!stockCheck.ok) {
            showToast(stockCheck.message + ' Hapus atau edit transaksi keluar terkait terlebih dahulu.', 'error');
            return;
          }
          if (confirm(`Hapus transaksi pembelian dari "${purchase.supplier}"?`)) {
            appState.purchases = appState.purchases.filter(row => row.id !== id);
            appState.inventory = appState.inventory.filter(row => !(row.refType === 'purchase' && row.refId === id));
            recalculateStocksFromInventory();
            saveState();
            renderAll();
            resetPurchaseForm();
            showToast('Transaksi pembelian berhasil dihapus.');
          }
        }
      }

      function buildRowsHtml(headers, rows) {
        return `
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Tidak ada data</td></tr>`}
            </tbody>
          </table>
        `;
      }

      function exportExcel(filename, title, sections) {
        const htmlSections = sections.map(section => `
          <h2 style="font-family:Arial,sans-serif">${escapeHtml(section.title)}</h2>
          ${buildRowsHtml(section.headers, section.rows)}
          <br>
        `).join('');

        const html = `
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body{font-family:Arial,sans-serif;padding:20px}
                table{border-collapse:collapse;width:100%;margin-bottom:20px}
                th,td{border:1px solid #999;padding:8px;text-align:left}
                th{background:#f0f4ff}
              </style>
            </head>
            <body>
              <h1>${escapeHtml(title)}</h1>
              <p>Dibuat: ${escapeHtml(new Date().toLocaleString('id-ID'))}</p>
              ${htmlSections}
            </body>
          </html>
        `;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      }

      function openPrintWindow(title, sections) {
        const printWindow = window.open('', '_blank', 'width=1200,height=900');
        const htmlSections = sections.map(section => `
          <section style="margin-bottom:28px">
            <h2>${escapeHtml(section.title)}</h2>
            ${buildRowsHtml(section.headers, section.rows)}
          </section>
        `).join('');

        printWindow.document.write(`
          <html>
            <head>
              <meta charset="UTF-8">
              <title>${escapeHtml(title)}</title>
              <style>
                body{font-family:Arial,sans-serif;padding:24px;color:#111}
                h1,h2{margin:0 0 12px}
                p{margin:0 0 18px;color:#555}
                table{width:100%;border-collapse:collapse;font-size:12px}
                th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}
                th{background:#f3f6fb}
                @media print{body{padding:0}}
              </style>
            </head>
            <body>
              <h1>${escapeHtml(title)}</h1>
              <p>Dibuat: ${escapeHtml(new Date().toLocaleString('id-ID'))}</p>
              ${htmlSections}
              <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); }<\/script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }

      function getItemsExportRows() {
        return getFilteredItems().map(item => [
          item.itemId,
          item.name,
          getCategoryName(item.categoryId),
          item.subCategory,
          item.type,
          String(item.stock),
          String(item.minStock),
          String(item.costPrice),
          String(item.sellPrice)
        ]);
      }

      function getInventoryExportRows() {
        return appState.inventory
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map(row => [
            formatDate(row.date),
            getItemById(row.itemId)?.name || '-',
            row.type,
            String(row.qty),
            row.source || 'manual',
            row.note || ''
          ]);
      }

      function getSalesExportRows() {
        return appState.sales
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map(row => [
            formatDate(row.date),
            row.customer,
            getItemById(row.itemId)?.name || '-',
            String(row.qty),
            row.status,
            String(row.sellPrice),
            String(row.total)
          ]);
      }

      function getPurchasesExportRows() {
        return appState.purchases
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map(row => [
            formatDate(row.date),
            row.supplier,
            getItemById(row.itemId)?.name || '-',
            String(row.qty),
            row.status,
            String(row.costPrice),
            String(row.total)
          ]);
      }

      function exportItemsExcel() {
        exportExcel('items-keydup.xls', 'Export Items', [{
          title: 'Items',
          headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
          rows: getItemsExportRows()
        }]);
      }

      function exportInventoryExcel() {
        exportExcel('inventory-keydup.xls', 'Export Inventory', [{
          title: 'Inventory',
          headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
          rows: getInventoryExportRows()
        }]);
      }

      function exportSalesExcel() {
        exportExcel('sales-keydup.xls', 'Export Sales', [{
          title: 'Sales',
          headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
          rows: getSalesExportRows()
        }]);
      }

      function exportPurchasesExcel() {
        exportExcel('purchases-keydup.xls', 'Export Purchases', [{
          title: 'Purchases',
          headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
          rows: getPurchasesExportRows()
        }]);
      }

      function exportAllExcel() {
        exportExcel('all-data-keydup.xls', 'Export Semua Data KeyDup', [
          {
            title: 'Items',
            headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
            rows: appState.items.map(item => [item.itemId, item.name, getCategoryName(item.categoryId), item.subCategory, item.type, String(item.stock), String(item.minStock), String(item.costPrice), String(item.sellPrice)])
          },
          {
            title: 'Inventory',
            headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
            rows: getInventoryExportRows()
          },
          {
            title: 'Sales',
            headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
            rows: getSalesExportRows()
          },
          {
            title: 'Purchases',
            headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
            rows: getPurchasesExportRows()
          }
        ]);
      }

      function exportItemsPdf() {
        openPrintWindow('Export Items', [{
          title: 'Items',
          headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
          rows: getItemsExportRows()
        }]);
      }

      function exportInventoryPdf() {
        openPrintWindow('Export Inventory', [{
          title: 'Inventory',
          headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
          rows: getInventoryExportRows()
        }]);
      }

      function exportSalesPdf() {
        openPrintWindow('Export Sales', [{
          title: 'Sales',
          headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
          rows: getSalesExportRows()
        }]);
      }

      function exportPurchasesPdf() {
        openPrintWindow('Export Purchases', [{
          title: 'Purchases',
          headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
          rows: getPurchasesExportRows()
        }]);
      }

      function exportAllPdf() {
        openPrintWindow('Export Semua Data KeyDup', [
          {
            title: 'Items',
            headers: ['ID Item', 'Nama', 'Kategori', 'Sub Kategori', 'Tipe', 'Stok', 'Min', 'Harga Modal', 'Harga Jual'],
            rows: appState.items.map(item => [item.itemId, item.name, getCategoryName(item.categoryId), item.subCategory, item.type, String(item.stock), String(item.minStock), String(item.costPrice), String(item.sellPrice)])
          },
          {
            title: 'Inventory',
            headers: ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Sumber', 'Keterangan'],
            rows: getInventoryExportRows()
          },
          {
            title: 'Sales',
            headers: ['Tanggal', 'Pelanggan', 'Item', 'Qty', 'Status', 'Harga Jual', 'Total'],
            rows: getSalesExportRows()
          },
          {
            title: 'Purchases',
            headers: ['Tanggal', 'Supplier', 'Item', 'Qty', 'Status', 'Harga Modal', 'Total'],
            rows: getPurchasesExportRows()
          }
        ]);
      }

      function createSampleData() {
        const now = new Date();
        const dateOffset = (days, hours = 0) => {
          const d = new Date(now);
          d.setDate(d.getDate() + days);
          d.setHours(d.getHours() + hours);
          return d.toISOString();
        };

        const categories = [
          { id: uid('cat'), name: 'Kunci Rumah', createdAt: dateOffset(-20) },
          { id: uid('cat'), name: 'Kunci Kendaraan', createdAt: dateOffset(-19) },
          { id: uid('cat'), name: 'Aksesoris & Hardware', createdAt: dateOffset(-18) }
        ];

        const item1 = {
          id: uid('item'),
          itemId: 'IK-001',
          name: 'Blank Kunci Rumah A1',
          categoryId: categories[0].id,
          subCategory: 'Brass',
          type: 'Single Sided',
          initialStock: 80,
          minStock: 20,
          costPrice: 4500,
          sellPrice: 9000,
          stock: 0,
          createdAt: dateOffset(-18)
        };
        const item2 = {
          id: uid('item'),
          itemId: 'IK-002',
          name: 'Blank Kunci Motor Yamaha',
          categoryId: categories[1].id,
          subCategory: 'Yamaha',
          type: 'Laser',
          initialStock: 45,
          minStock: 12,
          costPrice: 9000,
          sellPrice: 18000,
          stock: 0,
          createdAt: dateOffset(-17)
        };
        const item3 = {
          id: uid('item'),
          itemId: 'IK-003',
          name: 'Silinder Kunci Pintu 60mm',
          categoryId: categories[2].id,
          subCategory: 'Silinder',
          type: 'Double',
          initialStock: 18,
          minStock: 8,
          costPrice: 48000,
          sellPrice: 85000,
          stock: 0,
          createdAt: dateOffset(-16)
        };
        const item4 = {
          id: uid('item'),
          itemId: 'IK-004',
          name: 'Remote Shell Mobil Toyota',
          categoryId: categories[1].id,
          subCategory: 'Toyota',
          type: 'Remote Case',
          initialStock: 10,
          minStock: 5,
          costPrice: 25000,
          sellPrice: 45000,
          stock: 0,
          createdAt: dateOffset(-15)
        };
        const item5 = {
          id: uid('item'),
          itemId: 'IK-005',
          name: 'Gembok Mini Stainless',
          categoryId: categories[2].id,
          subCategory: 'Gembok',
          type: 'Stainless',
          initialStock: 30,
          minStock: 10,
          costPrice: 22000,
          sellPrice: 35000,
          stock: 0,
          createdAt: dateOffset(-14)
        };

        const items = [item1, item2, item3, item4, item5];

        const purchases = [
          { id: uid('purchase'), supplier: 'CV Multi Kunci', itemId: item1.id, qty: 60, status: 'Selesai', costPrice: item1.costPrice, total: 270000, date: dateOffset(-10) },
          { id: uid('purchase'), supplier: 'PT Kunci Aman', itemId: item2.id, qty: 40, status: 'Pending', costPrice: item2.costPrice, total: 360000, date: dateOffset(-7) },
          { id: uid('purchase'), supplier: 'PT Remote Prima', itemId: item4.id, qty: 5, status: 'Selesai', costPrice: item4.costPrice, total: 125000, date: dateOffset(-6) }
        ];

        const sales = [
          { id: uid('sale'), customer: 'Bapak Andi', itemId: item1.id, qty: 10, status: 'Selesai', sellPrice: item1.sellPrice, total: 90000, date: dateOffset(-8) },
          { id: uid('sale'), customer: 'Ibu Rina', itemId: item2.id, qty: 12, status: 'Pending', sellPrice: item2.sellPrice, total: 216000, date: dateOffset(-5) },
          { id: uid('sale'), customer: 'Toko Maju', itemId: item3.id, qty: 4, status: 'Selesai', sellPrice: item3.sellPrice, total: 340000, date: dateOffset(-4) },
          { id: uid('sale'), customer: 'Pak Dedi', itemId: item4.id, qty: 8, status: 'Selesai', sellPrice: item4.sellPrice, total: 360000, date: dateOffset(-3) },
          { id: uid('sale'), customer: 'Bengkel Sentosa', itemId: item5.id, qty: 6, status: 'Selesai', sellPrice: item5.sellPrice, total: 210000, date: dateOffset(-2) }
        ];

        const manualInvId = uid('inv');
        const inventory = [
          { id: uid('inv'), itemId: item1.id, type: 'IN', qty: 60, note: 'Pembelian dari CV Multi Kunci (Selesai)', source: 'purchases', date: purchases[0].date, refType: 'purchase', refId: purchases[0].id },
          { id: uid('inv'), itemId: item2.id, type: 'IN', qty: 40, note: 'Pembelian dari PT Kunci Aman (Pending)', source: 'purchases', date: purchases[1].date, refType: 'purchase', refId: purchases[1].id },
          { id: uid('inv'), itemId: item4.id, type: 'IN', qty: 5, note: 'Pembelian dari PT Remote Prima (Selesai)', source: 'purchases', date: purchases[2].date, refType: 'purchase', refId: purchases[2].id },
          { id: uid('inv'), itemId: item1.id, type: 'OUT', qty: 10, note: 'Penjualan ke Bapak Andi (Selesai)', source: 'sales', date: sales[0].date, refType: 'sale', refId: sales[0].id },
          { id: uid('inv'), itemId: item2.id, type: 'OUT', qty: 12, note: 'Penjualan ke Ibu Rina (Pending)', source: 'sales', date: sales[1].date, refType: 'sale', refId: sales[1].id },
          { id: uid('inv'), itemId: item3.id, type: 'OUT', qty: 4, note: 'Penjualan ke Toko Maju (Selesai)', source: 'sales', date: sales[2].date, refType: 'sale', refId: sales[2].id },
          { id: uid('inv'), itemId: item4.id, type: 'OUT', qty: 8, note: 'Penjualan ke Pak Dedi (Selesai)', source: 'sales', date: sales[3].date, refType: 'sale', refId: sales[3].id },
          { id: uid('inv'), itemId: item5.id, type: 'OUT', qty: 6, note: 'Penjualan ke Bengkel Sentosa (Selesai)', source: 'sales', date: sales[4].date, refType: 'sale', refId: sales[4].id },
          { id: manualInvId, itemId: item1.id, type: 'OUT', qty: 12, note: 'Stok opname rusak/afkir', source: 'manual', date: dateOffset(-1, -2), refType: 'inventory', refId: manualInvId }
        ];

        return { categories, items, inventory, sales, purchases };
      }

      function loadSampleData() {
        if (!confirm('Load sample akan menimpa data saat ini. Lanjutkan?')) return;
        const sample = createSampleData();
        appState.categories = sample.categories;
        appState.items = sample.items;
        appState.inventory = sample.inventory;
        appState.sales = sample.sales;
        appState.purchases = sample.purchases;
        normalizeState();
        saveState();
        resetCategoryForm();
        resetItemForm();
        resetInventoryForm();
        resetSalesForm();
        resetPurchaseForm();
        renderAll();
        showToast('Sample data berhasil dimuat.');
      }

      function resetAllData() {
        if (!confirm('Reset Data akan menghapus seluruh kategori, item, inventory, sales, dan purchases. Lanjutkan?')) return;
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        loadState();
        resetCategoryForm();
        resetItemForm();
        resetInventoryForm();
        resetSalesForm();
        resetPurchaseForm();
        renderAll();
        showToast('Semua data berhasil direset.', 'warning');
      }

      function bindEvents() {

        qs('#logoutBtn').addEventListener('click', () => {
          sessionStorage.removeItem(SESSION_KEY);
          closeSidebar();
          window.location.replace(LOGIN_PAGE);
        });

        qs('#menuToggle').addEventListener('click', openSidebar);
        qs('#sidebarBackdrop').addEventListener('click', closeSidebar);

        qsa('.nav-btn').forEach(btn => btn.addEventListener('click', () => openSection(btn.dataset.section)));
        qsa('[data-open-section]').forEach(btn => btn.addEventListener('click', () => openSection(btn.dataset.openSection)));

        qs('#categoryForm').addEventListener('submit', handleCategorySubmit);
        qs('#itemForm').addEventListener('submit', handleItemSubmit);
        qs('#inventoryForm').addEventListener('submit', handleInventorySubmit);
        qs('#salesForm').addEventListener('submit', handleSalesSubmit);
        qs('#purchaseForm').addEventListener('submit', handlePurchaseSubmit);

        qs('#cancelCategoryEditBtn').addEventListener('click', resetCategoryForm);
        qs('#cancelItemEditBtn').addEventListener('click', resetItemForm);
        qs('#cancelInventoryEditBtn').addEventListener('click', resetInventoryForm);
        qs('#cancelSalesEditBtn').addEventListener('click', resetSalesForm);
        qs('#cancelPurchaseEditBtn').addEventListener('click', resetPurchaseForm);

        qs('#categoryTableBody').addEventListener('click', handleTableActions);
        qs('#itemsTableBody').addEventListener('click', handleTableActions);
        qs('#inventoryTableBody').addEventListener('click', handleTableActions);
        qs('#salesTableBody').addEventListener('click', handleTableActions);
        qs('#purchaseTableBody').addEventListener('click', handleTableActions);

        qs('#itemSearch').addEventListener('input', renderItems);
        qs('#itemCategoryFilter').addEventListener('change', () => {
          refreshSelectOptions();
          renderItems();
        });
        qs('#itemSubCategoryFilter').addEventListener('change', renderItems);

        qs('#loadSampleBtn').addEventListener('click', loadSampleData);
        qs('#resetDataBtn').addEventListener('click', resetAllData);

        qs('#exportItemsExcelBtn').addEventListener('click', exportItemsExcel);
        qs('#exportItemsPdfBtn').addEventListener('click', exportItemsPdf);
        qs('#exportInventoryExcelBtn').addEventListener('click', exportInventoryExcel);
        qs('#exportInventoryPdfBtn').addEventListener('click', exportInventoryPdf);
        qs('#exportSalesExcelBtn').addEventListener('click', exportSalesExcel);
        qs('#exportSalesPdfBtn').addEventListener('click', exportSalesPdf);
        qs('#exportPurchasesExcelBtn').addEventListener('click', exportPurchasesExcel);
        qs('#exportPurchasesPdfBtn').addEventListener('click', exportPurchasesPdf);
        qs('#exportAllExcelBtn').addEventListener('click', exportAllExcel);
        qs('#exportAllPdfBtn').addEventListener('click', exportAllPdf);
      }

      function isLoggedIn() {
        return sessionStorage.getItem(SESSION_KEY) === 'true';
      }

      function requireAuth() {
        if (!isLoggedIn()) {
          window.location.replace(LOGIN_PAGE);
          return false;
        }
        return true;
      }

      
function init() {
        if (!requireAuth()) return;
        loadState();
        bindEvents();
        resetCategoryForm();
        resetItemForm();
        resetInventoryForm();
        resetSalesForm();
        resetPurchaseForm();
        openSection('home');
        renderAll();
      }

      init();
    })();