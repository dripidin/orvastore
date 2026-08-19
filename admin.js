// Standard Minimalist Admin Dashboard JS — yamahasac (ORVA Store)
(function () {
    // Multi-Language Translations Dictionary
    const translations = {
        ar: {
            title: "لوحة تحكم إدارة الطلبات والشحن — ORVA Store",
            sub: "نظام الربط مع شركات التوصيل الجزائرية (Yalidine, ZR, Ecotrack)",
            totalOrders: "إجمالي الطلبات",
            revenue: "الإيرادات الكلية",
            pending: "قيد الانتظار / التجميع",
            shipped: "تم الإرسال / الشحن",
            returned: "مرتجعات",
            createColis: "إنشاء طرد جديد",
            tariffsBtn: "تعرفات التوصيل",
            wilayasBtn: "الولايات النشطة",
            refresh: "تحديث البيانات",
            all: "الكل",
            searchPlaceholder: "بحث برقم الطلب، الاسم، الهاتف، أو الولاية...",
            thOrderId: "رقم الطلب / التتبع",
            thCustomer: "الزبون",
            thPhone: "الهاتف",
            thLocation: "الولاية والبلدية",
            thPrice: "المبلغ (COD)",
            thDeliveryType: "نوع التوصيل",
            thStatus: "الحالة",
            thActions: "العمليات اللوجستية",
            ship: "إرسال",
            edit: "تعديل",
            printLabel: "طباعة الملصق",
            track: "تتبع",
            remark: "ملاحظة",
            returnPkg: "إرجاع",
            deletePkg: "حذف",
            chartTrend: "مخطط الطلبات اليومية",
            chartWilayas: "توزيع الولايات الأكثر طلباً",
            chartStatuses: "نسب حالات التوصيل"
        },
        en: {
            title: "Orders & Shipping Admin Dashboard — ORVA Store",
            sub: "Algerian Logistics Companies API Integration Standard",
            totalOrders: "Total Orders",
            revenue: "Total Revenue",
            pending: "Pending / Processing",
            shipped: "Shipped / Dispatched",
            returned: "Returned",
            createColis: "Create New Package",
            tariffsBtn: "Delivery Tariffs",
            wilayasBtn: "Active Wilayas",
            refresh: "Refresh Data",
            all: "All",
            searchPlaceholder: "Search by Order ID, Name, Phone, Wilaya...",
            thOrderId: "Order / Tracking ID",
            thCustomer: "Customer",
            thPhone: "Phone",
            thLocation: "Wilaya & Commune",
            thPrice: "Amount (COD)",
            thDeliveryType: "Delivery Type",
            thStatus: "Status",
            thActions: "Logistics Actions",
            ship: "Ship",
            edit: "Edit",
            printLabel: "Print Label",
            track: "Track",
            remark: "Remark",
            returnPkg: "Return",
            deletePkg: "Delete",
            chartTrend: "Daily Orders Trend",
            chartWilayas: "Top Wilayas Breakdown",
            chartStatuses: "Delivery Status Ratios"
        },
        fr: {
            title: "Tableau de Bord Commandes & Livraison — ORVA Store",
            sub: "Intégration API Standard Logistique Algérie",
            totalOrders: "Total Commandes",
            revenue: "Chiffre d'Affaires",
            pending: "En Attente",
            shipped: "Expédiés",
            returned: "Retours",
            createColis: "Créer un Colis",
            tariffsBtn: "Tarifs Livraison",
            wilayasBtn: "Wilayas Actives",
            refresh: "Actualiser",
            all: "Tous",
            searchPlaceholder: "Rechercher par ID, Nom, Tél, Wilaya...",
            thOrderId: "ID Commande / Suivi",
            thCustomer: "Client",
            thPhone: "Téléphone",
            thLocation: "Wilaya & Commune",
            thPrice: "Montant (COD)",
            thDeliveryType: "Type Livraison",
            thStatus: "Statut",
            thActions: "Actions Logistiques",
            ship: "Expédier",
            edit: "Modifier",
            printLabel: "Imprimer Bordereau",
            track: "Suivi",
            remark: "Remarque",
            returnPkg: "Retour",
            deletePkg: "Supprimer",
            chartTrend: "Tendance des Commandes",
            chartWilayas: "Répartition par Wilaya",
            chartStatuses: "Statuts de Livraison"
        }
    };

    let currentLang = 'ar';
    let ordersList = [];
    let currentFilter = 'all';

    // Delivery Tariffs Helper (58 Wilayas)
    const deliveryTariffsMap = {
        1: { home: 1000, desk: 600 }, 2: { home: 700, desk: 400 }, 3: { home: 900, desk: 500 }, 4: { home: 800, desk: 450 }, 5: { home: 800, desk: 450 },
        6: { home: 750, desk: 400 }, 7: { home: 850, desk: 500 }, 8: { home: 1000, desk: 600 }, 9: { home: 600, desk: 350 }, 10: { home: 700, desk: 400 },
        11: { home: 1400, desk: 900 }, 12: { home: 850, desk: 500 }, 13: { home: 800, desk: 450 }, 14: { home: 800, desk: 450 }, 15: { home: 700, desk: 400 },
        16: { home: 500, desk: 300 }, 17: { home: 900, desk: 500 }, 18: { home: 750, desk: 400 }, 19: { home: 750, desk: 400 }, 20: { home: 850, desk: 500 },
        21: { home: 800, desk: 450 }, 22: { home: 800, desk: 450 }, 23: { home: 800, desk: 450 }, 24: { home: 800, desk: 450 }, 25: { home: 750, desk: 400 },
        26: { home: 700, desk: 400 }, 27: { home: 800, desk: 450 }, 28: { home: 800, desk: 450 }, 29: { home: 800, desk: 450 }, 30: { home: 950, desk: 550 },
        31: { home: 750, desk: 400 }, 32: { home: 1000, desk: 600 }, 33: { home: 1400, desk: 900 }, 34: { home: 750, desk: 400 }, 35: { home: 600, desk: 350 },
        36: { home: 850, desk: 500 }, 37: { home: 1500, desk: 1000 }, 38: { home: 850, desk: 500 }, 39: { home: 950, desk: 550 }, 40: { home: 850, desk: 500 },
        41: { home: 850, desk: 500 }, 42: { home: 600, desk: 350 }, 43: { home: 750, desk: 400 }, 44: { home: 700, desk: 400 }, 45: { home: 1000, desk: 600 },
        46: { home: 800, desk: 450 }, 47: { home: 950, desk: 550 }, 48: { home: 800, desk: 450 }, 49: { home: 1100, desk: 700 }, 50: { home: 1600, desk: 1100 },
        51: { home: 900, desk: 500 }, 52: { home: 1100, desk: 700 }, 53: { home: 1400, desk: 900 }, 54: { home: 1600, desk: 1100 }, 55: { home: 950, desk: 550 },
        56: { home: 1500, desk: 1000 }, 57: { home: 950, desk: 550 }, 58: { home: 1100, desk: 700 }
    };

    function calcDeliveryFee(wilayaStr, typeStr) {
        let wilayaNum = 16;
        const match = String(wilayaStr || '').match(/^(\d{1,2})/);
        if (match) wilayaNum = parseInt(match[1]);
        const t = deliveryTariffsMap[wilayaNum] || { home: 600, desk: 400 };
        const isDesk = String(typeStr || '').toLowerCase().includes('stop') || String(typeStr || '').toLowerCase().includes('desk');
        return isDesk ? t.desk : t.home;
    }

    const initialSampleOrders = [];

    // Load stored orders or initialize
    function loadOrders() {
        const stored = localStorage.getItem('orva_admin_orders');
        if (stored) {
            try {
                ordersList = JSON.parse(stored);
            } catch (e) {
                ordersList = [];
            }
        } else {
            ordersList = [];
        }
        fetchServerOrders();
        handleTelegramAutoFill();
    }

    // Handle Telegram notification link auto-fill and auto-submit
    function handleTelegramAutoFill() {
        const urlParams = new URLSearchParams(window.location.search);
        const autoFill = urlParams.get('autofill');
        
        if (autoFill === 'true') {
            const name = urlParams.get('name');
            const phone = urlParams.get('phone');
            const wilaya = urlParams.get('wilaya');
            const price = urlParams.get('price');
            const orderId = urlParams.get('orderId');
            const autoSubmit = urlParams.get('autosubmit') === 'true';

            if (name || phone || wilaya) {
                document.getElementById('formClientName').value = name || '';
                document.getElementById('formClientPhone').value = phone || '';
                document.getElementById('formWilaya').value = wilaya || '';
                document.getElementById('formPrice').value = price || '4200';
                
                const formIdInp = document.getElementById('editingOrderId');
                formIdInp.setAttribute('data-is-telegram', 'true');
                formIdInp.setAttribute('data-target-order-id', orderId || '');
                
                document.getElementById('packageModalTitle').textContent = 'إضافة طلب من إشعار Telegram';
                document.getElementById('packageModal').classList.add('active');

                // Auto-submit if requested
                if (autoSubmit && name && phone && wilaya) {
                    setTimeout(() => {
                        document.getElementById('modalOrderForm').dispatchEvent(new Event('submit'));
                    }, 500);
                }
            }
        }
    }

    let syncIntervalId = null;
    async function fetchServerOrders() {
        try {
            const res = await fetch('/api/delivery?action=get_all_orders');
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                const blacklist = JSON.parse(localStorage.getItem('blacklisted_orders') || '["ECEOSK26081843163","ECEOSK26081842580","ECEOSK26081842574"]');
                ordersList = json.data.filter(o => !blacklist.includes(o.orderId) && !blacklist.includes(o.tracking_code));
                saveOrders();
                renderOrdersTable();
                renderCharts();
            }
        } catch (e) {
            console.warn('Sync server orders warning:', e);
        }

        // Live Real-Time Auto Sync (Every 15 Seconds)
        if (!syncIntervalId) {
            syncIntervalId = setInterval(fetchServerOrders, 15000);
        }
    }

    function saveOrders() {
        localStorage.setItem('orva_admin_orders', JSON.stringify(ordersList));
    }

    // UI Translation Applier
    function applyTranslations(lang) {
        currentLang = lang;
        document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;

        const t = translations[lang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (t[key]) el.placeholder = t[key];
        });

        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.getAttribute('data-lang') === lang) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        renderOrdersTable();
    }

    // Metrics Calculation
    function updateMetrics() {
        const total = ordersList.length;
        const totalRev = ordersList.reduce((sum, o) => sum + (o.priceNum || 4200), 0);
        const pendingCount = ordersList.filter(o => o.status === 'pending' || o.status === 'قيد الانتظار').length;
        const shippedCount = ordersList.filter(o => o.status === 'shipped' || o.status.includes('Redex') || o.status.includes('طريق') || o.status.includes('expédier') || o.status.includes('الانتظار')).length;
        const returnedCount = ordersList.filter(o => o.status === 'returned' || o.status.includes('مرتجع') || o.status.includes('Retour')).length;

        const elTotal = document.getElementById('metricTotalOrders');
        const elRev = document.getElementById('metricRevenue');
        const elPending = document.getElementById('metricPending');
        const elShipped = document.getElementById('metricShipped');
        const elReturned = document.getElementById('metricReturned');

        if (elTotal) elTotal.textContent = total;
        if (elRev) elRev.textContent = totalRev.toLocaleString('fr-DZ') + ' د.ج';
        if (elPending) elPending.textContent = pendingCount;
        if (elShipped) elShipped.textContent = shippedCount;
        if (elReturned) elReturned.textContent = returnedCount;
    }

    // ─── Real Data Charts (ORVA Store) ──────────────────────────────────────────────
    function renderCharts() {
        renderTrendChart();
        renderWilayaChart();
    }

    // ── Daily Orders Trend (last 7 days from real ordersList) ─────────────────
    function renderTrendChart() {
        const canvas = document.getElementById('chartTrendCanvas');
        if (!canvas) return;

        const PAD = { top: 24, right: 24, bottom: 44, left: 52 };
        const w = canvas.width  = canvas.parentElement.clientWidth  || 500;
        const h = canvas.height = canvas.parentElement.clientHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        // Build last-7-days date keys
        const dayKeys = [];
        const dayLabels = [];
        const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            dayKeys.push(d.toISOString().slice(0, 10));
            dayLabels.push(dayNames[d.getDay()]);
        }

        // Count orders per day from real data
        const counts = dayKeys.map(key =>
            ordersList.filter(o => (o.date || o.createdAt || '').slice(0, 10) === key).length
        );

        const maxVal = Math.max(...counts, 1);
        const chartW = w - PAD.left - PAD.right;
        const chartH = h - PAD.top  - PAD.bottom;
        const stepX  = chartW / (counts.length - 1);

        const pts = counts.map((v, i) => ({
            x: PAD.left + i * stepX,
            y: PAD.top  + chartH - (v / maxVal) * chartH
        }));

        // Grid lines
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(148,163,184,0.15)';
        ctx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
            const gy = PAD.top + (g / 4) * chartH;
            ctx.beginPath(); ctx.moveTo(PAD.left, gy); ctx.lineTo(w - PAD.right, gy); ctx.stroke();
            ctx.fillStyle = '#64748b'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal * (1 - g / 4)), PAD.left - 6, gy + 4);
        }
        ctx.setLineDash([]);

        // Area fill gradient (ORVA cyan)
        const grad = ctx.createLinearGradient(0, PAD.top, 0, h - PAD.bottom);
        grad.addColorStop(0,   'rgba(0,210,255,0.3)');
        grad.addColorStop(1,   'rgba(0,210,255,0.02)');
        ctx.beginPath();
        ctx.moveTo(pts[0].x, h - PAD.bottom);
        pts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length-1].x, h - PAD.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Dots + value labels + x-axis labels
        pts.forEach((p, i) => {
            // dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981'; ctx.fill();
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5; ctx.stroke();

            // value on top of dot
            if (counts[i] > 0) {
                ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 11px Inter,sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(counts[i], p.x, p.y - 10);
            }

            // x-axis label
            ctx.fillStyle = '#94a3b8'; ctx.font = '10px Cairo,sans-serif';
            ctx.fillText(dayLabels[i], p.x, h - PAD.bottom + 18);
        });
    }

    // ── Top-5 Wilayas Bar Chart (real counts from ordersList) ─────────────────
    function renderWilayaChart() {
        const canvas = document.getElementById('chartWilayaCanvas');
        if (!canvas) return;

        const PAD = { top: 20, right: 20, bottom: 48, left: 16 };
        const w = canvas.width  = canvas.parentElement.clientWidth  || 500;
        const h = canvas.height = canvas.parentElement.clientHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        // Aggregate wilaya counts from real data
        const wilayaCounts = {};
        ordersList.forEach(o => {
            const raw = (o.wilaya || o.commune || '').trim();
            if (!raw) return;
            const key = raw.split('—')[0].trim().split('-').slice(0, 2).join('-').trim();
            wilayaCounts[key] = (wilayaCounts[key] || 0) + 1;
        });

        const COLORS = ['#00d2ff','#10b981','#f59e0b','#8b5cf6','#f43f5e'];
        const top5 = Object.entries(wilayaCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([label, count], i) => ({ label, count, color: COLORS[i] }));

        if (top5.length === 0) {
            ctx.fillStyle = '#64748b'; ctx.font = '14px Cairo,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('لا توجد بيانات بعد — سيظهر الرسم بعد وصول أول طلب', w/2, h/2);
            return;
        }

        const chartW = w - PAD.left - PAD.right;
        const chartH = h - PAD.top  - PAD.bottom;
        const maxCount = Math.max(...top5.map(x => x.count), 1);
        const barW = Math.floor((chartW / top5.length) * 0.65);
        const gap  = Math.floor((chartW / top5.length) * 0.35);

        top5.forEach((item, i) => {
            const barH = Math.round((item.count / maxCount) * chartH);
            const x = PAD.left + i * (barW + gap) + gap / 2;
            const y = PAD.top  + chartH - barH;

            // Bar gradient
            const grad = ctx.createLinearGradient(0, y, 0, y + barH);
            grad.addColorStop(0, item.color);
            grad.addColorStop(1, item.color + '55');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]) : ctx.rect(x, y, barW, barH);
            ctx.fill();

            // Count label on top
            ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 12px Inter,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.count, x + barW / 2, y - 6);

            // Wilaya label below
            ctx.fillStyle = '#94a3b8'; ctx.font = '10px Cairo,sans-serif';
            const shortLabel = item.label.length > 10 ? item.label.slice(0, 10) + '…' : item.label;
            ctx.fillText(shortLabel, x + barW / 2, h - PAD.bottom + 16);
        });
    }

    // Render Orders Table
    function renderOrdersTable() {
        const tbody = document.getElementById('ordersTbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const searchQuery = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

        const filtered = ordersList.filter(o => {
            if (currentFilter !== 'all' && o.status !== currentFilter) return false;
            if (searchQuery) {
                const matchId = (o.orderId || '').toLowerCase().includes(searchQuery);
                const matchName = (o.fullName || '').toLowerCase().includes(searchQuery);
                const matchPhone = (o.phone || '').toLowerCase().includes(searchQuery);
                const matchWilaya = (o.wilaya || '').toLowerCase().includes(searchQuery);
                return matchId || matchName || matchPhone || matchWilaya;
            }
            return true;
        });

        const urlParams = new URLSearchParams(window.location.search);
        const targetOrderId = urlParams.get('orderId');

        filtered.forEach(o => {
            const tr = document.createElement('tr');
            if (targetOrderId && o.orderId === targetOrderId) {
                tr.classList.add('highlighted-row');
            }

            let badgeHtml = `<span class="status-badge badge-shipped">🚚 ${o.status || 'مؤكد في Redex'}</span>`;
            if (o.status === 'pending' || o.status === 'قيد الانتظار') {
                badgeHtml = `<span class="status-badge badge-pending">⏳ قيد الانتظار</span>`;
            } else if (o.status === 'delivered' || (o.status && (o.status.includes('Livré') || o.status.includes('مستلم') || o.status.includes('تم التسليم')))) {
                badgeHtml = `<span class="status-badge badge-delivered">✅ تم التسليم (Livré)</span>`;
            } else if (o.status === 'returned' || (o.status && (o.status.includes('Retour') || o.status.includes('مرتجع')))) {
                badgeHtml = `<span class="status-badge badge-returned">⚠️ مرتجع (Retour)</span>`;
            } else if (o.status === 'cancelled' || (o.status && (o.status.includes('ملغى') || o.status.includes('Annulé')))) {
                badgeHtml = `<span class="status-badge badge-cancelled">❌ ملغى</span>`;
            }

            const trackingCode = o.tracking_code || o.orderId;
            const isInCompany = o.in_redex || (o.tracking_code && o.tracking_code.startsWith('ECE')) || (o.status && (o.status.includes('Redex') || o.status.includes('expédier') || o.status.includes('wilaya')));
            
            const circleBadge = isInCompany
                ? `<span title="الطلب متواجد في لوحة تحكم شركة التوصيل Redex" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#10b981; font-weight:700;"><span style="width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; display:inline-block;"></span> 🟢 في Redex</span>`
                : `<span title="الطلب لم يُرسل إلى شركة التوصيل بعد" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#f59e0b; font-weight:700;"><span style="width:10px; height:10px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b; display:inline-block;"></span> 🟡 لم يُرسل بعد</span>`;

            const trackingDisplay = `<span style="font-family:monospace; background:rgba(0,210,255,0.1); color:#00D2FF; padding:3px 8px; border-radius:6px; font-weight:700;">⚡ ${trackingCode}</span>`;

            tr.innerHTML = `
                <td>${trackingDisplay}<br><small style="color:#64748b;">${o.date || '2026-08-18'}</small></td>
                <td><strong>${o.fullName}</strong></td>
                <td><a href="tel:${o.phone}" style="color:#00D2FF; text-decoration:none;">${o.phone}</a></td>
                <td>${o.wilaya}</td>
                <td><strong style="color:#10b981;">${o.grandTotal}</strong></td>
                <td>${circleBadge}</td>
                <td>${badgeHtml}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-xs btn-xs-ship" onclick="adminAPI.shipColis('${o.orderId}')"><i class="fa-solid fa-truck-fast"></i> إرسال</button>
                        <button class="btn-xs btn-xs-remark" onclick="adminAPI.openRemarkModal('${o.orderId}')"><i class="fa-solid fa-comment-dots"></i> تعليق</button>
                        <button class="btn-xs btn-xs-delete" onclick="adminAPI.deleteColis('${o.orderId}')"><i class="fa-solid fa-trash"></i> حذف</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        updateMetrics();
    }

    // Algerian Logistics API Delivery Operations
    window.adminAPI = {
        openCreateModal: function () {
            document.getElementById('modalOrderForm').reset();
            document.getElementById('editingOrderId').value = '';
            document.getElementById('packageModalTitle').textContent = 'إنشاء طرد توصيل جديد (Création Colis)';
            document.getElementById('packageModal').classList.add('active');
        },

        openEditModal: function (orderId) {
            const o = ordersList.find(item => item.orderId === orderId);
            if (!o) return;
            document.getElementById('editingOrderId').value = o.orderId;
            document.getElementById('formClientName').value = o.fullName;
            document.getElementById('formClientPhone').value = o.phone;
            document.getElementById('formWilaya').value = o.wilaya;
            document.getElementById('formPrice').value = o.priceNum || parseInt(o.grandTotal) || 4700;
            document.getElementById('formDeliveryType').value = o.deliveryType.includes('Stop') ? 'stopdesk' : 'domicile';

            document.getElementById('packageModalTitle').textContent = 'تعديل بيانات الطرد (Modification Colis) - ' + o.orderId;
            document.getElementById('packageModal').classList.add('active');
        },

        saveColisForm: async function (e) {
            if (e) e.preventDefault();
            const formIdInp = document.getElementById('editingOrderId');
            const editId = formIdInp.value;
            const targetOrderId = formIdInp.getAttribute('data-target-order-id') || editId;
            const isTelegramAutoFill = formIdInp.getAttribute('data-is-telegram') === 'true';

            const name = document.getElementById('formClientName').value.trim();
            const phone = document.getElementById('formClientPhone').value.trim();
            const wilaya = document.getElementById('formWilaya').value.trim();
            const price = parseInt(document.getElementById('formPrice').value, 10) || 4700;
            const deliveryType = document.getElementById('formDeliveryType').value === 'stopdesk' ? 'توصيل للمكتب (Stop Desk)' : 'توصيل للمنزل';

            if (!name || !phone || !wilaya) {
                alert('الرجاء إدخال كافة المعلومات المطلوبة');
                return;
            }

            if (editId && !isTelegramAutoFill) {
                // Update existing order locally
                const index = ordersList.findIndex(o => o.orderId === editId);
                if (index !== -1) {
                    ordersList[index].fullName = name;
                    ordersList[index].phone = phone;
                    ordersList[index].wilaya = wilaya;
                    ordersList[index].grandTotal = price + ' د.ج';
                    ordersList[index].priceNum = price;
                    ordersList[index].deliveryType = deliveryType;
                }
                await fetch('/api/delivery?action=update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tracking_code: editId, fullName: name, phone: phone, wilaya: wilaya, price: price })
                });
                alert('تم تحديث بيانات الطرد بنجاح!');
            } else {
                // Create new order & register directly in Redex Ecotrack DZ!
                const newId = targetOrderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000));
                const newColis = {
                    orderId: newId,
                    fullName: name,
                    phone: phone,
                    wilaya: wilaya,
                    deliveryType: deliveryType,
                    grandTotal: price + ' د.ج',
                    priceNum: price,
                    status: 'shipped',
                    date: new Date().toISOString().split('T')[0],
                    remarks: []
                };

                const res = await fetch('/api/delivery?action=create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newColis)
                });
                const json = await res.json();

                if (json.success && json.data && json.data.tracking_code) {
                    newColis.orderId = json.data.tracking_code;
                    alert(`✅ تم إرسال وتسجيل الطرد بنجاح في نظام شركة التوصيل Redex Ecotrack DZ!\nرقم التتبع الرسمي: ${json.data.tracking_code}`);
                } else {
                    alert('تم تسجيل وتأكيد الطرد بنجاح!');
                }

                // Reset telegram attributes
                formIdInp.removeAttribute('data-is-telegram');
                formIdInp.removeAttribute('data-target-order-id');

                ordersList.unshift(newColis);
            }

            saveOrders();
            renderOrdersTable();
            this.closeModal('packageModal');
        },

        shipColis: async function (orderId) {
            if (!confirm(`هل أنت تأكد من إرسال وتأكيد طرد التوصيل ${orderId} لشركة التوصيل Redex Ecotrack DZ؟`)) return;
            const o = ordersList.find(item => item.orderId === orderId);
            if (o) {
                o.status = 'shipped';
                const res = await fetch('/api/delivery?action=create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: o.orderId,
                        fullName: o.fullName,
                        phone: o.phone,
                        wilaya: o.wilaya,
                        deliveryType: o.deliveryType,
                        price: o.priceNum || parseInt(o.grandTotal) || 4700
                    })
                });
                const json = await res.json();
                if (json.success && json.data && json.data.tracking_code) {
                    o.orderId = json.data.tracking_code;
                }
                saveOrders();
                renderOrdersTable();
                alert(`✅ تم شحن وإرسال الطرد ${orderId} بنجاح إلى نظام Redex Ecotrack DZ!`);
            }
        },

        deleteColis: async function (orderId) {
            if (!confirm(`تحذير: هل تريد إلغاء وحذف الطرد ${orderId} نهائياً؟`)) return;
            const blacklist = JSON.parse(localStorage.getItem('blacklisted_orders') || '["ECEOSK26081843163","ECEOSK26081842580","ECEOSK26081842574"]');
            if (!blacklist.includes(orderId)) blacklist.push(orderId);
            localStorage.setItem('blacklisted_orders', JSON.stringify(blacklist));

            ordersList = ordersList.filter(item => item.orderId !== orderId && item.tracking_code !== orderId);
            saveOrders();
            renderOrdersTable();

            await fetch(`/api/delivery?action=delete&id=${orderId}`, { method: 'DELETE' });
            alert(`تم حذف الطرد ${orderId} من النظام نهائياً.`);
        },

        trackColis: async function (orderId) {
            const res = await fetch(`/api/delivery?action=tracking&id=${orderId}`);
            const data = await res.json();
            const history = data.history || [];

            let html = `<ul class="timeline">`;
            history.forEach(item => {
                html += `
                    <li class="timeline-item">
                        <div class="timeline-text">${item.status} - ${item.description}</div>
                        <div class="timeline-time">${new Date(item.timestamp).toLocaleString('ar-DZ')}</div>
                    </li>
                `;
            });
            html += `</ul>`;

            document.getElementById('trackingModalContent').innerHTML = html;
            document.getElementById('trackingModalTitle').textContent = `تتبع وتسلسل عمليات الطرد (${orderId})`;
            document.getElementById('trackingModal').classList.add('active');
        },

        openRemarkModal: function (orderId) {
            document.getElementById('remarkOrderId').value = orderId;
            document.getElementById('remarkText').value = '';
            document.getElementById('remarkModal').classList.add('active');
        },

        saveRemark: async function () {
            const orderId = document.getElementById('remarkOrderId').value;
            const text = document.getElementById('remarkText').value.trim();
            if (!text) return;

            const o = ordersList.find(item => item.orderId === orderId);
            if (o) {
                if (!o.remarks) o.remarks = [];
                o.remarks.push(text);
                saveOrders();
            }

            await fetch('/api/delivery?action=remark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_code: orderId, remark: text })
            });

            alert(`تم إضافة الملاحظة بنجاح إلى ملف الطرد ${orderId}`);
            this.closeModal('remarkModal');
        },

        requestReturn: async function (orderId) {
            if (!confirm(`هل ترغب في طلب استرجاع / إرجاع الطرد ${orderId} إلى المستودع؟`)) return;
            const o = ordersList.find(item => item.orderId === orderId);
            if (o) {
                o.status = 'returned';
                saveOrders();
                renderOrdersTable();
            }
            await fetch('/api/delivery?action=return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_code: orderId })
            });
            alert(`تم تقديم طلب إرجاع الطرد ${orderId} بنجاح إلى شركة التوصيل.`);
        },

        printBordereau: function (orderId) {
            const o = ordersList.find(item => item.orderId === orderId) || { orderId: orderId, fullName: 'محمد الزبون', phone: '0770123456', wilaya: '16 - الجزائر', grandTotal: '4700 د.ج', deliveryType: 'توصيل للمنزل' };

            const container = document.getElementById('bordereauPrintArea');
            container.innerHTML = `
                <div class="bordereau-container">
                    <div class="bordereau-header">
                        <div>
                            <h2>ORVA STORE</h2>
                            <small>Bordereau d'Expédition / ملصق الطرد</small>
                        </div>
                        <div style="text-align: left;">
                            <strong>N° Colis: ${o.orderId}</strong><br>
                            <span>Date: ${new Date().toLocaleDateString('fr-DZ')}</span>
                        </div>
                    </div>
                    
                    <div class="bordereau-grid">
                        <div class="bordereau-box">
                            <h5>المـرسـل (Expéditeur)</h5>
                            <strong>ORVA STORE Algeria 🎒</strong><br>
                            الهاتف: 0798282495<br>
                            المتجر الإلكتروني المعتمد
                        </div>
                        <div class="bordereau-box">
                            <h5>المرسل إليه (Destinataire)</h5>
                            <strong>${o.fullName}</strong><br>
                            الهاتف: ${o.phone}<br>
                            العنوان: ${o.wilaya}
                        </div>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <strong>طريقة التوصيل:</strong> ${o.deliveryType || 'توصيل للمنزل'}<br>
                        <strong>المحتوى:</strong> كرطابل يماها
                    </div>

                    <div class="bordereau-price-tag">
                        المبلغ المطلوب عند الاستلام (COD): ${o.grandTotal}
                    </div>

                    <div class="barcode-mock"></div>
                    <div style="text-align: center; font-size: 11px; margin-top: 5px;">*${o.orderId}*</div>
                </div>
            `;

            document.getElementById('bordereauModal').classList.add('active');
        },

        triggerNativePrint: function () {
            window.print();
        },

        openTariffsModal: async function () {
            const res = await fetch('/api/delivery?action=tariffs');
            const data = await res.json();
            const list = data.data || [];

            let html = `<table class="admin-table">
                <thead>
                    <tr>
                        <th>رقم الولاية</th>
                        <th>اسم الولاية</th>
                        <th>سعر توصيل للمنزل (Domicile)</th>
                        <th>سعر التوصيل للمكتب (StopDesk)</th>
                    </tr>
                </thead>
                <tbody>`;

            list.forEach(t => {
                html += `
                    <tr>
                        <td><strong>${t.wilaya_id}</strong></td>
                        <td>${t.name}</td>
                        <td><strong style="color:#10b981;">${t.home_price} د.ج</strong></td>
                        <td><strong style="color:#3b82f6;">${t.desk_price} د.ج</strong></td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;

            document.getElementById('infoModalContent').innerHTML = html;
            document.getElementById('infoModalTitle').textContent = 'جدول تعرفات أسعار التوصيل لـ 58 ولاية (Tarifs de livraison)';
            document.getElementById('infoModal').classList.add('active');
        },

        openWilayasModal: async function () {
            const res = await fetch('/api/delivery?action=wilayas');
            const data = await res.json();
            const list = data.data || [];

            let html = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px;">`;
            list.forEach(w => {
                html += `
                    <div style="background:var(--bg-input); padding: 10px; border-radius: 6px; text-align: center;">
                        <span class="status-badge badge-delivered" style="margin-bottom:4px;">نشطة ⚡</span><br>
                        <strong>${w.name}</strong>
                    </div>
                `;
            });
            html += `</div>`;

            document.getElementById('infoModalContent').innerHTML = html;
            document.getElementById('infoModalTitle').textContent = 'قائمة الولايات النشطة المشمولة بالتوصيل (Wilayas Actives)';
            document.getElementById('infoModal').classList.add('active');
        },

        closeModal: function (modalId) {
            const m = document.getElementById(modalId);
            if (m) m.classList.remove('active');
        }
    };

    // Event Listeners Setup
    document.addEventListener('DOMContentLoaded', function () {
        loadOrders();

        // Language Buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const lang = this.getAttribute('data-lang');
                applyTranslations(lang);
            });
        });

        // Sidebar Toggle Handler
        const sidebar = document.getElementById('sidebar');
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

        if (sidebarToggleBtn && sidebar) {
            sidebarToggleBtn.addEventListener('click', function () {
                sidebar.classList.add('active');
            });
        }
        if (sidebarCloseBtn && sidebar) {
            sidebarCloseBtn.addEventListener('click', function () {
                sidebar.classList.remove('active');
            });
        }

        // Theme Toggle Handler (Dark/Light)
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', function () {
                document.body.classList.toggle('light-theme');
                document.body.classList.toggle('dark-theme');
                const isLight = document.body.classList.contains('light-theme');
                themeToggleBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun text-amber"></i>' : '<i class="fa-solid fa-moon"></i>';
            });
        }

        // Filter Pills Handler
        document.querySelectorAll('.pill-btn, .tab-item').forEach(pill => {
            pill.addEventListener('click', function () {
                document.querySelectorAll('.pill-btn, .tab-item').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.getAttribute('data-status');
                renderOrdersTable();
            });
        });

        // Search Input
        const searchInp = document.getElementById('searchInput');
        if (searchInp) {
            searchInp.addEventListener('input', renderOrdersTable);
        }

        // Refresh Button
        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                loadOrders();
                renderOrdersTable();
                renderCharts();
            });
        }

        // Dynamic Modal Price Auto-Calculator
        const formWilayaInp = document.getElementById('formWilaya');
        const formTypeInp = document.getElementById('formDeliveryType');
        const formPriceInp = document.getElementById('formPrice');

        function updateDynamicPrice() {
            if (!formPriceInp) return;
            const editId = document.getElementById('editingOrderId')?.value;
            if (editId) return; // do not override manual edits
            const wilayaVal = formWilayaInp ? formWilayaInp.value : '16 - الجزائر';
            const typeVal = formTypeInp ? formTypeInp.value : 'domicile';
            const fee = calcDeliveryFee(wilayaVal, typeVal);
            formPriceInp.value = 4200 + fee;
        }

        if (formWilayaInp) formWilayaInp.addEventListener('change', updateDynamicPrice);
        if (formTypeInp) formTypeInp.addEventListener('change', updateDynamicPrice);

        // Package Form submit listener
        const form = document.getElementById('modalOrderForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                adminAPI.saveColisForm(e);
            });
        }

        applyTranslations('ar');
        renderCharts();

        // Auto-fill New Package Form Modal if arrived from Telegram Bot Link
        const urlParams = new URLSearchParams(window.location.search);
        const targetId = urlParams.get('orderId');
        if (targetId) {
            const nameParam = urlParams.get('name');
            const phoneParam = urlParams.get('phone');
            const wilayaParam = urlParams.get('wilaya');
            const totalParam = urlParams.get('total');
            const typeParam = urlParams.get('type');

            if (nameParam || phoneParam || wilayaParam) {
                const formIdInput = document.getElementById('editingOrderId');
                const formNameInp = document.getElementById('formClientName');
                const formPhoneInp = document.getElementById('formClientPhone');
                const modalTitle = document.getElementById('packageModalTitle');
                const packageModal = document.getElementById('packageModal');

                if (formIdInput) {
                    formIdInput.value = '';
                    formIdInput.setAttribute('data-target-order-id', targetId);
                    formIdInput.setAttribute('data-is-telegram', 'true');
                }
                if (formNameInp && nameParam) formNameInp.value = nameParam;
                if (formPhoneInp && phoneParam) formPhoneInp.value = phoneParam;
                if (formWilayaInp && wilayaParam) formWilayaInp.value = wilayaParam;
                if (formTypeInp && typeParam) {
                    const isDesk = typeParam.toLowerCase().indexOf('stop') !== -1 || typeParam.toLowerCase().indexOf('desk') !== -1;
                    formTypeInp.value = isDesk ? 'stopdesk' : 'domicile';
                }

                // Automatic Net Total Calculation (Product 4200 + Delivery Fee)
                if (formPriceInp) {
                    const baseProductPrice = 4200;
                    const fee = calcDeliveryFee(wilayaParam, typeParam);
                    let rawTotalNum = parseInt(totalParam) || 0;
                    if (rawTotalNum > baseProductPrice) {
                        formPriceInp.value = rawTotalNum;
                    } else {
                        formPriceInp.value = baseProductPrice + fee;
                    }
                }

                if (modalTitle) {
                    modalTitle.innerHTML = `⚡ تم ملء نموذج الطرد تلقائياً من البوت (<code style="color:var(--accent-primary);">${targetId}</code>)`;
                }

                if (packageModal) {
                    setTimeout(() => {
                        packageModal.classList.add('active');
                    }, 300);
                }
            }
        }
    });
})();
