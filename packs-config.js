/**
 * =============================================================================
 * ORVA STORE — Multi-Product Packs Planner & Central Configuration System
 * =============================================================================
 * Defines pack architectures, pricing structures, included bundle items,
 * themes (Light + Red Accent), and metadata for dynamic landing page generation.
 * =============================================================================
 */

(function (global) {
    'use strict';

    const PACKS_CONFIG = {
        // ── Pack 1: Tools & Maintenance 4-in-1 Pack ─────────────────────────
        'PACK_001': {
            packId: 'PACK_001',
            skuId: 'SKU_MULTI_01',
            slug: 'pack1',
            packName: 'باك الخدمة والصيانة 4 في 1 — منفاخ TOYOTA وطقم مفاتيح ومفكات',
            shortTitle: 'باك الخدمة والصيانة (4 في 1)',
            badge: '🔥 4 أدوات أساسية في باك واحد',
            price: 4950,
            originalPrice: 9750,
            discount: '49% تخفيض',
            currency: 'د.ج',
            deliveryNote: 'التوصيل متوفر لجميع 58 ولاية والدفع عند الاستلام (COD)',
            description: 'باك عملي ومتكامل للسيارة والمنزل: منفاخ عجلات TOYOTA، علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO، مفك مرن 11 قطعة، وطقم 6 مفكات.',
            heroImage: 'pack 1 4950/pack1 4950.webp',
            heroGallery: [
                'pack 1 4950/pack1 4950.webp',
                'pack 1 4950/IMG_4461.webp',
                'pack 1 4950/IMG_4462.webp',
                'pack 1 4950/IMG_4465.webp',
                'pack 1 4950/IMG_4528.webp'
            ],
            theme: {
                name: 'light-red-prime',
                mode: 'light',
                primaryColor: '#D90429',       // Vibrant energetic red
                primaryHover: '#EF233C',
                accentColor: '#D90429',
                accentSoft: 'rgba(217, 4, 41, 0.08)',
                accentBorder: 'rgba(217, 4, 41, 0.25)',
                bgColor: '#F8F9FA',
                cardBg: '#FFFFFF',
                textColor: '#0F172A',
                mutedColor: '#64748B'
            },
            features: [
                'منفاخ عجلات TOYOTA Accessories مع عداد ضغط مدمج',
                'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO مع كليكي',
                'مفك مرن STARLCE PRO – 11 قطعة للأماكن الضيقة',
                'طقم مفكات 6 قطع بمقابض مريحة للاستعمال اليومي',
                'ضمان الجودة ومعاينة السلعة قبل دفع المستحقات',
                'توصيل لجميع الولايات والدفع عند الاستلام'
            ],
            products: [
                {
                    id: 'PROD_01',
                    name: 'منفاخ عجلات TOYOTA Accessories',
                    category: 'منفاخ عجلات',
                    price: 2400,
                    image: 'pack 1 4950/pack1 4950.webp',
                    badge: 'عداد ضغط مدمج',
                    isGift: false,
                    description: 'منفاخ عملي ومثالي للسيارة مع عداد ضغط لمراقبة العجلات.'
                },
                {
                    id: 'PROD_02',
                    name: 'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
                    category: 'طقم مفاتيح وراتشيت',
                    price: 1800,
                    image: 'pack 1 4950/IMG_4461.webp',
                    badge: 'طقم متكامل 46 قطعة',
                    isGift: false,
                    description: 'طقم متكامل مع ذراع Ratchet ورؤوس صيانة متعددة.'
                },
                {
                    id: 'PROD_03',
                    name: 'مفك مرن STARLCE PRO – 11 قطعة',
                    category: 'مفك مرن متعدد الرؤوس',
                    price: 1100,
                    image: 'pack 1 4950/IMG_4462.webp',
                    badge: 'للأماكن الضيقة',
                    isGift: false,
                    description: 'خرطوم مرن مع رؤوس متعددة للوصول للزوايا الصعبة.'
                },
                {
                    id: 'PROD_04',
                    name: 'طقم مفكات 6 قطع',
                    category: 'مفكات يدوية',
                    price: 900,
                    image: 'pack 1 4950/IMG_4465.webp',
                    badge: '6 مفكات متنوعة',
                    isGift: false,
                    description: 'مفكات بمقابض مريحة لمختلف أعمال الفك والتركيب.'
                }
            ]
        },

        // ── Pack 2: Pro Tools & Workshop 5-in-1 Pack ────────────────────────
        'PACK_002': {
            packId: 'PACK_002',
            skuId: 'SKU_MULTI_02',
            slug: 'pack2',
            packName: 'باك المحترفين والورشة 5 في 1 — ماكينة CROWN 20V ومضخة ماء وطقم مفاتيح',
            shortTitle: 'باك المحترفين والورشة (5 في 1)',
            badge: '🔥 5 أدوات احترافية في باك واحد',
            price: 12950,
            originalPrice: 21250,
            discount: '39% تخفيض',
            currency: 'د.ج',
            deliveryNote: 'التوصيل متوفر لجميع 58 ولاية والدفع عند الاستلام (COD)',
            description: 'باك عملي ومتكامل للورشة والصيانة والمنزل: ماكينة CROWN 20V ببطاريتين و29 قطعة، مضخة ماء لاسلكية، علبة مفاتيح 46 قطعة، مفك مرن 11 قطعة، وقفازات GILAN.',
            heroImage: 'pack2 12950/pack2 12950.webp',
            heroGallery: [
                'pack2 12950/pack2 12950.webp',
                'pack2 12950/IMG_4459.webp',
                'pack2 12950/IMG_4461.webp',
                'pack2 12950/IMG_4525.webp',
                'pack2 12950/IMG_4541.webp'
            ],
            theme: {
                name: 'light-red-sport',
                mode: 'light',
                primaryColor: '#E63946',       // Vibrant deep crimson
                primaryHover: '#D90429',
                accentColor: '#E63946',
                accentSoft: 'rgba(230, 57, 70, 0.08)',
                accentBorder: 'rgba(230, 57, 70, 0.25)',
                bgColor: '#F8F9FA',
                cardBg: '#FFFFFF',
                textColor: '#0F172A',
                mutedColor: '#64748B'
            },
            features: [
                'ماكينة ثقب CROWN 20V الأصلية مع بطاريتين 20V و29 قطعة وملحق',
                'مضخة ماء لاسلكية متعددة الاستعمالات لغسيل السيارات والساحات',
                'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO مع ذراع Ratchet',
                'مفك مرن STARLCE PRO – 11 قطعة للأماكن الضيقة والصعبة',
                'قفازات حماية احترافية GILAN لمقاومة الانزلاق',
                'توصيل لجميع الولايات والدفع عند الاستلام'
            ],
            products: [
                {
                    id: 'PROD_05',
                    name: 'ماكينة ثقب CROWN 20V الأصلية (2 بطاريات + 29 قطعة)',
                    category: 'ماكينات ثقب لاسلكية',
                    price: 6500,
                    image: 'pack2 12950/IMG_4525.webp',
                    badge: '2 بطاريات 20V',
                    isGift: false,
                    description: 'ماكينة ثقب وفك قوية مع بطاريتين 20V وحقيبة تحتوي على 29 ملحقاً.'
                },
                {
                    id: 'PROD_06',
                    name: 'مضخة ماء لاسلكية للتنظيف والغسيل',
                    category: 'مضخات غسيل',
                    price: 3200,
                    image: 'pack2 12950/IMG_4541.webp',
                    badge: 'ضغط عالي',
                    isGift: false,
                    description: 'مضخة عملية لغسيل السيارات، الساحات ومختلف أعمال التنظيف اليومية.'
                },
                {
                    id: 'PROD_07',
                    name: 'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
                    category: 'طقم مفاتيح وراتشيت',
                    price: 1800,
                    image: 'pack2 12950/IMG_4461.webp',
                    badge: 'طقم متكامل 46 قطعة',
                    isGift: false,
                    description: 'طقم متكامل مع ذراع Ratchet ورؤوس صيانة متعددة.'
                },
                {
                    id: 'PROD_08',
                    name: 'مفك مرن STARLCE PRO – 11 قطعة',
                    category: 'مفك مرن متعدد الرؤوس',
                    price: 1100,
                    image: 'pack2 12950/IMG_4460.webp',
                    badge: 'للأماكن الضيقة',
                    isGift: false,
                    description: 'خرطوم مرن مع رؤوس متعددة للوصول للزوايا الصعبة.'
                },
                {
                    id: 'PROD_09',
                    name: 'قفازات عمل وحماية احترافية GILAN',
                    category: 'معدات حماية',
                    price: 350,
                    image: 'pack2 12950/IMG_4470.webp',
                    badge: 'مقاومة للانزلاق',
                    isGift: false,
                    description: 'قفازات عمل مريحة توفر قبضة محكمة وحماية تامة لليدين أثناء الصيانة.'
                }
            ]
        }
    };

    /**
     * Helper utilities to query pack plans
     */
    function getPackById(packId) {
        return PACKS_CONFIG[packId] || null;
    }

    function getAllPacks() {
        return Object.values(PACKS_CONFIG);
    }

    const exporter = {
        PACKS_CONFIG,
        getPackById,
        getAllPacks
    };

    // Browser environment
    if (typeof window !== 'undefined') {
        window.PACKS_CONFIG = PACKS_CONFIG;
        window.getPackById = getPackById;
        window.getAllPacks = getAllPacks;
    }

    // Node.js module environment
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exporter;
    }

})(typeof window !== 'undefined' ? window : globalThis);
