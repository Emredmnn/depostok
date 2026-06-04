// Oturum kontrolü
if(localStorage.getItem('isLoggedIn') !== 'true') { 
    window.location.replace('login.html'); 
} 

emailjs.init("LzIhLTNYH47AasrBj");

const currentRole = (localStorage.getItem('userRole') || 'YÖNETİCİ').toUpperCase();
document.getElementById('roleBadge').textContent = `👤 Rol: ${currentRole}`; 

const mainContainer = document.getElementById('mainContainer');
const addProductColumn = document.getElementById('addProductColumn'); 

if (currentRole === 'GARSON' || currentRole === 'ÜRETİM') { 
    if(addProductColumn) { addProductColumn.remove(); }
    mainContainer.classList.remove('two-columns');
} else { 
    mainContainer.classList.add('two-columns');
} 

window.toggleOrderPanel = function() { 
    const panel = document.getElementById('orderPanelCard'); 
    if(!panel) return; 
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}; 

function startLiveClock() { 
    const clockElement = document.getElementById('liveClockDisplay'); 
    setInterval(() => { 
        const now = new Date(); 
        const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); 
        const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); 
        clockElement.textContent = `📅 ${dateStr} | 🕒 ${timeStr}`; 
    }, 1000);
} 
startLiveClock();

// Firebase Yapılandırması 
const firebaseConfig = { databaseURL: "https://depo-stok-f6389-default-rtdb.europe-west1.firebasedatabase.app/" };
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let inventory = []; 
let activeDepotFilter = 'HEPSİ'; 
let orderBasket = []; 
let currentModalProduct = null; 
let currentModalAction = "";
let isNewPartyWithSkt = false;

function getTodayDateString() { 
    const now = new Date(); 
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - (offset * 60 * 1000)); 
    return localNow.toISOString().split('T')[0];
} 

// Firebase Canlı Veri Dinleme
db.ref('depo_stok').on('value', (snapshot) => { 
    const rawData = snapshot.val(); 
    inventory = []; 
    if (rawData) { 
        Object.keys(rawData).forEach(key => { 
            let item = rawData[key]; 
            if(!item.dbKey || item.dbKey.includes('undefined')) { 
                item.dbKey = key; 
            } 
            inventory.push(item); 
        }); 
    } 
    checkExpiredProducts(rawData); 
    updateOrderProductDropdown(); 
    updateSktAlertBtnState(); 
    renderUi();
}); 

function checkExpiredProducts(rawData) { 
    if (!rawData) return; 
    const todayStr = getTodayDateString();
    Object.keys(rawData).forEach((key) => { 
        const item = rawData[key]; 
        if (item.skt && item.skt < todayStr) { 
            const now = new Date(); 
            db.ref('depo_rapor').push({ 
                time: now.toLocaleString('tr-TR'), 
                rawTime: now.toISOString(), 
                user: 'SİSTEM', 
                product: item.name, 
                type: 'SKT OTOMATİK SİLME', 
                qty: `${item.quantity} ${item.unit}`, 
                backupKey: key, 
                backupDepot: item.depot || 'KURU GIDA', 
                backupUnit: item.unit || 'Adet', 
                backupLimit: item.criticalLimit || 0, 
                backupSkt: item.skt, 
                backupLot: item.lot || null 
            }); 
            db.ref('depo_stok/' + key).remove(); 
        } 
    });
} 

function updateSktAlertBtnState() { 
    const btn = document.getElementById('sktAlertButton'); 
    if(!btn) return; 
    const todayStr = getTodayDateString(); 
    let urgentCount = 0;
    inventory.forEach(item => { 
        if(item.skt && !item.skt.includes('undefined')) { 
            let todayTime = new Date(todayStr).getTime(); 
            let sktTime = new Date(item.skt).getTime(); 
            let diffDays = Math.ceil((sktTime - todayTime) / (1000 * 60 * 60 * 24)); 
            if(diffDays >= 0 && diffDays <= 1) { 
                urgentCount++; 
            } 
        } 
    });
    if(urgentCount > 0) { 
        btn.textContent = `⚠️ SKT Kritik (${urgentCount} Ürün)`; 
        btn.style.display = "block"; 
    } else { 
        btn.style.display = "none";
    } 
} 

window.openSktUrgentModal = function() { 
    const modal = document.getElementById('sktUrgentModal'); 
    const tbody = document.getElementById('sktUrgentTableBody'); 
    if(!modal || !tbody) return;
    tbody.innerHTML = ""; 
    const todayStr = getTodayDateString(); 
    let addedCount = 0;
    inventory.forEach(item => { 
        if(item.skt && !item.skt.includes('undefined')) { 
            let todayTime = new Date(todayStr).getTime(); 
            let sktTime = new Date(item.skt).getTime(); 
            let diffDays = Math.ceil((sktTime - todayTime) / (1000 * 60 * 60 * 24)); 
            if(diffDays >= 0 && diffDays <= 1) { 
                addedCount++; 
                const sParts = item.skt.split('-'); 
                let timeLabel = diffDays === 0 ? "🚨 BUGÜN SON!" : "⏳ 1 Gün Kaldı!"; 
                const tr = document.createElement('tr'); 
                tr.innerHTML = ` 
                    <td><strong>${item.name}</strong> ${item.lot ? `<span class="lot-tag">LOT: ${item.lot}</span>` : ''}</td> 
                    <td><span class="depot-tag">${item.depot || 'KURU GIDA'}</span></td> 
                    <td><strong style="color:#dc3545;">${item.quantity} ${item.unit}</strong></td> 
                    <td><span class="badge-order" style="background:#f8d7da; font-weight:bold; color:#dc3545;">${timeLabel}</span></td> 
                    <td><span class="skt-badge skt-expired" style="text-decoration:none; color: #dc3545;">📅 ${sParts[2]}.${sParts[1]}.${sParts[0]}</span></td> `; 
                tbody.appendChild(tr); 
            } 
        } 
    });
    if(addedCount === 0) { 
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:green; padding:20px; font-weight:bold;">🟢 Son kullanma tarihi kritik seviyede olan bir ürün bulunmuyor.</td></tr>`;
    } 
    modal.style.display = "flex"; 
}; 

window.closeSktUrgentModal = function() { 
    document.getElementById('sktUrgentModal').style.display = "none";
}; 

function updateOrderProductDropdown() { 
    const selectEl = document.getElementById('orderProductSelect');
    if(!selectEl) return; 
    const currentSelected = selectEl.value; 
    selectEl.innerHTML = '<option value="">-- Depodaki Ürünlerden Seçin --</option>';
    let sortedInv = [...inventory].sort((a,b) => a.name.localeCompare(b.name, 'tr')); 
    sortedInv.forEach(item => { 
        const opt = document.createElement('option'); 
        let labelText = item.name; 
        if(item.lot) { labelText += ` [LOT: ${item.lot}]`; } 
        if(item.skt && !item.skt.includes('undefined')) { 
            const p = item.skt.split('-'); 
            labelText += ` (SKT: ${p[2]}.${p[1]}.${p[0]})`; 
        } 
        opt.value = item.dbKey || item.name; 
        opt.textContent = `${labelText} (Mevcut: ${item.quantity} ${item.unit})`; 
        selectEl.appendChild(opt); 
    });
    if(currentSelected) selectEl.value = currentSelected; 
    filterBasketProducts();
} 

window.filterBasketProducts = function() { 
    const input = document.getElementById('basketProductSearch'); 
    if(!input) return; 
    const filter = input.value.toUpperCase();
    const select = document.getElementById('orderProductSelect'); 
    const options = select.getElementsByTagName('option'); 
    for (let i = 0; i < options.length; i++) { 
        if(options[i].value === "") continue;
        const txtValue = options[i].textContent || options[i].innerText; 
        if (txtValue.toUpperCase().indexOf(filter) > -1) { 
            options[i].style.display = ""; 
        } else { 
            options[i].style.display = "none";
        } 
    } 
}; 

window.addItemToBasket = function() { 
    const selectEl = document.getElementById('orderProductSelect'); 
    const qtyInput = document.getElementById('orderQty'); 
    const prodKey = selectEl.value;
    const qty = parseFloat(qtyInput.value); 
    if(!prodKey) { alert("Lütfen listeden bir malzeme seçin!"); return; }
    if(isNaN(qty) || qty <= 0) { alert("Lütfen geçerli bir sipariş miktarı girin!"); return; }
    const item = inventory.find(i => (i.dbKey === prodKey || i.name === prodKey)); 
    if(!item) return; 
    let displayName = item.name;
    if(item.lot) { displayName += ` [LOT: ${item.lot}]`; } 
    if(item.skt && !item.skt.includes('undefined')) { 
        displayName += ` (SKT: ${item.skt.split('-')[2]}.${item.skt.split('-')[1]}.${item.skt.split('-')[0]})`;
    } 
    const existingIndex = orderBasket.findIndex(b => b.key === (item.dbKey || item.name)); 
    if(existingIndex > -1) { 
        orderBasket[existingIndex].qty = parseFloat((orderBasket[existingIndex].qty + qty).toFixed(2));
    } else { 
        orderBasket.push({ key: (item.dbKey || item.name), name: displayName, qty: qty, unit: item.unit }); 
    } 
    qtyInput.value = "";
    selectEl.value = ""; 
    const searchInput = document.getElementById('basketProductSearch'); 
    if(searchInput) { searchInput.value = ""; } 
    filterBasketProducts(); 
    renderBasketVisual();
}; 

window.removeItemFromBasket = function(index) { 
    orderBasket.splice(index, 1); 
    renderBasketVisual();
}; 

function renderBasketVisual() { 
    const ul = document.getElementById('basketListVisual'); 
    const countSpan = document.getElementById('basketCount');
    if(!ul || !countSpan) return; 
    ul.innerHTML = ""; 
    countSpan.textContent = `(${orderBasket.length} Ürün)`;
    if(orderBasket.length === 0) { 
        ul.innerHTML = '<li style="text-align:center; color:#aaa; font-size:12px; padding:10px;">Liste boş. Yukarıdan ürün ekleyin.</li>'; return;
    } 
    orderBasket.forEach((item, index) => { 
        const li = document.createElement('li'); 
        li.className = "basket-item"; 
        li.innerHTML = ` 
            <span>📦 <b>${item.name}</b></span> 
            <span>${item.qty} ${item.unit} <button class="btn-remove-basket-item" onclick="removeItemFromBasket(${index})">×</button></span> `; 
        ul.appendChild(li); 
    });
} 

function renderUi() { 
    const tbody = document.getElementById('liveMaterialsBody'); 
    const tfoot = document.getElementById('tableTotalFooter'); 
    if(!tbody) return; 
    const filterText = document.getElementById('searchInput').value.toLowerCase();
    const selectedDate = document.getElementById('dateFilterInput').value; 
    tbody.innerHTML = ''; 
    if(tfoot) tfoot.innerHTML = ''; 
    const todayStr = getTodayDateString();
    let filteredInventory = inventory.filter(item => { 
        let matchesSearch = item.name.toLowerCase().includes(filterText) || (item.lot && item.lot.toLowerCase().includes(filterText)); 
        let matchesDate = selectedDate ? (item.lastUpdatedDate === selectedDate) : true; 
        let matchesDepot = (activeDepotFilter === 'HEPSİ' || item.depot === activeDepotFilter); 
        return matchesSearch && matchesDepot && matchesDate; 
    });
    if(filteredInventory.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888; padding:20px;">Seçili kriterlere uygun malzeme bulunamadı.</td></tr>'; return;
    } 
    let totalsByUnit = {}; 
    filteredInventory.forEach((item) => { 
        if(item.criticalLimit === undefined) item.criticalLimit = 0; 
        let itemUnit = item.unit || "Adet"; 
        let itemQty = parseFloat(item.quantity) || 0; 
        if(!totalsByUnit[itemUnit]) { totalsByUnit[itemUnit] = 0; } 
        totalsByUnit[itemUnit] += itemQty; 
        let isCritical = item.quantity <= item.criticalLimit; 
        let statusHtml = !isCritical ? `<span class="status-badge status-safe">🟢 Güvenli</span>` : `<span class="status-badge status-critical">🔴 Kritik Stok!</span>`;  
        let displayDate = "---"; 
        if(item.lastUpdatedDate) { 
            const parts = item.lastUpdatedDate.split('-'); 
            if(parts.length === 3) displayDate = `${parts[2]}.${parts[1]}.${parts[0]}`; 
        } 
        let sktHtml = `<span class="skt-badge skt-none">Belirtilmedi</span>`; 
        if(item.skt) { 
            if(item.skt.includes('undefined')) { 
                sktHtml = `<span class="skt-badge skt-expired" style="background:#fff3cd; color:#856404;">⚠️ Hatalı</span>`; 
            } else { 
                const sParts = item.skt.split('-'); 
                sktHtml = (item.skt < todayStr) ? `<span class="skt-badge skt-expired">❌ ${sParts[2]}.${sParts[1]}.${sParts[0]}</span>` : `<span class="skt-badge skt-ok">📅 ${sParts[2]}.${sParts[1]}.${sParts[0]}</span>`;
            } 
        } 
        let itemUniqueId = item.dbKey || item.name.replace(/[.#$\[\]]/g, ""); 
        let buttonsHtml = '';
        if (currentRole === 'GARSON' || currentRole === 'ÜRETİM') { 
            buttonsHtml = `<button class="action-btn btn-drop-stock" onclick="openStockModal('${itemUniqueId}', 'out')">- Düş</button>`;
        } else if (currentRole === 'DEPO') { 
            buttonsHtml = ` 
                <button class="action-btn btn-add-stock" onclick="openStockModal('${itemUniqueId}', 'in')">+ Ekle</button> 
                <button class="action-btn btn-drop-stock" onclick="openStockModal('${itemUniqueId}', 'out')">- Düş</button> 
                <button class="action-btn btn-waste-stock" onclick="openStockModal('${itemUniqueId}', 'waste')">💥 İmha</button> 
                <button class="action-btn btn-edit-stock" onclick="openProductEditModal('${itemUniqueId}')">✏️ Düzenle</button> `;
        } else { 
            buttonsHtml = ` 
                <button class="action-btn btn-add-stock" onclick="openStockModal('${itemUniqueId}', 'in')">+ Ekle</button> 
                <button class="action-btn btn-drop-stock" onclick="openStockModal('${itemUniqueId}', 'out')">- Düş</button> 
                <button class="action-btn btn-waste-stock" onclick="openStockModal('${itemUniqueId}', 'waste')">💥 İmha</button> 
                <button class="action-btn btn-edit-stock" onclick="openProductEditModal('${itemUniqueId}')">✏️ Düzenle</button> 
                <button class="action-btn btn-del-stock" onclick="deleteProductDirect('${itemUniqueId}')">🗑️ Sil</button> `;
        } 
        const tr = document.createElement('tr'); 
        if (isCritical) { tr.className = "row-critical-alert"; }  
        tr.innerHTML = ` 
            <td> <strong>${item.name}</strong> ${item.lot ? `<br><span class="lot-tag">LOT: ${item.lot}</span>` : ''} <span class="date-tag">Gnc: ${displayDate}</span> </td> 
            <td><span class="depot-tag">${item.depot || 'KURU GIDA'}</span></td> 
            <td><strong>${item.quantity} ${item.unit}</strong></td> 
            <td><strong>${item.criticalLimit} ${item.unit}</strong></td> 
            <td>${sktHtml}</td> 
            <td>${statusHtml}</td> 
            <td class="action-btns">${buttonsHtml}</td> `; 
        tbody.appendChild(tr); 
    }); 
    let totalStrings = [];
    for (const [unit, sum] of Object.entries(totalsByUnit)) { 
        totalStrings.push(`${sum.toFixed(2)} ${unit}`); 
    } 
    if(tfoot) { 
        const footTr = document.createElement('tr'); 
        footTr.className = "total-row"; 
        footTr.innerHTML = ` 
            <td colspan="2" style="text-align: right;">🧮 FİLTRELENEN TOPLAM:</td> 
            <td colspan="5">${totalStrings.join(' | ')}</td> `; 
        tfoot.appendChild(footTr);
    } 
} 

window.openStockModal = function(uniqueId, action) { 
    const item = inventory.find(i => (i.dbKey === uniqueId || i.name === uniqueId));
    if(!item) return; 
    currentModalProduct = item; 
    currentModalAction = action; 
    isNewPartyWithSkt = false;  
    const modal = document.getElementById('stockActionModal'); 
    const title = document.getElementById('actionModalTitle');
    const qtyLabel = document.getElementById('actionQtyLabel'); 
    const sktGroup = document.getElementById('partySktGroup');  
    document.getElementById('stockActionForm').reset(); 
    sktGroup.style.display = "none";
    if(action === 'in') { 
        title.textContent = `📥 ${item.name} - Stok Ekleme`; 
        qtyLabel.textContent = `Giriş Yapılacak Miktar (${item.unit})`;
        const changeSkt = confirm(`Mevcut Satır: ${item.name}\n\nBu parti için Lot No veya Son Kullanma Tarihi girmek istiyor musunuz?\n\n(Belirtmek için 'Tamam'a, mevcut satıra sadece miktar eklemek için 'İptal'e basın)`);
        if(changeSkt) { 
            isNewPartyWithSkt = true; 
            sktGroup.style.display = "block"; 
            title.textContent = `✨ ${item.name} - Stok Girişi & SKT / LOT Atama`;
        } 
    } else if(action === 'out') { 
        title.textContent = `📤 ${item.name} - Stok Düşme`; 
        qtyLabel.textContent = `Düşülecek Miktar (${item.unit})`;
    } else if(action === 'waste') { 
        title.textContent = `💥 ${item.name} - İmha / Fire`; 
        qtyLabel.textContent = `İmha Edilecek Miktar (${item.unit})`;
    } 
    modal.style.display = "flex"; 
}; 

window.closeStockActionModal = function() { 
    document.getElementById('stockActionModal').style.display = "none"; 
    currentModalProduct = null;
}; 

document.getElementById('stockActionForm').addEventListener('submit', function(e) { 
    e.preventDefault(); 
    if(!currentModalProduct) return; 
    const item = currentModalProduct; 
    const qty = parseFloat(document.getElementById('actionModalQty').value); 
    let reportLabel = currentModalAction === 'in' ? 'GİRİŞ' : (currentModalAction === 'out' ? 'ÇIKIŞ' : 'İMHA'); 
    if(isNaN(qty) || qty <= 0) { alert("Geçerli bir miktar giriniz!"); return; }  
    let itemUniqueKey = item.dbKey || item.name.replace(/[.#$\[\]]/g, ""); 
    if (currentModalAction === 'in' && isNewPartyWithSkt) { 
        const newSktVal = document.getElementById('actionModalSkt').value; 
        const newLotVal = document.getElementById('actionModalLot').value.trim().toUpperCase(); 
        if(!newSktVal || newSktVal.includes('undefined')) { alert("Lütfen geçerli bir Son Kullanma Tarihi seçin!"); return; }  
        let baseCleanName = item.name.replace(/[.#$\[\]]/g, ""); 
        let targetKey = baseCleanName + "_" + newSktVal; 
        if(newLotVal) { targetKey += "_" + newLotVal; } 
        let matchExisting = inventory.find(i => i.dbKey === targetKey); 
        let finalQty = matchExisting ? parseFloat((matchExisting.quantity + qty).toFixed(2)) : qty;
        db.ref('depo_stok/' + targetKey).set({ 
            dbKey: targetKey, name: item.name, depot: item.depot, unit: item.unit, 
            quantity: finalQty, criticalLimit: item.criticalLimit, skt: newSktVal, 
            lot: newLotVal || null, lastUpdatedDate: getTodayDateString() 
        });
        db.ref('depo_rapor').push({ 
            time: new Date().toLocaleString('tr-TR'), rawTime: new Date().toISOString(), 
            user: currentRole, product: item.name, type: 'STOK + SKT GİRİŞİ', 
            qty: `${qty} ${item.unit} (LOT: ${newLotVal || 'Yok'})` 
        });
        closeStockActionModal(); 
        return; 
    } 
    let newQty = currentModalAction === 'in' ? parseFloat((item.quantity + qty).toFixed(2)) : parseFloat((item.quantity - qty).toFixed(2));
    if(newQty < 0) newQty = 0; 
    db.ref('depo_stok/' + itemUniqueKey + '/quantity').set(newQty); 
    db.ref('depo_stok/' + itemUniqueKey + '/lastUpdatedDate').set(getTodayDateString());
    db.ref('depo_rapor').push({ 
        time: new Date().toLocaleString('tr-TR'), rawTime: new Date().toISOString(), 
        user: currentRole, product: `${item.name}`, type: reportLabel, 
        qty: `${qty} ${item.unit} ${item.lot ? `[LOT: ${item.lot}]` : ''}` 
    });
    closeStockActionModal(); 
}); 

window.openProductEditModal = function(uniqueId) { 
    const item = inventory.find(i => (i.dbKey === uniqueId || i.name === uniqueId)); 
    if(!item) return;
    currentModalProduct = item; 
    document.getElementById('editProdName').value = item.name; 
    document.getElementById('editProdQty').value = item.quantity; 
    document.getElementById('editProdLimit').value = item.criticalLimit || 0; 
    document.getElementById('editProdLot').value = item.lot || "";
    document.getElementById('editProdSkt').value = item.skt || ""; 
    document.getElementById('productEditModal').style.display = "flex"; 
}; 

window.closeProductEditModal = function() { 
    document.getElementById('productEditModal').style.display = "none"; 
    currentModalProduct = null;
}; 

document.getElementById('productEditForm').addEventListener('submit', function(e) { 
    e.preventDefault(); 
    if(!currentModalProduct) return; 
    const item = currentModalProduct; 
    const newQty = parseFloat(document.getElementById('editProdQty').value); 
    const newLimit = parseFloat(document.getElementById('editProdLimit').value); 
    const newLot = document.getElementById('editProdLot').value.trim().toUpperCase() || null; 
    const newSkt = document.getElementById('editProdSkt').value || null; 
    if(isNaN(newQty) || newQty < 0 || isNaN(newLimit) || newLimit < 0) { alert("Lütfen geçerli pozitif sayılar giriniz!"); return; } 
    let itemUniqueKey = item.dbKey || item.name.replace(/[.#$\[\]]/g, ""); 
    const updates = {}; 
    updates['depo_stok/' + itemUniqueKey + '/quantity'] = newQty; 
    updates['depo_stok/' + itemUniqueKey + '/criticalLimit'] = newLimit; 
    updates['depo_stok/' + itemUniqueKey + '/lot'] = newLot; 
    updates['depo_stok/' + itemUniqueKey + '/skt'] = newSkt; 
    updates['depo_stok/' + itemUniqueKey + '/lastUpdatedDate'] = getTodayDateString();
    db.ref().update(updates).then(() => { 
        db.ref('depo_rapor').push({ 
            time: new Date().toLocaleString('tr-TR'), rawTime: new Date().toISOString(), 
            user: currentRole, product: item.name, type: 'BİLGİ GÜNCELLEME', 
            qty: `Stok: ${newQty}, Lim: ${newLimit}, LOT: ${newLot || 'Yok'}, SKT: ${newSkt || 'Yok'}` 
        }); 
        closeProductEditModal(); 
    }).catch(err => { alert("Hata: " + err.message); });
}); 

const orderFormEl = document.getElementById('orderForm'); 
if(orderFormEl) { 
    orderFormEl.addEventListener('submit', function(e) { 
        e.preventDefault(); 
        if(orderBasket.length === 0) { alert("Sepete en az 1 ürün eklemelisiniz!"); return; } 
        const targetMail = document.getElementById('orderEmail').value; 
        const notes = document.getElementById('orderNotes').value.trim() || "Yok"; 
        if(confirm(`Listede bulunan ${orderBasket.length} malzemeyi sipariş olarak göndermek istiyor musunuz?`)) { 
            const nowStr = new Date().toLocaleString('tr-TR'); 
            const timestampIso = new Date().toISOString(); 
            let basketTextFormat = orderBasket.map(b => `• ${b.name} -> Miktar: ${b.qty} ${b.unit}`).join('\n'); 
            let flatProductsNames = orderBasket.map(b => b.name).join(', '); 
            let flatQuantities = orderBasket.map(b => `${b.qty} ${b.unit}`).join(', '); 
            const emailParams = { 
                name: "Bahçelievler Memorial CT Canlı Stok Sistemi", email: targetMail, 
                to_email: targetMail, product_name: flatProductsNames, quantity: flatQuantities, 
                order_notes: `--- SİPARİŞ LİSTESİ ---\n${basketTextFormat}\n\nEkstra Talep Notu: ${notes}`, 
                sender_role: currentRole, order_date: nowStr 
            };
            emailjs.send("service_wt1igmj", "template_ydhkoa6", emailParams) .then(() => { 
                alert(`✅ Başarılı! Sipariş e-posta olarak iletildi.`); 
            }) .catch((err) => { alert(`❌ Hata Alındı: ${JSON.stringify(err)}`); });
            orderBasket.forEach(bItem => { 
                db.ref('depo_siparisler').push({ time: nowStr, rawTime: timestampIso, user: currentRole, product: bItem.name, qty: `${bItem.qty} ${bItem.unit}`, notes: notes }); 
                db.ref('depo_rapor').push({ time: nowStr, rawTime: timestampIso, user: currentRole, product: bItem.name, type: 'TALEP GÖNDERİLDİ', qty: `${bItem.qty} ${bItem.unit}` }); 
            });
            orderBasket = []; 
            renderBasketVisual(); 
            orderFormEl.reset(); 
            document.getElementById('orderEmail').value = "bahcelievlermemorialct@gmail.com"; 
            document.getElementById('orderPanelCard').style.display = 'none'; 
        } 
    });
} 

window.filterByDepot = function(depotName) { 
    activeDepotFilter = depotName; 
    const buttons = document.querySelectorAll('.btn-depot-filter'); 
    buttons.forEach(btn => { btn.classList.toggle('active', btn.textContent === depotName); });
    renderUi(); 
}; 

window.clearDateFilter = function() { 
    document.getElementById('dateFilterInput').value = ''; 
    renderUi();
}; 

document.getElementById('dateFilterInput').addEventListener('change', renderUi); 
document.getElementById('searchInput').addEventListener('input', renderUi); 

const addFormEl = document.getElementById('addForm'); 
if(addFormEl) { 
    addFormEl.addEventListener('submit', function(e) { 
        e.preventDefault(); 
        let name = document.getElementById('newProdName').value.trim().toUpperCase(); 
        const depot = document.getElementById('newProdDepot').value; 
        const unit = document.getElementById('newProdUnit').value; 
        const qty = parseFloat(document.getElementById('newProdQty').value) || 0; 
        const limit = parseFloat(document.getElementById('newProdLimit').value) || 0; 
        const lotVal = document.getElementById('newProdLot').value.trim().toUpperCase(); 
        const sktVal = document.getElementById('newProdSkt').value; 
        let baseClean = name.replace(/[.#$\[\]]/g, ""); 
        let targetKey = baseClean; 
        if(sktVal && !sktVal.includes('undefined')) { targetKey += "_" + sktVal; } 
        if(lotVal) { targetKey += "_" + lotVal; } 
        if(inventory.some(item => (item.dbKey === targetKey))) { 
            alert("Aynı isim, SKT ve LOT değerlerine sahip bir kayıt envanterde zaten mevcut!"); return; 
        } 
        db.ref('depo_stok/' + targetKey).set({ 
            dbKey: targetKey, name: name, depot: depot, unit: unit, 
            quantity: qty, criticalLimit: limit, skt: sktVal || null, 
            lot: lotVal || null, lastUpdatedDate: getTodayDateString() 
        });
        db.ref('depo_rapor').push({ 
            time: new Date().toLocaleString('tr-TR'), rawTime: new Date().toISOString(), 
            user: currentRole, product: `${name}`, type: 'YENİ ÜRÜN', 
            qty: `${qty} ${unit} ${lotVal ? `(LOT: ${lotVal})` : ''}` 
        });
        addFormEl.reset(); 
    }); 
} 

window.deleteProductDirect = function(uniqueId) { 
    const item = inventory.find(i => i.dbKey === uniqueId);
    if(!item) { 
        if(confirm("Bu kayıt zorunlu olarak silinsin mi?")) { db.ref('depo_stok/' + uniqueId).remove(); } return;
    } 
    if(confirm(`"${item.name}" ürününü depodan kalıcı olarak silmek istediğinize emin misiniz?`)) { 
        const now = new Date();
        db.ref('depo_rapor').push({ 
            time: now.toLocaleString('tr-TR'), rawTime: now.toISOString(), user: currentRole, 
            product: item.name, type: 'ÜRÜN SİLİNDİ', qty: `${item.quantity} ${item.unit}`, 
            backupKey: item.dbKey || uniqueId, backupDepot: item.depot || 'KURU GIDA', 
            backupUnit: item.unit || 'Adet', backupLimit: item.criticalLimit || 0, 
            backupSkt: item.skt || null, backupLot: item.lot || null 
        });
        db.ref('depo_stok/' + uniqueId).remove(); 
    } 
}; 

window.undoDeletedProduct = function(reportFbKey, prodName, bKey, bDepot, bUnit, bQtyStr, bLimit, bSkt, bLot) { 
    if(currentRole !== 'YÖNETİCİ') { 
        alert("Geri alma yetkisi sadece yöneticilere aittir!"); return;
    } 
    if(confirm(`"${prodName}" ürününü depoya geri yüklemek istiyor musunuz?`)) { 
        let parsedQty = parseFloat(bQtyStr) || 0;
        let targetKey = (bKey && bKey !== 'undefined') ? bKey : prodName.replace(/[.#$\[\]]/g, "");
        db.ref('depo_stok/' + targetKey).set({ 
            dbKey: targetKey, name: prodName, depot: bDepot || 'KURU GIDA', 
            unit: bUnit || 'Adet', quantity: parsedQty, criticalLimit: parseFloat(bLimit) || 0, 
            skt: (bSkt && bSkt !== 'null' && bSkt !== 'undefined') ? bSkt : null, 
            lot: (bLot && bLot !== 'null' && bLot !== 'undefined') ? bLot : null, 
            lastUpdatedDate: getTodayDateString() 
        });
        db.ref('depo_rapor/' + reportFbKey).remove().then(() => { 
            alert("✓ Ürün başarıyla depoya geri yüklendi!"); 
            document.getElementById('openReportBtn').click(); 
        }); 
    } 
}; 

// --- MODAL KONTROLLERİ ---
const reportModal = document.getElementById('reportModal');
const ordersListModal = document.getElementById('ordersListModal'); 

// Rapor Modalı Açma
document.getElementById('openReportBtn').addEventListener('click', () => { 
    db.ref('depo_rapor').once('value', (snapshot) => { 
        const tbody = document.getElementById('reportTableBody'); 
        const clearAllBtn = document.getElementById('clearAllReportsBtn'); 
        tbody.innerHTML = ''; 
        if(currentRole === 'YÖNETİCİ') { clearAllBtn.style.display = 'block'; } else { clearAllBtn.style.display = 'none'; } 
        let modalReports = snapshot.val() ? Object.entries(snapshot.val()) : []; 
        if(modalReports.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888;">Kayıt bulunamadı.</td></tr>`; 
        } else { 
            modalReports.sort((a, b) => new Date(b[1].rawTime) - new Date(a[1].rawTime)); 
            modalReports.forEach(([fbKey, rep]) => { 
                let actionButtonsHtml = ''; 
                if((rep.type === 'ÜRÜN SİLİNDİ' || rep.type === 'SKT OTOMATİK SİLME') && rep.backupKey && currentRole === 'YÖNETİCİ') { 
                    actionButtonsHtml += `<button class="btn-undo" onclick="undoDeletedProduct('${fbKey}', '${rep.product}', '${rep.backupKey}', '${rep.backupDepot}', '${rep.backupUnit}', '${rep.qty}', '${rep.backupLimit}', '${rep.backupSkt}', '${rep.backupLot || null}')">↩ Geri Al</button> `;
                } 
                if(currentRole === 'YÖNETİCİ') { 
                    actionButtonsHtml += `<button class="btn-report-del" onclick="deleteReportRow('${fbKey}')">Kayıt Sil</button>`; 
                } 
                tbody.innerHTML += ` 
                    <tr> 
                        <td>${rep.time}</td> 
                        <td><b>${rep.user}</b></td> 
                        <td>${rep.product}</td> 
                        <td><span class="badge-order" style="${rep.type.includes('SİLİNDİ') ? 'background:#f8d7da; color:#721c24;' : ''}">${rep.type}</span></td> 
                        <td><strong>${rep.qty}</strong></td> 
                        <td>${actionButtonsHtml || '---'}</td> 
                    </tr>`;
            }); 
        } 
        reportModal.style.display = 'flex'; 
    }); 
}); 

window.closeReportModal = function() {
    reportModal.style.display = 'none';
};

window.deleteReportRow = function(fbKey) { 
    if(currentRole !== 'YÖNETİCİ') return; 
    if(confirm("Bu işlem kaydı geçmişten silinsin mi?")) { 
        db.ref('depo_rapor/' + fbKey).remove().then(() => document.getElementById('openReportBtn').click()); 
    } 
}; 

window.clearAllReports = function() { 
    if(currentRole !== 'YÖNETİCİ') return; 
    if(confirm("Tüm işlem geçmişini kalıcı olarak silmek istediğinize emin misiniz?")) { 
        db.ref('depo_rapor').remove().then(() => document.getElementById('openReportBtn').click()); 
    } 
}; 

// Siparişler Modalı Açma
document.getElementById('openOrdersBtn').addEventListener('click', () => { 
    db.ref('depo_siparisler').once('value', (snapshot) => { 
        const tbody = document.getElementById('ordersTableBody'); 
        const headerAction = document.getElementById('orderActionHeader'); 
        const clearAllBtn = document.getElementById('clearAllOrdersBtn'); 
        tbody.innerHTML = '';
        if(currentRole === 'YÖNETİCİ') { 
            headerAction.style.display = 'table-cell'; clearAllBtn.style.display = 'block'; 
        } else { 
            headerAction.style.display = 'none'; clearAllBtn.style.display = 'none';
        } 
        let modalOrders = snapshot.val() ? Object.entries(snapshot.val()) : []; 
        if(modalOrders.length === 0) { 
            tbody.innerHTML = `<tr><td colspan="${currentRole === 'YÖNETİCİ' ? 6 : 5}" style="text-align:center; color:#888;">Henüz sipariş bulunmamaktadır.</td></tr>`;
        } else { 
            modalOrders.sort((a, b) => new Date(b[1].rawTime) - new Date(a[1].rawTime));
            modalOrders.forEach(([fbKey, ord]) => { 
                let deleteCellHtml = ''; 
                if(currentRole === 'YÖNETİCİ') { 
                    deleteCellHtml = `<td><button class="btn-report-del" onclick="deleteOrderRow('${fbKey}')">Kayıt Sil</button></td>`; 
                } 
                tbody.innerHTML += `<tr><td>${ord.time || ord.date}</td><td><b>${ord.user}</b></td><td>${ord.product}</td><td><strong>${ord.qty}</strong></td><td><i style="color:#666;">${ord.notes}</i></td>${deleteCellHtml}</tr>`;
            }); 
        } 
        ordersListModal.style.display = 'flex'; 
    }); 
}); 

window.closeOrdersModal = function() {
    ordersListModal.style.display = 'none';
};

window.deleteOrderRow = function(fbKey) { 
    if(currentRole !== 'YÖNETİCİ') return; 
    if(confirm("Bu sipariş kaydı listeden silinsin mi?")) { 
        db.ref('depo_siparisler/' + fbKey).remove().then(() => document.getElementById('openOrdersBtn').click());
    } 
}; 

window.clearAllOrders = function() { 
    if(currentRole !== 'YÖNETİCİ') return; 
    if(confirm("Tüm sipariş geçmiş listesini kalıcı olarak temizlemek istediğinize emin misiniz?")) { 
        db.ref('depo_siparisler').remove().then(() => document.getElementById('openOrdersBtn').click());
    } 
}; 

document.getElementById('logoutBtn').addEventListener('click', () => { 
    localStorage.removeItem('isLoggedIn'); 
    window.location.replace('login.html'); 
});
