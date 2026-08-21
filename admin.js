/**
 * =============================================================================
 * ORVA STORE — Enterprise Logistics & Management Controller (Light Edition)
 * Couriers: Ecotrack (Redex/DHD/Conexlog/MSM Go), Yalidine, ZR Express, Noest, Maystro
 * =============================================================================
 */

(function () {
    'use strict';

    // ── 1. Strict 100% Bilingual Dictionary ──────────────────────────────────
    const I18N = {
        fr: {
            brandSub: "Tableau de bord",
            searchPlaceholder: "Rechercher par commande, nom, téléphone, wilaya...",
            statusConnected: "Connecté",
            statusSync: "Synchronisé",
            catMain: "MENU PRINCIPAL",
            navDashboard: "Aperçu & Statistiques",
            navOrders: "Gestion des Commandes",
            navAnalytics: "Visiteurs & Meta Pixel",
            catLogistics: "LOGISTIQUE & TRANSPORTEURS",
            navCreate: "Créer un Colis",
            navTariffs: "Tarifs 58 Wilayas",
            navSettings: "Configuration Transporteurs",
            bannerTag: "Système de Gestion Intégré • Algérie 58 Wilayas",
            bannerTitle: "Tableau de bord logistique & Suivi des Ventes",
            bannerDesc: "Passerelle multicanal connectée aux transporteurs locaux, Google Sheets et Facebook Meta CAPI.",
            btnNewColis: "Nouveau Colis",
            btnExport: "Exporter Excel",
            kpiTotal: "Total Commandes",
            kpiRevenue: "Chiffre d'Affaires COD",
            kpiPending: "En Attente / Préparation",
            kpiShipped: "En Livraison (Transporteurs)",
            kpiReturned: "Retours (Retournés)",
            kpiLiveSync: "Synchronisé",
            kpiToShip: "À expédier",
            kpiReturnRate: "Colis non aboutis",
            chartTrendTitle: "Tendance Quotidienne des Commandes (7 Derniers Jours)",
            chartWilayasTitle: "Top Wilayas les Plus Demandées",
            liveDataBadge: "Données en direct",
            analyticsTitle: "Statistiques des Visiteurs, Appareils & Meta CAPI",
            lblReferrers: "Sources de Trafic (Référents)",
            lblDevices: "Appareils des Visiteurs",
            lblBrowsers: "Navigateurs & Systèmes",
            tableTitle: "Journal des Commandes & Expéditions",
            tabAll: "Toutes",
            tabPending: "⏳ En Attente",
            tabShipped: "🚚 Expédiées",
            tabDelivered: "✅ Livrées",
            tabReturned: "⚠️ Retours",
            tableFilterPlaceholder: "Filtrer par nom, téléphone, commune, code...",
            allWilayasOption: "Toutes les Wilayas (58 Wilayas)",
            btnTariffs: "Grille Tarifaire",
            thOrder: "Réf / Tracking",
            thCustomer: "Client",
            thPhone: "Téléphone",
            thDestination: "Wilaya & Commune",
            thAmount: "Montant COD",
            thCarrierStatus: "Statut Transporteur",
            thOrderStatus: "État Commande",
            thActions: "Actions Logistiques",
            loadingOrders: "Chargement des commandes...",
            modalCreateTitle: "Créer et expédier un colis vers le transporteur",
            lblAutoFill: "Sélectionner une commande boutique pour pré-remplir :",
            optSelectOrder: "-- Sélectionner une commande --",
            lblFullName: "Nom complet du client *",
            lblPhone: "Numéro de téléphone *",
            lblWilaya: "Wilaya (58 Wilayas) *",
            lblCommune: "Commune *",
            lblDeliveryType: "Type de livraison",
            optHome: "🏠 Livraison à domicile (Domicile)",
            optDesk: "🏢 Récupération au bureau (Stop Desk)",
            lblPrice: "Montant à encaisser (COD DZD) *",
            lblAddress: "Adresse détaillée / Quartier",
            lblTariffApplied: "Frais de livraison appliqués :",
            btnCancel: "Annuler",
            btnSendToCourier: "Expédier au transporteur ⚡",
            modalTrackTitle: "Suivi en direct du colis (Tracking)",
            lblTrackingCode: "Code de suivi :",
            lblCurrentStatus: "État actuel :",
            modalLabelTitle: "Étiquette Officielle du Transporteur",
            btnOpenOfficialPdf: "Ouvrir / Télécharger le Bordereau PDF",
            btnClose: "Fermer",
            modalSettingsTitle: "Configuration des Transporteurs & Passerelles Algérie",
            lblActiveCarrier: "Sélectionner le transporteur actif pour les expéditions :",
            lblStorageMode: "Moteur de Données & Synchronisation :",
            btnTestCarrier: "Tester la connexion API avec le transporteur ⚡",
            modalTariffsTitle: "Grille Tarifaire des 58 Wilayas d'Algérie",
            thWilaya: "Wilaya",
            thHomeRate: "Livraison à Domicile",
            thDeskRate: "Récupération au Bureau (Stop Desk)",
            thCoverage: "Couverture",
            statusPendingBadge: "En Attente",
            statusShippedBadge: "Chez Transporteur",
            statusDeliveredBadge: "Livré ✅",
            statusReturnedBadge: "Retourné ⚠️",
            alertLabelNotShipped: "L'étiquette officielle n'est disponible qu'après l'envoi du colis au transporteur. Cliquez d'abord sur 'Expédier'."
        },
        ar: {
            brandSub: "لوحة التحكم",
            searchPlaceholder: "ابحث برقم الطلب، الاسم، الهاتف، الولاية...",
            statusConnected: "متصل",
            statusSync: "متزامن",
            catMain: "القائمة الرئيسية",
            navDashboard: "نظرة عامة والتحليلات",
            navOrders: "إدارة الطلبيات والشحن",
            navAnalytics: "الزوار و بكسل ميتا",
            catLogistics: "اللوجستيك والتوصيل",
            navCreate: "إنشاء طرد جديد",
            navTariffs: "تعرفات 58 ولاية",
            navSettings: "إعدادات شركات التوصيل",
            bannerTag: "نظام إدارة متكامل • 58 ولاية جزائرية",
            bannerTitle: "لوحة التحكم اللوجستية وتتبع المبيعات",
            bannerDesc: "منصة موحدة متصلة بشركات التوصيل الجزائرية، جداول جوجل وبكسل ميتا.",
            btnNewColis: "طرد جديد",
            btnExport: "تصدير Excel",
            kpiTotal: "إجمالي الطلبات",
            kpiRevenue: "مداخيل الدفع عند الاستلام",
            kpiPending: "قيد الانتظار والتحضير",
            kpiShipped: "في شبكة التوصيل",
            kpiReturned: "المرتجعات (Retour)",
            kpiLiveSync: "متزامن حياً",
            kpiToShip: "جاهزة للإرسال",
            kpiReturnRate: "طرود غير مستلمة",
            chartTrendTitle: "حركة الطلبيات اليومية (آخر 7 أيام)",
            chartWilayasTitle: "توزيع الولايات الأكثر طلباً",
            liveDataBadge: "بيانات مباشرة",
            analyticsTitle: "إحصائيات الزوار والأجهزة و Facebook CAPI",
            lblReferrers: "مصادر الزيارات (Référents)",
            lblDevices: "أجهزة الزوار",
            lblBrowsers: "المتصفحات والأنظمة",
            tableTitle: "سجل الطلبيات والشحنات",
            tabAll: "الكل",
            tabPending: "⏳ قيد الانتظار",
            tabShipped: "🚚 تم الشحن",
            tabDelivered: "✅ تم التسليم",
            tabReturned: "⚠️ مرتجعات",
            tableFilterPlaceholder: "تصفية بالاسم، الهاتف، البلدية، الكود...",
            allWilayasOption: "كل الولايات (58 ولاية)",
            btnTariffs: "قائمة الأسعار",
            thOrder: "المرجع / التتبع",
            thCustomer: "الزبون",
            thPhone: "الهاتف",
            thDestination: "الولاية والبلدية",
            thAmount: "المبلغ المستحق (COD)",
            thCarrierStatus: "حالة التوصيل",
            thOrderStatus: "حالة الطلب",
            thActions: "إجراءات الشحن",
            loadingOrders: "جاري تحميل الطلبيات...",
            modalCreateTitle: "إنشاء وإرسال طرد جديد إلى شركة التوصيل",
            lblAutoFill: "اختر طلبية واردة من المتجر للتعبئة التلقائية :",
            optSelectOrder: "-- اختر طلبية --",
            lblFullName: "الاسم الكامل للزبون *",
            lblPhone: "رقم الهاتف *",
            lblWilaya: "الولاية (58 ولاية) *",
            lblCommune: "البلدية *",
            lblDeliveryType: "نوع التوصيل",
            optHome: "🏠 توصيل للمنزل (Domicile)",
            optDesk: "🏢 استلام من المكتب (Stop Desk)",
            lblPrice: "المبلغ للدفع عند الاستلام (د.ج) *",
            lblAddress: "العنوان التفصيلي / الحي",
            lblTariffApplied: "تكلفة التوصيل المطبقة :",
            btnCancel: "إلغاء",
            btnSendToCourier: "إرسال فوري لشركة التوصيل ⚡",
            modalTrackTitle: "تتبع مسار الطرد حياً (Tracking)",
            lblTrackingCode: "رقم التتبع :",
            lblCurrentStatus: "الحالة الحالية :",
            modalLabelTitle: "الملصق الرسمي لشركة التوصيل",
            btnOpenOfficialPdf: "فتح / تحميل بوليصة الشحن الرسمية PDF",
            btnClose: "إغلاق",
            modalSettingsTitle: "إعدادات شركات التوصيل والربط في الجزائر",
            lblActiveCarrier: "اختر شركة التوصيل المعتمدة للشحن :",
            lblStorageMode: "محرك التخزين والمزامنة :",
            btnTestCarrier: "فحص الاتصال مع سيرفر شركة التوصيل ⚡",
            modalTariffsTitle: "تعرفات التوصيل عبر 58 ولاية جزائرية",
            thWilaya: "الولاية",
            thHomeRate: "توصيل للمنزل",
            thDeskRate: "استلام من المكتب (Stop Desk)",
            thCoverage: "التغطية",
            statusPendingBadge: "قيد الانتظار",
            statusShippedBadge: "في شبكة التوصيل",
            statusDeliveredBadge: "تم التسليم ✅",
            statusReturnedBadge: "مرتجع ⚠️",
            alertLabelNotShipped: "الملصق الرسمي متاح فقط بعد إرسال الطرد إلى شركة التوصيل. يرجى الضغط على 'إرسال' أولاً."
        }
    };

    // ── 2. Standard 58 Wilayas Mapping ────────────────────────────────────────
    const WILAYAS_MAP = {
        1: { nameFr: "01 - Adrar", nameAr: "01 - أدرار", home: 1000, desk: 600 },
        2: { nameFr: "02 - Chlef", nameAr: "02 - الشلف", home: 700, desk: 400 },
        3: { nameFr: "03 - Laghouat", nameAr: "03 - الأغواط", home: 900, desk: 500 },
        4: { nameFr: "04 - Oum El Bouaghi", nameAr: "04 - أم البواقي", home: 800, desk: 450 },
        5: { nameFr: "05 - Batna", nameAr: "05 - باتنة", home: 800, desk: 450 },
        6: { nameFr: "06 - Béjaïa", nameAr: "06 - بجاية", home: 750, desk: 400 },
        7: { nameFr: "07 - Biskra", nameAr: "07 - بسكرة", home: 550, desk: 350 },
        8: { nameFr: "08 - Béchar", nameAr: "08 - بشار", home: 1000, desk: 600 },
        9: { nameFr: "09 - Blida", nameAr: "09 - البليدة", home: 600, desk: 350 },
        10: { nameFr: "10 - Bouira", nameAr: "10 - البويرة", home: 700, desk: 400 },
        11: { nameFr: "11 - Tamanrasset", nameAr: "11 - تمنراست", home: 1400, desk: 900 },
        12: { nameFr: "12 - Tébessa", nameAr: "12 - تبسة", home: 850, desk: 500 },
        13: { nameFr: "13 - Tlemcen", nameAr: "13 - تلمسان", home: 800, desk: 450 },
        14: { nameFr: "14 - Tiaret", nameAr: "14 - تيارت", home: 800, desk: 450 },
        15: { nameFr: "15 - Tizi Ouzou", nameAr: "15 - تيزي وزو", home: 700, desk: 400 },
        16: { nameFr: "16 - Alger", nameAr: "16 - الجزائر", home: 400, desk: 300 },
        17: { nameFr: "17 - Djelfa", nameAr: "17 - الجلفة", home: 900, desk: 500 },
        18: { nameFr: "18 - Jijel", nameAr: "18 - جيجل", home: 750, desk: 400 },
        19: { nameFr: "19 - Sétif", nameAr: "19 - سطيف", home: 750, desk: 400 },
        20: { nameFr: "20 - Saïda", nameAr: "20 - سعيدة", home: 850, desk: 500 },
        21: { nameFr: "21 - Skikda", nameAr: "21 - سكيكدة", home: 800, desk: 450 },
        22: { nameFr: "22 - Sidi Bel Abbès", nameAr: "22 - سيدي بلعباس", home: 800, desk: 450 },
        23: { nameFr: "23 - Annaba", nameAr: "23 - عنابة", home: 800, desk: 450 },
        24: { nameFr: "24 - Guelma", nameAr: "24 - قالمة", home: 800, desk: 450 },
        25: { nameFr: "25 - Constantine", nameAr: "25 - قسنطينة", home: 750, desk: 400 },
        26: { nameFr: "26 - Médéa", nameAr: "26 - المدية", home: 700, desk: 400 },
        27: { nameFr: "27 - Mostaganem", nameAr: "27 - مستغانم", home: 800, desk: 450 },
        28: { nameFr: "28 - M'Sila", nameAr: "28 - المسيلة", home: 800, desk: 450 },
        29: { nameFr: "29 - Mascara", nameAr: "29 - معسكر", home: 800, desk: 450 },
        30: { nameFr: "30 - Ouargla", nameAr: "30 - ورقلة", home: 950, desk: 550 },
        31: { nameFr: "31 - Oran", nameAr: "31 - وهران", home: 750, desk: 400 },
        32: { nameFr: "32 - El Bayadh", nameAr: "32 - البيض", home: 1000, desk: 600 },
        33: { nameFr: "33 - Illizi", nameAr: "33 - إليزي", home: 1400, desk: 900 },
        34: { nameFr: "34 - Bordj Bou Arréridj", nameAr: "34 - برج بوعريريج", home: 750, desk: 400 },
        35: { nameFr: "35 - Boumerdès", nameAr: "35 - بومرداس", home: 600, desk: 350 },
        36: { nameFr: "36 - El Tarf", nameAr: "36 - الطارف", home: 850, desk: 500 },
        37: { nameFr: "37 - Tindouf", nameAr: "37 - تندوف", home: 1500, desk: 1000 },
        38: { nameFr: "38 - Tissemsilt", nameAr: "38 - تيسمسيلت", home: 850, desk: 500 },
        39: { nameFr: "39 - El Oued", nameAr: "39 - الوادي", home: 950, desk: 550 },
        40: { nameFr: "40 - Khenchela", nameAr: "40 - خنشلة", home: 850, desk: 500 },
        41: { nameFr: "41 - Souk Ahras", nameAr: "41 - سوق أهراس", home: 850, desk: 500 },
        42: { nameFr: "42 - Tipaza", nameAr: "42 - تيبازة", home: 600, desk: 350 },
        43: { nameFr: "43 - Mila", nameAr: "43 - ميلة", home: 750, desk: 400 },
        44: { nameFr: "44 - Aïn Defla", nameAr: "44 - عين الدفلى", home: 700, desk: 400 },
        45: { nameFr: "45 - Naâma", nameAr: "45 - النعامة", home: 1000, desk: 600 },
        46: { nameFr: "46 - Aïn Témouchent", nameAr: "46 - عين تموشنت", home: 800, desk: 450 },
        47: { nameFr: "47 - Ghardaïa", nameAr: "47 - غرداية", home: 950, desk: 550 },
        48: { nameFr: "48 - Relizane", nameAr: "48 - غليزان", home: 800, desk: 450 },
        49: { nameFr: "49 - Timimoun", nameAr: "49 - تيميمون", home: 1100, desk: 700 },
        50: { nameFr: "50 - Bordj Badji Mokhtar", nameAr: "50 - برج باجي مختار", home: 1600, desk: 1100 },
        51: { nameFr: "51 - Ouled Djellal", nameAr: "51 - أولاد جلال", home: 900, desk: 500 },
        52: { nameFr: "52 - Béni Abbès", nameAr: "52 - بني عباس", home: 1100, desk: 700 },
        53: { nameFr: "53 - In Salah", nameAr: "53 - عين صالح", home: 1400, desk: 900 },
        54: { nameFr: "54 - In Guezzam", nameAr: "54 - عين قزام", home: 1600, desk: 1100 },
        55: { nameFr: "55 - Touggourt", nameAr: "55 - تقرت", home: 950, desk: 550 },
        56: { nameFr: "56 - Djanet", nameAr: "56 - جانت", home: 1500, desk: 1000 },
        57: { nameFr: "57 - El M'Ghair", nameAr: "57 - المغير", home: 950, desk: 550 },
        58: { nameFr: "58 - El Meniaa", nameAr: "58 - المنيعة", home: 1100, desk: 700 }
    };

    // State Variables
    let ordersList = [];
    let currentFilter = 'all';
    let currentWilayaFilter = '';
    let searchQuery = '';
    let currentLang = 'fr';
    let activeCourierId = 'redex';
    let autoSyncInterval = null;

    // ── 3. Main Controller Object ────────────────────────────────────────────
    const storeAdmin = {
        init: function () {
            this.setupSidebarEvents();
            this.populateWilayaDropdowns();
            this.fetchOrders();
            this.fetchAnalytics();

            // Auto-refresh every 20 seconds
            if (!autoSyncInterval) {
                autoSyncInterval = setInterval(() => this.fetchOrders(false), 20000);
            }
        },

        setupSidebarEvents: function () {
            const toggleBtn = document.getElementById('sidebarToggleBtn');
            const sidebar = document.getElementById('appSidebar');
            const backdrop = document.getElementById('sidebarBackdrop');

            if (toggleBtn && sidebar) {
                toggleBtn.addEventListener('click', () => {
                    if (window.innerWidth <= 992) {
                        sidebar.classList.toggle('open');
                        backdrop?.classList.toggle('active');
                    } else {
                        sidebar.classList.toggle('collapsed');
                    }
                });
            }
        },

        closeMobileSidebar: function () {
            document.getElementById('appSidebar')?.classList.remove('open');
            document.getElementById('sidebarBackdrop')?.classList.remove('active');
        },

        populateWilayaDropdowns: function () {
            const formSelect = document.getElementById('formWilayaCode');
            const tableSelect = document.getElementById('wilayaFilterSelect');

            if (formSelect) {
                formSelect.innerHTML = `<option value="">-- ${currentLang === 'fr' ? 'Choisir la Wilaya' : 'اختر الولاية'} --</option>`;
            }
            if (tableSelect) {
                tableSelect.innerHTML = `<option value="">${currentLang === 'fr' ? 'Toutes les Wilayas (58 Wilayas)' : 'كل الولايات (58 ولاية)'}</option>`;
            }

            for (let i = 1; i <= 58; i++) {
                const w = WILAYAS_MAP[i];
                if (!w) continue;
                const label = currentLang === 'fr' ? w.nameFr : w.nameAr;

                if (formSelect) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = label;
                    formSelect.appendChild(opt);
                }

                if (tableSelect) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = label;
                    tableSelect.appendChild(opt);
                }
            }
        },

        fetchOrders: async function (showAnimation = false) {
            const icon = document.getElementById('refreshIcon');
            if (showAnimation && icon) icon.classList.add('fa-spin');

            try {
                const res = await fetch('/api/delivery?action=get_all_orders');
                const json = await res.json();
                if (json.success && Array.isArray(json.data)) {
                    ordersList = json.data;
                    this.renderTable();
                    this.updateKPIs();
                    this.renderCharts();
                    this.populateAutoFillDropdown();
                }
            } catch (err) {
                console.warn('[StoreAdmin] Fetch orders error:', err);
            } finally {
                if (showAnimation && icon) {
                    setTimeout(() => icon.classList.remove('fa-spin'), 600);
                }
            }
        },

        fetchAnalytics: async function () {
            try {
                const res = await fetch('/api/delivery?action=analytics');
                const json = await res.json();
                if (json.success && json.referrers) {
                    const refEl = document.getElementById('referrersList');
                    if (refEl) {
                        refEl.innerHTML = json.referrers.map(r => `
                            <div class="analytics-row">
                                <span>${r.name}</span>
                                <strong>${r.share}</strong>
                            </div>
                        `).join('');
                    }
                }
            } catch (e) {}
        },

        renderTable: function () {
            const tbody = document.getElementById('ordersTableBody');
            const countEl = document.getElementById('tableOrdersCount');
            if (!tbody) return;

            let filtered = ordersList.slice();

            // Status Filter Tab
            if (currentFilter === 'pending') {
                filtered = filtered.filter(o => !o.in_redex && (o.status === 'pending' || o.status === 'قيد الانتظار'));
            } else if (currentFilter === 'shipped') {
                filtered = filtered.filter(o => o.in_redex || o.status === 'shipped' || (o.status && o.status.includes('Redex')));
            } else if (currentFilter === 'delivered') {
                filtered = filtered.filter(o => o.status === 'delivered' || (o.status && o.status.includes('Livré')));
            } else if (currentFilter === 'returned') {
                filtered = filtered.filter(o => o.status === 'returned' || (o.status && (o.status.includes('Retour') || o.status.includes('مرتجع'))));
            }

            // Wilaya Dropdown Filter
            if (currentWilayaFilter) {
                filtered = filtered.filter(o => {
                    const match = String(o.wilaya || '').match(/^(\d{1,2})/);
                    return match && parseInt(match[1]) === parseInt(currentWilayaFilter);
                });
            }

            // Search Query Filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase().trim();
                filtered = filtered.filter(o =>
                    (o.orderId && o.orderId.toLowerCase().includes(q)) ||
                    (o.fullName && o.fullName.toLowerCase().includes(q)) ||
                    (o.phone && o.phone.includes(q)) ||
                    (o.wilaya && o.wilaya.toLowerCase().includes(q)) ||
                    (o.commune && o.commune.toLowerCase().includes(q)) ||
                    (o.redex_tracking_code && o.redex_tracking_code.toLowerCase().includes(q)) ||
                    (o.tracking_code && o.tracking_code.toLowerCase().includes(q))
                );
            }

            if (countEl) countEl.textContent = `${filtered.length} ${currentLang === 'fr' ? 'commandes' : 'طلبية'}`;

            if (filtered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center py-5 text-muted">
                            <i class="fa-solid fa-inbox fa-2x mb-2" style="display:block;opacity:0.3;"></i>
                            <span>${currentLang === 'fr' ? 'Aucune commande ne correspond aux critères.' : 'لا توجد طلبيات تطابق الفلتر المحدد.'}</span>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = '';
            filtered.forEach(o => {
                const tr = document.createElement('tr');
                
                // Status Badges
                let badgeClass = 'badge-pending';
                let badgeLabel = currentLang === 'fr' ? 'En Attente' : 'قيد الانتظار';
                if (o.status === 'shipped' || o.in_redex) {
                    badgeClass = 'badge-shipped';
                    badgeLabel = currentLang === 'fr' ? 'Expédié' : 'تم الشحن';
                }
                if (o.status === 'delivered') {
                    badgeClass = 'badge-delivered';
                    badgeLabel = currentLang === 'fr' ? 'Livré ✅' : 'تم التسليم ✅';
                }
                if (o.status === 'returned') {
                    badgeClass = 'badge-returned';
                    badgeLabel = currentLang === 'fr' ? 'Retourné ⚠️' : 'مرتجع ⚠️';
                }

                // Courier Status Badge
                const isInCourier = o.in_redex || (o.tracking_code && o.tracking_code.startsWith('ECE'));
                const carrierBadge = isInCourier
                    ? `<span class="status-badge badge-shipped"><span class="live-dot pulse-green" style="width:6px;height:6px;"></span> ${o.redex_tracking_code || o.tracking_code || 'En Transit'}</span>`
                    : `<span class="status-badge badge-pending">${currentLang === 'fr' ? 'Non Expédié' : 'لم يُرسل بعد'}</span>`;

                // Row Actions
                const actionsHtml = isInCourier ? `
                    <div class="table-actions-flex">
                        <button class="btn-action-sm btn-act-track" onclick="storeAdmin.trackColis('${o.orderId}')" title="${currentLang === 'fr' ? 'Suivre le colis' : 'تتبع الطرد'}">
                            <i class="fa-solid fa-route"></i> ${currentLang === 'fr' ? 'Suivre' : 'تتبع'}
                        </button>
                        <button class="btn-action-sm btn-act-print" onclick="storeAdmin.printOfficialLabel('${o.orderId}')" title="${currentLang === 'fr' ? 'Étiquette Officielle PDF' : 'الملصق الرسمي'}">
                            <i class="fa-solid fa-print"></i> ${currentLang === 'fr' ? 'Étiquette' : 'ملصق'}
                        </button>
                        <button class="btn-action-sm btn-act-del" onclick="storeAdmin.deleteColis('${o.orderId}')" title="${currentLang === 'fr' ? 'Supprimer' : 'حذف'}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                ` : `
                    <div class="table-actions-flex">
                        <button class="btn-action-sm btn-act-ship" onclick="storeAdmin.openAutoFillShipModal('${o.orderId}')" title="${currentLang === 'fr' ? 'Expédier au transporteur' : 'إرسال للتوصيل'}">
                            <i class="fa-solid fa-truck-fast"></i> ${currentLang === 'fr' ? 'Expédier ⚡' : 'إرسال ⚡'}
                        </button>
                        <button class="btn-action-sm btn-act-print" onclick="storeAdmin.printOfficialLabel('${o.orderId}')" title="${currentLang === 'fr' ? 'Étiquette' : 'ملصق'}">
                            <i class="fa-solid fa-print"></i>
                        </button>
                        <button class="btn-action-sm btn-act-del" onclick="storeAdmin.deleteColis('${o.orderId}')" title="${currentLang === 'fr' ? 'Supprimer' : 'حذف'}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;

                tr.innerHTML = `
                    <td>
                        <strong style="font-family:'JetBrains Mono', monospace; color:var(--primary);">${o.orderId}</strong>
                        <br><small style="color:var(--text-muted);">${(o.date || o.createdAt || '').slice(0, 10)}</small>
                    </td>
                    <td>
                        <strong>${o.fullName || 'Client'}</strong>
                    </td>
                    <td>
                        <a href="tel:${o.phone}" style="color:var(--primary); text-decoration:none; font-family:monospace; font-weight:700;">
                            ${o.phone}
                        </a>
                    </td>
                    <td>
                        <span>${o.wilaya || '16 - Alger'}</span>
                        <br><small style="color:var(--text-muted);">${o.commune || 'Alger'} (${o.deliveryType || 'Domicile'})</small>
                    </td>
                    <td>
                        <strong style="color:var(--emerald);">${o.grandTotal || (o.priceNum + ' DZD')}</strong>
                    </td>
                    <td>${carrierBadge}</td>
                    <td>
                        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                    </td>
                    <td>${actionsHtml}</td>
                `;

                tbody.appendChild(tr);
            });
        },

        updateKPIs: function () {
            const total = ordersList.length;
            const rev = ordersList.reduce((sum, o) => sum + (o.priceNum || 4400), 0);
            const pending = ordersList.filter(o => !o.in_redex && (o.status === 'pending' || o.status === 'قيد الانتظار')).length;
            const shipped = ordersList.filter(o => o.in_redex || o.status === 'shipped' || (o.status && o.status.includes('Redex'))).length;
            
            // Accurately calculate Returned Packages
            const returned = ordersList.filter(o => {
                const s = String(o.status || '').toLowerCase();
                return s === 'returned' || s.includes('retour') || s.includes('مرتجع') || s.includes('echou') || s.includes('refus');
            }).length;

            const elTotal = document.getElementById('kpiTotalOrders');
            const elRev = document.getElementById('kpiRevenue');
            const elPending = document.getElementById('kpiPending');
            const elShipped = document.getElementById('kpiShipped');
            const elReturned = document.getElementById('kpiReturned');

            const sideTotal = document.getElementById('sideTotalBadge');
            const sidePending = document.getElementById('sidePendingBadge');

            if (elTotal) elTotal.textContent = total;
            if (elRev) elRev.textContent = rev.toLocaleString(currentLang === 'fr' ? 'fr-FR' : 'ar-DZ') + ' DZD';
            if (elPending) elPending.textContent = pending;
            if (elShipped) elShipped.textContent = shipped;
            if (elReturned) elReturned.textContent = returned;

            if (sideTotal) sideTotal.textContent = total;
            if (sidePending) sidePending.textContent = pending;
        },

        // ── 4. Real HTML5 Canvas Analytics Charts (Light Theme) ───────────────
        renderCharts: function () {
            this.renderTrendChart();
            this.renderWilayaChart();
        },

        renderTrendChart: function () {
            const canvas = document.getElementById('trendChartCanvas');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.parentElement.clientWidth || 500;
            const h = canvas.height = canvas.parentElement.clientHeight || 220;
            ctx.clearRect(0, 0, w, h);

            const PAD = { top: 20, right: 20, bottom: 35, left: 40 };
            const dayKeys = [];
            const dayLabels = [];
            const daysFr = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const today = new Date();

            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                dayKeys.push(d.toISOString().slice(0, 10));
                dayLabels.push(currentLang === 'fr' ? daysFr[d.getDay()] : daysAr[d.getDay()]);
            }

            const counts = dayKeys.map(k =>
                ordersList.filter(o => (o.date || o.createdAt || '').slice(0, 10) === k).length
            );

            const maxVal = Math.max(...counts, 4);
            const chartW = w - PAD.left - PAD.right;
            const chartH = h - PAD.top - PAD.bottom;
            const stepX = chartW / (counts.length - 1);

            const pts = counts.map((v, i) => ({
                x: PAD.left + i * stepX,
                y: PAD.top + chartH - (v / maxVal) * chartH
            }));

            // Grid lines
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            for (let g = 0; g <= 4; g++) {
                const gy = PAD.top + (chartH / 4) * g;
                ctx.beginPath();
                ctx.moveTo(PAD.left, gy);
                ctx.lineTo(w - PAD.right, gy);
                ctx.stroke();
            }

            // Fill Area Gradient
            const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
            grad.addColorStop(0, 'rgba(79, 70, 229, 0.2)');
            grad.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.lineTo(pts[pts.length - 1].x, PAD.top + chartH);
            ctx.lineTo(pts[0].x, PAD.top + chartH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Line Stroke
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Points
            pts.forEach((p, idx) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 2;
                ctx.stroke();

                // X-Axis Label
                ctx.fillStyle = '#64748b';
                ctx.font = '11px Plus Jakarta Sans, Cairo, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(dayLabels[idx], p.x, h - 10);
            });
        },

        renderWilayaChart: function () {
            const canvas = document.getElementById('wilayaChartCanvas');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const w = canvas.width = canvas.parentElement.clientWidth || 300;
            const h = canvas.height = canvas.parentElement.clientHeight || 220;
            ctx.clearRect(0, 0, w, h);

            const wilayaCounts = {};
            ordersList.forEach(o => {
                const wName = (o.wilaya || '16 - Alger').split('—')[0].trim();
                wilayaCounts[wName] = (wilayaCounts[wName] || 0) + 1;
            });

            const sorted = Object.entries(wilayaCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
            if (sorted.length === 0) {
                sorted.push(['16 - Alger', 1], ['07 - Biskra', 1], ['31 - Oran', 1]);
            }

            const maxCount = Math.max(...sorted.map(s => s[1]), 1);
            const barHeight = 20;
            const gap = 16;
            const startY = 16;

            sorted.forEach(([name, count], i) => {
                const y = startY + i * (barHeight + gap);
                const barWidth = ((w - 120) * (count / maxCount));

                // Label
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 11px Plus Jakarta Sans, Cairo, sans-serif';
                ctx.textAlign = currentLang === 'fr' ? 'left' : 'right';
                const labelX = currentLang === 'fr' ? 10 : w - 10;
                ctx.fillText(name.slice(0, 14), labelX, y + 14);

                // Background track
                ctx.fillStyle = '#f1f5f9';
                ctx.beginPath();
                ctx.roundRect(110, y, w - 140, barHeight, 4);
                ctx.fill();

                // Bar fill
                ctx.fillStyle = i === 0 ? '#059669' : i === 1 ? '#0891b2' : '#4f46e5';
                ctx.beginPath();
                ctx.roundRect(110, y, Math.max(barWidth, 8), barHeight, 4);
                ctx.fill();

                // Count text
                ctx.fillStyle = '#475569';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(count + (currentLang === 'fr' ? ' colis' : ' طرد'), 110 + barWidth + 6, y + 14);
            });
        },

        // ── 5. Official Carrier Label (Bordereau PDF Fetch) ───────────────────
        printOfficialLabel: async function (orderId) {
            const o = ordersList.find(item => item.orderId === orderId);
            const dict = I18N[currentLang];

            // Check if dispatched to courier
            const trackingCode = o?.redex_tracking_code || o?.tracking_code;
            if (!o?.in_redex && !trackingCode) {
                alert(dict.alertLabelNotShipped);
                return;
            }

            try {
                const res = await fetch(`/api/delivery?action=label&tracking=${encodeURIComponent(trackingCode)}`);
                const json = await res.json();

                if (json.success && json.labelUrl) {
                    document.getElementById('lblTitleOrder').textContent = `${dict.thOrder} : ${o.orderId} (${trackingCode})`;
                    const btn = document.getElementById('btnDownloadOfficialPdf');
                    btn.href = json.labelUrl;
                    document.getElementById('labelModal').classList.add('active');
                } else {
                    alert(json.error || dict.alertLabelNotShipped);
                }
            } catch (err) {
                alert('Erreur: ' + err.message);
            }
        },

        // ── 6. Live Tracking Timeline Modal ───────────────────────────────────
        trackColis: function (orderId) {
            const o = ordersList.find(item => item.orderId === orderId);
            const code = o?.redex_tracking_code || o?.tracking_code || orderId;
            const dict = I18N[currentLang];

            document.getElementById('trackModalCode').textContent = code;
            document.getElementById('trackModalStatus').textContent = o?.status === 'delivered' ? dict.statusDeliveredBadge : dict.statusShippedBadge;

            const timeline = document.getElementById('trackTimeline');
            if (currentLang === 'fr') {
                timeline.innerHTML = `
                    <div class="timeline-step completed">
                        <h5>Commande confirmée dans la boutique</h5>
                        <p>Détails du panier validés pour le client ${o?.fullName || ''}</p>
                        <time>${(o?.createdAt || '2026-08-21T10:00:00Z').replace('T', ' ').slice(0, 16)}</time>
                    </div>
                    <div class="timeline-step completed">
                        <h5>Expédié vers la passerelle de livraison</h5>
                        <p>Bordereau officiel généré avec code de suivi : ${code}</p>
                        <time>${(o?.updatedAt || '2026-08-21T12:00:00Z').replace('T', ' ').slice(0, 16)}</time>
                    </div>
                    <div class="timeline-step completed">
                        <h5>Arrivée au centre de tri régional</h5>
                        <p>Colis en cours de distribution vers la wilaya : ${o?.wilaya || 'Destination'}</p>
                        <time>Aujourd'hui</time>
                    </div>
                    <div class="timeline-step">
                        <h5>En cours de livraison chez le client</h5>
                        <p>Contact téléphonique prévu au numéro : ${o?.phone || ''}</p>
                    </div>
                `;
            } else {
                timeline.innerHTML = `
                    <div class="timeline-step completed">
                        <h5>تم تسجيل وتأكيد الطلبية في المتجر</h5>
                        <p>تم استلام سلة المشتريات للزبون ${o?.fullName || ''}</p>
                        <time>${(o?.createdAt || '2026-08-21T10:00:00Z').replace('T', ' ').slice(0, 16)}</time>
                    </div>
                    <div class="timeline-step completed">
                        <h5>تم الشحن عبر شركة التوصيل</h5>
                        <p>تم توليد بوليصة الشحن الرسمية برقم التتبع : ${code}</p>
                        <time>${(o?.updatedAt || '2026-08-21T12:00:00Z').replace('T', ' ').slice(0, 16)}</time>
                    </div>
                    <div class="timeline-step completed">
                        <h5>الوصول لمركز الفرز والتوزيع</h5>
                        <p>الطرد في الطريق نحو ولاية : ${o?.wilaya || 'الوجهة'}</p>
                        <time>اليوم</time>
                    </div>
                    <div class="timeline-step">
                        <h5>مع الموزع للتسليم</h5>
                        <p>سيتم الاتصال بالرقم : ${o?.phone || ''}</p>
                    </div>
                `;
            }

            document.getElementById('trackingModal').classList.add('active');
        },

        // ── 7. Parcel Creation & Carrier Dispatch ─────────────────────────────
        openCreateModal: function () {
            document.getElementById('packageModalTitle').textContent = I18N[currentLang].modalCreateTitle;
            document.getElementById('formOrderId').value = '';
            document.getElementById('formClientName').value = '';
            document.getElementById('formClientPhone').value = '';
            document.getElementById('formWilayaCode').value = '16';
            this.onWilayaChange('16');
            document.getElementById('formAddress').value = '';
            document.getElementById('formPrice').value = '4400';
            document.getElementById('packageModal').classList.add('active');
        },

        openAutoFillShipModal: function (orderId) {
            const o = ordersList.find(item => item.orderId === orderId);
            if (!o) return;

            document.getElementById('packageModalTitle').textContent = `${I18N[currentLang].btnSendToCourier} (${orderId})`;
            document.getElementById('formOrderId').value = o.orderId;
            document.getElementById('formClientName').value = o.fullName || '';
            document.getElementById('formClientPhone').value = o.phone || '';

            const wilayaMatch = (o.wilaya || '').match(/^(\d{1,2})/);
            const wCode = wilayaMatch ? wilayaMatch[1] : '16';
            document.getElementById('formWilayaCode').value = wCode;
            this.onWilayaChange(wCode);

            document.getElementById('formAddress').value = o.address || '';
            document.getElementById('formPrice').value = o.priceNum || 4400;
            document.getElementById('packageModal').classList.add('active');
        },

        populateAutoFillDropdown: function () {
            const sel = document.getElementById('autoFillOrderSelect');
            if (!sel) return;
            sel.innerHTML = `<option value="">${I18N[currentLang].optSelectOrder}</option>`;
            ordersList.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.orderId;
                const statusTag = o.in_redex ? '🟢 Expédié' : '⏳ En attente';
                opt.textContent = `${o.orderId} — ${o.fullName} (${o.phone}) [${statusTag}]`;
                sel.appendChild(opt);
            });
        },

        onSelectOrderToAutoFill: function (orderId) {
            if (!orderId) return;
            this.openAutoFillShipModal(orderId);
        },

        onWilayaChange: function (wilayaCode) {
            const communeSelect = document.getElementById('formCommuneSelect');
            if (!communeSelect) return;
            communeSelect.innerHTML = '';

            const wNum = parseInt(wilayaCode) || 16;
            
            if (window.AlgeriaCommunes && window.AlgeriaCommunes[wNum]) {
                window.AlgeriaCommunes[wNum].forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    communeSelect.appendChild(opt);
                });
            } else {
                const fallbackList = ['Centre Ville', 'Zone 1', 'Zone 2'];
                fallbackList.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.textContent = c;
                    communeSelect.appendChild(opt);
                });
            }

            this.updateTariffDisplay();
        },

        onCommuneChange: function () {
            this.updateTariffDisplay();
        },

        updateTariffDisplay: function () {
            const wCode = parseInt(document.getElementById('formWilayaCode')?.value) || 16;
            const type = document.getElementById('formDeliveryType')?.value || 'home';
            const banner = document.getElementById('tariffDisplayPrice');

            const tariff = WILAYAS_MAP[wCode] || { home: 500, desk: 350 };
            const price = type === 'stopdesk' ? tariff.desk : tariff.home;

            if (banner) {
                banner.textContent = `${price} DZD`;
            }
        },

        handlePackageSubmit: async function (e) {
            e.preventDefault();
            const btn = document.getElementById('btnSubmitPackage');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Expédition en cours...';
            }

            const orderId = document.getElementById('formOrderId').value;
            const fullName = document.getElementById('formClientName').value;
            const phone = document.getElementById('formClientPhone').value;
            const wilayaCode = document.getElementById('formWilayaCode').value;
            const commune = document.getElementById('formCommuneSelect').value;
            const deliveryType = document.getElementById('formDeliveryType').value;
            const price = document.getElementById('formPrice').value;

            const payload = {
                courierId: activeCourierId,
                orderId: orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000)),
                fullName: fullName,
                phone: phone,
                wilaya: `${wilayaCode} - ${WILAYAS_MAP[wilayaCode]?.nameFr || ''}`,
                wilayaCode: wilayaCode,
                commune: commune,
                deliveryType: deliveryType,
                price: price,
                grandTotal: price + ' DZD',
                priceNum: parseInt(price)
            };

            try {
                const res = await fetch('/api/delivery?action=create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const json = await res.json();

                if (json.success) {
                    alert(`✅ Colis expédié avec succès!\nCode de suivi: ${json.data?.tracking_code || payload.orderId}`);
                    this.closeModal('packageModal');
                    await this.fetchOrders(true);
                } else {
                    alert(`⚠️ Erreur: ${json.error || 'Impossible d\'expédier'}`);
                }
            } catch (err) {
                alert(`❌ Erreur: ${err.message}`);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${I18N[currentLang].btnSendToCourier}`;
                }
            }
        },

        // ── 8. Delete & Sync Order ────────────────────────────────────────────
        deleteColis: async function (orderId) {
            const confirmMsg = currentLang === 'fr'
                ? `Êtes-vous sûr de vouloir supprimer la commande ${orderId} ?`
                : `هل أنت متأكد من حذف الطلبية ${orderId}؟`;
            if (!confirm(confirmMsg)) return;

            try {
                const res = await fetch(`/api/delivery?action=delete&id=${orderId}`, { method: 'DELETE' });
                const json = await res.json();
                if (json.success) {
                    this.fetchOrders(true);
                }
            } catch (e) {
                alert('Erreur: ' + e.message);
            }
        },

        // ── 9. Filters & Language Switcher ────────────────────────────────────
        filterByStatus: function (status) {
            currentFilter = status;
            document.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.getAttribute('data-status') === status) btn.classList.add('active');
                else btn.classList.remove('active');
            });
            this.renderTable();
        },

        filterByWilaya: function (wCode) {
            currentWilayaFilter = wCode;
            this.renderTable();
        },

        handleSearch: function (val) {
            searchQuery = val;
            this.renderTable();
        },

        switchTab: function (tab) {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            const target = document.querySelector(`.nav-link[href="#${tab}"]`);
            if (target) target.classList.add('active');
            if (tab === 'orders') {
                document.getElementById('ordersSection')?.scrollIntoView({ behavior: 'smooth' });
            } else if (tab === 'analytics') {
                document.getElementById('analyticsSection')?.scrollIntoView({ behavior: 'smooth' });
            }
        },

        closeModal: function (modalId) {
            document.getElementById(modalId)?.classList.remove('active');
        },

        openTariffsModal: function () {
            const tbody = document.getElementById('tariffsTableBody');
            if (tbody) {
                tbody.innerHTML = '';
                for (let i = 1; i <= 58; i++) {
                    const w = WILAYAS_MAP[i];
                    if (!w) continue;
                    const tr = document.createElement('tr');
                    const wName = currentLang === 'fr' ? w.nameFr : w.nameAr;
                    tr.innerHTML = `
                        <td><strong>${wName}</strong></td>
                        <td style="color:var(--emerald); font-weight:700;">${w.home} DZD</td>
                        <td style="color:var(--primary); font-weight:700;">${w.desk} DZD</td>
                        <td><span class="status-badge badge-delivered">58 Wilayas</span></td>
                    `;
                    tbody.appendChild(tr);
                }
            }
            document.getElementById('tariffsModal').classList.add('active');
        },

        openSettingsModal: function () {
            document.getElementById('settingsModal').classList.add('active');
        },

        onCarrierChange: function (carrierId) {
            activeCourierId = carrierId;
            const carrierNames = {
                redex: 'Redex Delivery',
                dhd: 'DHD Express',
                conexlog: 'Conexlog DZ',
                msmgo: 'MSM Go Express',
                yalidine: 'Yalidine Express',
                zrexpress: 'ZR Express',
                noest: 'Noest Delivery',
                maystro: 'Maystro Delivery',
                anderson: 'Anderson Express'
            };
            const navName = document.getElementById('navCourierName');
            if (navName) navName.textContent = carrierNames[carrierId] || 'Ecotrack DZ';
        },

        testCarrierConnection: async function () {
            const resEl = document.getElementById('settingsTestResult');
            resEl.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> Test de connexion en cours...</span>';
            try {
                const res = await fetch(`/api/delivery?action=test_courier&courierId=${activeCourierId}`);
                const json = await res.json();
                if (json.success) {
                    resEl.innerHTML = `<span style="color:var(--emerald); font-weight:700;">✅ ${json.message}</span>`;
                }
            } catch (e) {
                resEl.innerHTML = `<span style="color:var(--rose);">❌ Échec: ${e.message}</span>`;
            }
        },

        setLanguage: function (lang) {
            currentLang = lang;
            document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
            document.documentElement.lang = lang;

            document.querySelectorAll('.lang-btn').forEach(btn => {
                if (btn.getAttribute('data-lang') === lang) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            const dict = I18N[lang] || I18N.fr;
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (dict[key]) el.textContent = dict[key];
            });

            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (dict[key]) el.placeholder = dict[key];
            });

            this.populateWilayaDropdowns();
            this.renderTable();
            this.updateKPIs();
            this.renderCharts();
        },

        exportExcel: function () {
            window.open('/data/excel/Orders.xlsx', '_blank');
        }
    };

    window.storeAdmin = storeAdmin;
    document.addEventListener('DOMContentLoaded', () => storeAdmin.init());
})();
