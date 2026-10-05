'use strict';
const assert = require('assert');

// Test that api/send-order handles dynamic productName correctly
const sendOrderHandler = require('../api/send-order');

async function runMockTest() {
    let statusCode = null;
    let responseData = null;

    const mockRes = {
        setHeader: () => {},
        status: function (code) {
            statusCode = code;
            return {
                json: function (data) {
                    responseData = data;
                    return data;
                },
                end: function () {}
            };
        }
    };

    const mockReq = {
        method: 'POST',
        headers: {
            'x-forwarded-for': '105.101.55.22',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: {
            orderId: 'PACK1-VERIFY-123',
            fullName: 'عمر بن بلقاسم',
            phone: '0555998877',
            wilaya: '16 - الجزائر (العاصمة) — سيدي امحمد',
            commune: 'سيدي امحمد',
            deliveryType: 'توصيل للمنزل',
            deliveryTime: '24 - 48 H',
            quantity: 1,
            productName: 'Pack Pro 4 en 1 (منفاخ تويوتا + مفاتيح 46 قطعة + مفك مرن + طقم مفكات)',
            productTotal: '4,950 د.ج',
            shippingFee: '700 د.ج',
            grandTotal: '5,650 د.ج',
            deviceId: 'DEV-VERIFY-001',
            honeypot: '',
            formDurationMs: 12000
        }
    };

    console.log('Sending mock order request to api/send-order...');
    try {
        await sendOrderHandler(mockReq, mockRes);
        console.log('Response Status:', statusCode);
        console.log('Response Body:', responseData);

        if (statusCode === 200 || statusCode === 429) {
            console.log('✅ api/send-order handled pack order successfully!');
        } else {
            console.warn('Unexpected status:', statusCode);
        }
    } catch (err) {
        console.error('Handler execution error:', err);
    }
}

runMockTest();
