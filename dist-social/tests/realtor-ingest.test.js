"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require('node:assert/strict');
const ingest = require('../lib/realtor/ingest');
module.exports = [
    {
        name: 'ingest parse project name from listing title',
        fn: () => {
            assert.equal(ingest.parseProjectName('3 BHK Flats in Prestige Lakeside Habitat, Bengaluru | 99acres'), 'Prestige Lakeside Habitat');
        }
    },
    {
        name: 'ingest parse project name strips site suffix',
        fn: () => {
            assert.equal(ingest.parseProjectName('Lodha Crown in Worli, Mumbai | MagicBricks'), 'Lodha Crown');
        }
    },
    {
        name: 'ingest parse project name falls back to text',
        fn: () => {
            assert.equal(ingest.parseProjectName('', '2 BHK Apartment in Adarsh Palm Meadows, Bengaluru'), 'Adarsh Palm Meadows');
        }
    },
    {
        name: 'ingest pick primary image skips tracking/logo urls',
        fn: () => {
            const images = [
                'https://img.example.com/logo.png',
                'https://img.example.com/tracking-pixel.gif',
                'https://img.example.com/property/cover-photo.jpg'
            ];
            assert.equal(ingest.pickPrimaryImage(images), 'https://img.example.com/property/cover-photo.jpg');
        }
    },
    {
        name: 'ingest pick primary image rejects small sized images',
        fn: () => {
            const images = ['https://img.example.com/thumb.jpg?w=80', 'https://img.example.com/full.jpg?w=800'];
            assert.equal(ingest.pickPrimaryImage(images), 'https://img.example.com/full.jpg?w=800');
        }
    },
    {
        name: 'ingest pick primary image returns empty when none valid',
        fn: () => {
            assert.equal(ingest.pickPrimaryImage(['data:image/png;base64,xx', '', 'not-a-url']), '');
        }
    },
    {
        name: 'ingest build result extracts brief from scraped listing',
        fn: () => {
            const result = ingest.buildIngestResult({
                url: 'https://www.99acres.com/property/1',
                title: '3 BHK Flats in Prestige Lakeside Habitat, Bengaluru | 99acres',
                text: '3 BHK ready to move in Sarjapur, Bengaluru for ₹1.2 crore. Possession by Dec 2026.',
                images: ['https://img.example.com/cover.jpg']
            });
            assert.equal(result.source, '99acres.com');
            assert.equal(result.brief.projectName, 'Prestige Lakeside Habitat');
            assert.equal(result.brief.bhk, '3 BHK');
            assert.equal(result.brief.city, 'Bengaluru');
            assert.ok(result.brief.price);
            assert.equal(result.brief.image, 'https://img.example.com/cover.jpg');
            assert.ok(Array.isArray(result.missing));
            assert.equal(result.brief.whatsappNumber, undefined);
            assert.equal(result.brief.message, undefined);
        }
    },
    {
        name: 'ingest build result keeps brief free of ad-only fields',
        fn: () => {
            const result = ingest.buildIngestResult({
                url: 'https://www.magicbricks.com/property/9',
                title: '2 BHK in Gurugram | MagicBricks',
                text: '2 BHK apartment in Gurugram.',
                images: []
            });
            assert.equal(result.brief.pageId, undefined);
            assert.equal(result.brief.adAccountId, undefined);
            assert.equal(result.brief.dailyBudget, undefined);
            assert.equal(result.brief.destination, undefined);
        }
    },
    {
        name: 'ingest source url extracts hostname',
        fn: () => {
            assert.equal(ingest._private.sourceFromUrl('https://www.nobroker.in/property/1'), 'nobroker.in');
        }
    },
    {
        name: 'ingest rejects invalid urls before launching browser',
        fn: async () => {
            await assert.rejects(() => ingest.ingestListingUrl('not-a-url'), /Invalid listing URL/);
        }
    }
];
